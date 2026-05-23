const BASE_URL = 'https://holes.sinuboh.xyz';

interface EventPayload {
    device_id: string;
    latitude: number;
    longitude: number;
    detected_at: string;
    app_version: string;
    accel_burst: {
        z_values: number[];
        timestamps_ms: number[];
    };
}

export async function postEvent(payload: EventPayload): Promise<void> {
    const response = await fetch(`${BASE_URL}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
    if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(`HTTP ${response.status}: ${body}`);
    }
}

export interface PotholeRecord {
    pothole_id: string;
    canonical_lat: number;
    canonical_lng: number;
    severity_score: number;
    hit_count: number;
    priority_score: number;
    first_seen: string;
    last_seen: string;
    traffic_weight: number;
}

export async function fetchPotholes(lat: number, lng: number, radiusMiles = 10): Promise<PotholeRecord[]> {
    const res = await fetch(`${BASE_URL}/potholes?lat=${lat}&lng=${lng}&radius_miles=${radiusMiles}&limit=500`);
    if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status}: ${body}`);
    }
    return res.json();
}
