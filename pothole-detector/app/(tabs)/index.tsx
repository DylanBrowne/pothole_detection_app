import { initDatabase, saveEvent, syncEvents } from "@/utils/database";
import { collectOrientedBurst, OrientedBurst } from "@/utils/orientedBurst";
import * as Location from 'expo-location';
import { Accelerometer } from "expo-sensors";
import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';

const THRESHOLD = 2.5;
const CHART_HEIGHT = 72;
const ACCEL_STALE_MS = 3000;

function BurstChart({ burst }: { burst: OrientedBurst }) {
    const values = burst.z_values;
    if (values.length === 0) return null;
    const maxAbs = Math.max(...values.map(Math.abs), 0.1);
    return (
        <View style={{ flexDirection: 'row', alignItems: 'center', height: CHART_HEIGHT }}>
            {values.map((v, i) => {
                const h = Math.max(2, (Math.abs(v) / maxAbs) * (CHART_HEIGHT / 2));
                return (
                    <View
                        key={i}
                        style={{
                            width: 3,
                            height: h,
                            marginRight: 1,
                            backgroundColor: v < 0 ? '#2196F3' : '#F44336',
                            alignSelf: 'center',
                        }}
                    />
                );
            })}
        </View>
    );
}

export default function HomeScreen() {
    const [potholeCount, setPotholeCount] = useState(0);
    const [isDriving, setIsDriving] = useState(false);
    const [liveAccel, setLiveAccel] = useState({ x: 0, y: 0, z: 0 });
    const [accelLive, setAccelLive] = useState(false);
    const [gpsSpeed, setGpsSpeed] = useState(0);
    const [lastBurst, setLastBurst] = useState<OrientedBurst | null>(null);
    const [collecting, setCollecting] = useState(false);

    const lastAccelRef = useRef(0);

    // Marks accel as stale 3s after the last sample arrives
    useEffect(() => {
        setAccelLive(true);
        const t = setTimeout(() => setAccelLive(false), ACCEL_STALE_MS);
        return () => clearTimeout(t);
    }, [liveAccel]);

    useEffect(() => {
        const start = async () => {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') {
                console.log('Permission denied');
                return;
            }

            await initDatabase();

            setInterval(async () => {
                await syncEvents();
            }, 30000);

            let accelSubscription: any = null;

            const subscribeAccel = () => {
                let isCollecting = false;
                return Accelerometer.addListener(async ({ x, y, z }) => {
                    lastAccelRef.current = Date.now();
                    setLiveAccel({ x, y, z });
                    const magnitude = Math.sqrt(x * x + y * y + z * z);
                    if (magnitude > THRESHOLD && !isCollecting) {
                        isCollecting = true;
                        setCollecting(true);
                        try {
                            const burst = await collectOrientedBurst();
                            await saveEvent(
                                currentLocation.coords.latitude,
                                currentLocation.coords.longitude,
                                burst,
                                new Date(currentLocation.timestamp).toISOString()
                            );
                            setLastBurst(burst);
                            setPotholeCount(prev => prev + 1);
                        } catch (e) {
                            console.error('Burst failed:', e);
                        } finally {
                            setCollecting(false);
                            isCollecting = false;
                        }
                    }
                });
            };

            let currentLocation: Location.LocationObject = null!;

            await Location.watchPositionAsync(
                { accuracy: Location.Accuracy.High, timeInterval: 1000 },
                (location) => {
                    currentLocation = location;
                    const speed = location.coords.speed ?? 0;
                    setGpsSpeed(speed);

                    if (speed >= 0.000001) {
                        setIsDriving(true);

                        // Watchdog: recreate subscription if no samples received recently
                        if (accelSubscription && Date.now() - lastAccelRef.current > ACCEL_STALE_MS) {
                            accelSubscription.remove();
                            accelSubscription = null;
                        }

                        if (accelSubscription == null) {
                            lastAccelRef.current = Date.now();
                            accelSubscription = subscribeAccel();
                        }
                    } else {
                        setIsDriving(false);
                        setGpsSpeed(0);
                        if (accelSubscription) {
                            accelSubscription.remove();
                            accelSubscription = null;
                        }
                    }
                }
            );
        };
        start();
        console.log("App started");
    }, []);

    const { x, y, z } = liveAccel;
    const magnitude = Math.sqrt(x * x + y * y + z * z);
    const magColor = magnitude >= THRESHOLD ? '#F44336' : magnitude > THRESHOLD * 0.6 ? '#FF9800' : '#4CAF50';
    const barWidth = `${Math.min(100, (magnitude / THRESHOLD) * 100)}%` as `${number}%`;
    const axisColor = (v: number) => Math.abs(v) > THRESHOLD * 0.4 ? '#FF9800' : '#555';

    return (
        <View style={{ flex: 1, backgroundColor: '#fff', padding: 24, paddingTop: 60 }}>
            <Text style={{ fontSize: 28, fontWeight: 'bold', textAlign: 'center' }}>
                Pothole Detector
            </Text>

            {/* Driving status + speed */}
            <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 16, gap: 12 }}>
                <Text style={{ fontSize: 18, color: isDriving ? 'green' : 'gray' }}>
                    {isDriving ? '🟢 Driving' : '⚫ Not Driving'}
                </Text>
                <Text style={{ fontSize: 14, color: '#999' }}>
                    {(gpsSpeed * 3.6).toFixed(1)} km/h
                </Text>
            </View>

            {/* Pothole count */}
            <View style={{ alignItems: 'center', marginTop: 24, marginBottom: 8 }}>
                <Text style={{ fontSize: 56, fontWeight: 'bold' }}>{potholeCount}</Text>
                <Text style={{ fontSize: 14, color: 'gray' }}>Potholes Detected</Text>
            </View>

            {/* Live accelerometer panel */}
            <View style={{ marginTop: 20, padding: 16, backgroundColor: '#f7f7f7', borderRadius: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 6 }}>
                    <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: accelLive ? '#4CAF50' : '#ccc' }} />
                    <Text style={{ fontSize: 11, color: '#999', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                        Live Accel (phone frame){!accelLive && isDriving ? ' · stale' : ''}
                    </Text>
                </View>

                {/* Individual axes */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }}>
                    {([['X', x], ['Y', y], ['Z', z]] as [string, number][]).map(([label, val]) => (
                        <View key={label} style={{ alignItems: 'center', flex: 1 }}>
                            <Text style={{ fontSize: 11, color: '#aaa', marginBottom: 2 }}>{label}</Text>
                            <Text style={{ fontSize: 18, fontWeight: '500', color: axisColor(val), fontVariant: ['tabular-nums'] }}>
                                {val >= 0 ? '+' : ''}{val.toFixed(2)}
                            </Text>
                        </View>
                    ))}
                </View>

                {/* Magnitude */}
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
                    <Text style={{ fontSize: 11, color: '#999' }}>magnitude</Text>
                    <Text style={{ fontSize: 36, fontWeight: '600', color: magColor, fontVariant: ['tabular-nums'] }}>
                        {magnitude.toFixed(3)}
                    </Text>
                    <Text style={{ fontSize: 16, color: '#aaa' }}>g</Text>
                    {collecting && (
                        <Text style={{ fontSize: 13, color: '#F44336', marginLeft: 8 }}>
                            collecting…
                        </Text>
                    )}
                </View>

                {/* Bar gauge */}
                <View style={{ height: 6, backgroundColor: '#e0e0e0', borderRadius: 3, marginTop: 10 }}>
                    <View style={{ height: 6, width: barWidth, backgroundColor: magColor, borderRadius: 3 }} />
                </View>
                <Text style={{ fontSize: 11, color: '#bbb', marginTop: 5 }}>
                    trigger threshold: {THRESHOLD} g
                </Text>
            </View>

            {/* Last burst sparkline */}
            {lastBurst && (
                <View style={{ marginTop: 16, padding: 16, backgroundColor: '#f7f7f7', borderRadius: 12 }}>
                    <Text style={{ fontSize: 11, color: '#999', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                        Last burst · {lastBurst.z_values.length} samples · world-frame Z (m/s²)
                    </Text>
                    <BurstChart burst={lastBurst} />
                    <View style={{ flexDirection: 'row', marginTop: 8, gap: 16 }}>
                        <Text style={{ fontSize: 11, color: '#2196F3' }}>■ down</Text>
                        <Text style={{ fontSize: 11, color: '#F44336' }}>■ up</Text>
                        <Text style={{ fontSize: 11, color: '#999' }}>
                            peak: {Math.max(...lastBurst.z_values.map(Math.abs)).toFixed(2)} m/s²
                        </Text>
                    </View>
                </View>
            )}
        </View>
    );
}
