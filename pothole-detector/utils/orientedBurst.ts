/**
 * orientedBurst.ts
 *
 * Collects a pothole-detection accelerometer burst with on-device reorientation.
 * The phone uses its gyroscope to continuously track its own rotation during the
 * burst window, so the backend receives world-frame vertical acceleration
 * regardless of how the phone is mounted or held.
 *
 * Requires:  npx expo install expo-sensors
 *
 * Usage:
 *   import { collectOrientedBurst } from './orientedBurst';
 *
 *   const burst = await collectOrientedBurst();
 *   await fetch('https://your-api/events', {
 *     method: 'POST',
 *     headers: { 'Content-Type': 'application/json' },
 *     body: JSON.stringify({
 *       device_id: deviceId,
 *       latitude,
 *       longitude,
 *       detected_at: new Date().toISOString(),
 *       accel_burst: burst,         // <-- drop in directly
 *     }),
 *   });
 */

import { Accelerometer, Gyroscope } from 'expo-sensors';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface OrientedBurst {
  /** World-frame vertical acceleration in m/s², DC-offset removed. */
  z_values: number[];
  /** Unix timestamps in integer milliseconds, one per sample. */
  timestamps_ms: number[];
}

export interface CollectOptions {
  /**
   * How long to record the burst in ms.
   * Default 500 ms → ~50 samples at 100 Hz (actual mobile sensor delivery rate).
   */
  durationMs?: number;
  /** Target sensor polling rate in Hz. Default 200. */
  sampleRateHz?: number;
  /**
   * Pre-burst window used to estimate the static gravity direction (ms).
   * The phone should be roughly still during this period.
   * Default 100 ms.
   */
  settleMs?: number;
}

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

type Vec3 = readonly [number, number, number];
type Quat = readonly [number, number, number, number]; // [w, x, y, z]

// ---------------------------------------------------------------------------
// Vector math
// ---------------------------------------------------------------------------

function vMag(v: Vec3): number {
  return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
}

function vNorm(v: Vec3): Vec3 {
  const m = vMag(v);
  return m < 1e-12 ? [0, 0, 1] : [v[0] / m, v[1] / m, v[2] / m];
}

function vDot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function vCross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

// ---------------------------------------------------------------------------
// Quaternion math
// ---------------------------------------------------------------------------

const IDENTITY: Quat = [1, 0, 0, 0];

function qMul(a: Quat, b: Quat): Quat {
  const [aw, ax, ay, az] = a;
  const [bw, bx, by, bz] = b;
  return [
    aw * bw - ax * bx - ay * by - az * bz,
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
  ];
}

function qNorm(q: Quat): Quat {
  const m = Math.sqrt(q[0] ** 2 + q[1] ** 2 + q[2] ** 2 + q[3] ** 2);
  return [q[0] / m, q[1] / m, q[2] / m, q[3] / m];
}

function qConj(q: Quat): Quat {
  return [q[0], -q[1], -q[2], -q[3]];
}

/** Rotate a phone-frame vector into world frame using quaternion q. */
function rotateVec(q: Quat, v: Vec3): Vec3 {
  const vq: Quat = [0, v[0], v[1], v[2]];
  const [, rx, ry, rz] = qMul(qMul(q, vq), qConj(q));
  return [rx, ry, rz];
}

// ---------------------------------------------------------------------------
// Orientation estimation
// ---------------------------------------------------------------------------

/**
 * Build the initial phone→world quaternion from a measured gravity vector.
 * g is the mean accelerometer reading during the settle window (any unit;
 * only direction matters). After this rotation world +Z = up.
 */
function quatFromGravity(g: Vec3): Quat {
  const phoneUp = vNorm([-g[0], -g[1], -g[2]]); // opposite to gravity = up
  const worldZ: Vec3 = [0, 0, 1];

  const axis  = vCross(phoneUp, worldZ);
  const axLen = vMag(axis);
  const cosA  = vDot(phoneUp, worldZ);

  if (axLen < 1e-6) {
    // Already (anti-)aligned with world Z — identity or 180° flip.
    return cosA > 0 ? IDENTITY : [0, 1, 0, 0];
  }

  const angle = Math.acos(Math.max(-1, Math.min(1, cosA)));
  const axN   = vNorm(axis);
  const s     = Math.sin(angle / 2);
  return qNorm([Math.cos(angle / 2), axN[0] * s, axN[1] * s, axN[2] * s]);
}

/**
 * First-order quaternion integration.
 *
 * q:     current phone→world rotation quaternion
 * omega: angular velocity in phone frame (rad/s) from gyroscope
 * dt:    elapsed time in seconds since last gyro reading
 *
 * Uses the differential equation  dq/dt = 0.5 * q ⊗ ω
 * where ω = [0, ωx, ωy, ωz] is the angular velocity as a pure quaternion.
 */
function integrateGyro(q: Quat, omega: Vec3, dt: number): Quat {
  const [wx, wy, wz] = omega;
  const [qw, qx, qy, qz] = q;
  const h = 0.5 * dt;
  return qNorm([
    qw + h * (-qx * wx - qy * wy - qz * wz),
    qx + h * ( qw * wx + qy * wz - qz * wy),
    qy + h * ( qw * wy - qx * wz + qz * wx),
    qz + h * ( qw * wz + qx * wy - qy * wx),
  ]);
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

const G = 9.80665; // m/s²

/**
 * Collect a world-frame-vertical accelerometer burst ready to POST to /events.
 *
 * Algorithm:
 *  1. Settle (settleMs): average accelerometer readings to estimate which
 *     direction gravity points in the phone's current frame.
 *  2. Compute an initial orientation quaternion that maps the phone frame to
 *     a world frame where +Z is up.
 *  3. Burst (durationMs): run both sensors simultaneously.
 *     - Each gyroscope reading integrates into the running orientation quaternion,
 *       tracking the phone's rotation per-sample for the whole burst window.
 *     - Each accelerometer reading is rotated into world frame; the vertical
 *       component (world Z) is extracted and static gravity is subtracted,
 *       leaving only dynamic road-surface acceleration.
 *  4. Return { z_values, timestamps_ms }.
 *
 * Falls back to the initial gravity-only orientation (no gyro integration)
 * on devices that don't expose a gyroscope.
 */
export async function collectOrientedBurst({
  durationMs   = 500,
  sampleRateHz = 200,
  settleMs     = 100,
}: CollectOptions = {}): Promise<OrientedBurst> {
  const intervalMs = Math.round(1000 / sampleRateHz);

  // ── 1. Settle: estimate gravity direction ─────────────────────────────
  let gx = 0, gy = 0, gz = 0, gCount = 0;

  await new Promise<void>((resolve) => {
    Accelerometer.setUpdateInterval(intervalMs);
    const sub = Accelerometer.addListener(({ x, y, z }) => {
      gx += x; gy += y; gz += z; gCount++;
    });
    setTimeout(() => { sub.remove(); resolve(); }, settleMs);
  });

  const gravity: Vec3 = gCount > 0
    ? [gx / gCount, gy / gCount, gz / gCount]
    : [0, 0, -1]; // safe fallback: phone flat, screen up

  // ── 2. Initialise orientation ─────────────────────────────────────────
  let q: Quat = quatFromGravity(gravity);
  let lastGyroT: number | null = null;
  const gyroAvailable = await Gyroscope.isAvailableAsync();

  // ── 3. Burst ──────────────────────────────────────────────────────────
  const z_values:      number[] = [];
  const timestamps_ms: number[] = [];

  await new Promise<void>((resolve) => {
    Accelerometer.setUpdateInterval(intervalMs);
    let gyroSub: { remove(): void } | null = null;

    if (gyroAvailable) {
      Gyroscope.setUpdateInterval(intervalMs);
      gyroSub = Gyroscope.addListener(({ x, y, z }) => {
        const now = Date.now();
        if (lastGyroT !== null) {
          const dt = (now - lastGyroT) / 1000;
          // Guard: ignore duplicate events or implausibly large gaps.
          if (dt > 0 && dt < 0.1) {
            q = integrateGyro(q, [x, y, z], dt);
          }
        }
        lastGyroT = now;
      });
    }

    const accelSub = Accelerometer.addListener(({ x, y, z }) => {
      // expo-sensors returns g's; convert to m/s² before rotating.
      const worldAccel = rotateVec(q, [x * G, y * G, z * G]);
      // worldAccel[2] = vertical; subtract gravity to isolate road dynamics.
      // The backend also mean-centres the signal, so this is belt-and-suspenders.
      z_values.push(worldAccel[2] - G);
      timestamps_ms.push(Date.now());
    });

    setTimeout(() => {
      accelSub.remove();
      gyroSub?.remove();
      resolve();
    }, durationMs);
  });

  return { z_values, timestamps_ms };
}
