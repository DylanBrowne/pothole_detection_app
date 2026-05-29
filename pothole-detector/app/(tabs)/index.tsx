import { fetchPotholes, PotholeRecord } from "@/utils/api";
import { clearLocalEvents, getLocalEvents, initDatabase, LocalEvent, saveEvent, saveLocalEvent, syncEvents } from "@/utils/database";
import { collectOrientedBurst } from "@/utils/orientedBurst";
import { EventHistoryDrawer } from "@/components/EventHistoryDrawer";
import * as Location from 'expo-location';
import { Accelerometer } from "expo-sensors";
import { useEffect, useRef, useState } from 'react';
import { Animated, Text, TouchableOpacity, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';

const THRESHOLD = 2.5;
const ACCEL_STALE_MS = 3000;
const FETCH_RADIUS_MILES = 10;
const REFETCH_THRESHOLD_MILES = 1.0;
const DETECTION_COOLDOWN_MS = 5000;
const TRIGGER_INTERVAL_MS = 20; // 50 Hz — enough to catch a spike, much less power than 200 Hz
const MAP_3D_MIN_MS = 10 * 0.44704; // 10 mph in m/s — below this, flat north-up map

function distanceMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 3958.8;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.asin(Math.sqrt(a));
}

function markerColor(severity: number): string {
    if (severity > 0.7) return '#F44336';
    if (severity > 0.4) return '#FF9800';
    return '#FFC107';
}

export default function HomeScreen() {
    const [isDriving, setIsDriving] = useState(false);
    const [liveAccel, setLiveAccel] = useState({ x: 0, y: 0, z: 0 });
    const [accelLive, setAccelLive] = useState(false);
    const [gpsSpeed, setGpsSpeed] = useState(0);
    const [collecting, setCollecting] = useState(false);
    const [nearbyPotholes, setNearbyPotholes] = useState<PotholeRecord[]>([]);
    const [debugMode, setDebugMode] = useState(false);
    const debugModeRef = useRef(false);
    const [historyVisible, setHistoryVisible] = useState(false);
    const [localEvents, setLocalEvents] = useState<LocalEvent[]>([]);

    const lastAccelRef = useRef(0);
    const lastRenderRef = useRef(0);
    const lastDetectionRef = useRef(0);
    const gpsSpeedRef = useRef(0);
    const lastFetchRef = useRef<{ lat: number; lng: number } | null>(null);
    const userLocationRef = useRef<{ latitude: number; longitude: number } | null>(null);
    const prevMapCoordRef = useRef<{ latitude: number; longitude: number } | null>(null);
    const mapRef = useRef<MapView>(null);
    const snapshotMapRef = useRef<MapView>(null);
    const toastAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        setAccelLive(true);
        const t = setTimeout(() => setAccelLive(false), ACCEL_STALE_MS);
        return () => clearTimeout(t);
    }, [liveAccel]);

    const handleClearHistory = async () => {
        await clearLocalEvents();
        setLocalEvents([]);
    };

    const toggleDebugMode = () => {
        debugModeRef.current = !debugModeRef.current;
        setDebugMode(debugModeRef.current);
    };

    const triggerToast = () => {
        toastAnim.stopAnimation();
        Animated.sequence([
            Animated.timing(toastAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
            Animated.delay(2500),
            Animated.timing(toastAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
        ]).start();
    };

    const loadNearbyPotholes = async (lat: number, lng: number) => {
        try {
            const data = await fetchPotholes(lat, lng, FETCH_RADIUS_MILES);
            setNearbyPotholes(data);
        } catch (e) {
            console.log('Pothole fetch failed:', e);
        }
    };

    useEffect(() => {
        let accelSubscription: any = null;
        let locationSub: Location.LocationSubscription | null = null;
        let syncInterval: ReturnType<typeof setInterval> | null = null;

        const start = async () => {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') {
                console.log('Permission denied');
                return;
            }

            await initDatabase();
            setLocalEvents(await getLocalEvents());

            syncInterval = setInterval(async () => {
                if (!debugModeRef.current) await syncEvents();
            }, 30000);

            const subscribeAccel = () => {
                let isCollecting = false;
                Accelerometer.setUpdateInterval(TRIGGER_INTERVAL_MS);
                return Accelerometer.addListener(async ({ x, y, z }) => {
                    const now = Date.now();
                    lastAccelRef.current = now;
                    if (now - lastRenderRef.current >= 50) {
                        lastRenderRef.current = now;
                        setLiveAccel({ x, y, z });
                    }
                    const magnitude = Math.sqrt(x * x + y * y + z * z);
                    if (magnitude > THRESHOLD && !isCollecting && now - lastDetectionRef.current >= DETECTION_COOLDOWN_MS) {
                        isCollecting = true;
                        lastDetectionRef.current = now;
                        setCollecting(true);
                        try {
                            const burst = await collectOrientedBurst();
                            const detectedAt = new Date(currentLocation.timestamp).toISOString();
                            const lat = currentLocation.coords.latitude;
                            const lng = currentLocation.coords.longitude;

                            let snapshotB64: string | null = null;
                            try {
                                snapshotB64 = await snapshotMapRef.current?.takeSnapshot({
                                    width: 256,
                                    height: 256,
                                    format: 'jpg',
                                    quality: 0.6,
                                    result: 'base64',
                                }) ?? null;
                            } catch {
                                // snapshot is best-effort
                            }

                            await saveLocalEvent(lat, lng, burst, detectedAt, snapshotB64);
                            setLocalEvents(await getLocalEvents());

                            if (!debugModeRef.current) {
                                await saveEvent(lat, lng, burst, detectedAt);
                            }
                            triggerToast();
                        } catch (e) {
                            console.error('Burst failed:', e);
                        } finally {
                            Accelerometer.setUpdateInterval(TRIGGER_INTERVAL_MS);
                            setCollecting(false);
                            isCollecting = false;
                        }
                    }
                });
            };

            let currentLocation: Location.LocationObject = null!;

            locationSub = await Location.watchPositionAsync(
                { accuracy: Location.Accuracy.High, timeInterval: 1000 },
                (location) => {
                    currentLocation = location;
                    const { latitude: lat, longitude: lng } = location.coords;
                    userLocationRef.current = { latitude: lat, longitude: lng };
                    snapshotMapRef.current?.animateToRegion(
                        { latitude: lat, longitude: lng, latitudeDelta: 0.004, longitudeDelta: 0.004 },
                        0
                    );
                    const speed = location.coords.speed ?? 0;
                    gpsSpeedRef.current = speed;
                    setGpsSpeed(speed);

                    const lastFetch = lastFetchRef.current;
                    if (!debugModeRef.current && (!lastFetch || distanceMiles(lastFetch.lat, lastFetch.lng, lat, lng) > REFETCH_THRESHOLD_MILES)) {
                        lastFetchRef.current = { lat, lng };
                        loadNearbyPotholes(lat, lng);
                    }

                    if (speed >= 0.000001 || debugModeRef.current) {
                        setIsDriving(speed >= 0.000001);

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
                        gpsSpeedRef.current = 0;
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

        return () => {
            if (syncInterval !== null) clearInterval(syncInterval);
            accelSubscription?.remove();
            locationSub?.remove();
        };
    }, []);

    const { x, y, z } = liveAccel;
    const magnitude = Math.sqrt(x * x + y * y + z * z);
    const magColor = magnitude >= THRESHOLD ? '#F44336' : magnitude > THRESHOLD * 0.6 ? '#FF9800' : '#4CAF50';
    const barWidth = `${Math.min(100, (magnitude / THRESHOLD) * 100)}%` as `${number}%`;

    return (
        <View style={{ flex: 1 }}>

            {/* Full-screen map */}
            <MapView
                ref={mapRef}
                style={{ flex: 1 }}
                mapType="standard"
                showsUserLocation
                showsCompass={false}
                showsMyLocationButton={false}
                showsPointsOfInterest={false}
                scrollEnabled={false}
                zoomEnabled={false}
                rotateEnabled={false}
                pitchEnabled={false}
                initialRegion={userLocationRef.current ? {
                    ...userLocationRef.current,
                    latitudeDelta: 0.01,
                    longitudeDelta: 0.01,
                } : undefined}
                onUserLocationChange={(e) => {
                    const coord = e.nativeEvent.coordinate;
                    if (!coord) return;
                    const prev = prevMapCoordRef.current;
                    let heading = 0;
                    if (prev) {
                        const dLat = (coord.latitude - prev.latitude) * Math.PI / 180;
                        const dLng = (coord.longitude - prev.longitude) * Math.PI / 180;
                        const lat1 = prev.latitude * Math.PI / 180;
                        const lat2 = coord.latitude * Math.PI / 180;
                        const x = Math.sin(dLng) * Math.cos(lat2);
                        const y = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
                        heading = (Math.atan2(x, y) * 180 / Math.PI + 360) % 360;
                    }
                    prevMapCoordRef.current = { latitude: coord.latitude, longitude: coord.longitude };
                    const fast = gpsSpeedRef.current >= MAP_3D_MIN_MS;
                    mapRef.current?.animateCamera({
                        center: { latitude: coord.latitude, longitude: coord.longitude },
                        pitch: fast ? 75 : 0,
                        heading: fast ? heading : 0,
                        altitude: 250,
                        zoom: 18,
                    }, { duration: 600 });
                }}
            >
                {nearbyPotholes.map((p) => (
                    <Marker
                        key={p.pothole_id}
                        coordinate={{ latitude: p.canonical_lat, longitude: p.canonical_lng }}
                        pinColor={markerColor(p.severity_score)}
                    />
                ))}
            </MapView>

            {/* Off-screen map used only for taking snapshots at the user's location */}
            <MapView
                ref={snapshotMapRef}
                style={{ position: 'absolute', left: -1000, top: 0, width: 256, height: 256 }}
                mapType="standard"
                showsUserLocation={false}
                showsPointsOfInterest={false}
                showsBuildings={false}
                showsCompass={false}
                scrollEnabled={false}
                zoomEnabled={false}
                rotateEnabled={false}
                pitchEnabled={false}
                initialRegion={userLocationRef.current ? {
                    ...userLocationRef.current,
                    latitudeDelta: 0.004,
                    longitudeDelta: 0.004,
                } : undefined}
            />

            {/* Control panel overlay */}
            <View style={{
                position: 'absolute',
                bottom: 36,
                left: 16,
                right: 16,
                backgroundColor: 'rgba(255,255,255,0.92)',
                borderRadius: 16,
                padding: 16,
            }}>
                <View style={{ flexDirection: 'row', alignItems: 'stretch' }}>

                    {/* Left: speed + accel + threshold bar */}
                    <View style={{ flex: 1, justifyContent: 'space-between' }}>
                        {/* Speed */}
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: isDriving ? '#4CAF50' : '#9E9E9E' }} />
                            <Text style={{ fontSize: 20, fontWeight: '600', color: '#111', fontVariant: ['tabular-nums'] }}>
                                {(gpsSpeed * 2.237).toFixed(0)} mph
                            </Text>
                        </View>

                        {/* Accel magnitude */}
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: collecting ? '#F44336' : '#ccc' }} />
                            <Text style={{ fontSize: 18, fontWeight: '500', color: magColor, fontVariant: ['tabular-nums'] }}>
                                {magnitude.toFixed(3)}g
                            </Text>
                        </View>

                        {/* Threshold bar */}
                        <View style={{ height: 6, backgroundColor: '#e0e0e0', borderRadius: 3 }}>
                            <View style={{ height: 6, width: barWidth, backgroundColor: magColor, borderRadius: 3 }} />
                        </View>
                    </View>

                    {/* Divider */}
                    <View style={{ width: 1, backgroundColor: '#e0e0e0', marginHorizontal: 16 }} />

                    {/* Right: history + debug */}
                    <View style={{ alignItems: 'center', justifyContent: 'space-between' }}>
                        <TouchableOpacity onPress={() => setHistoryVisible(true)}>
                            <Text style={{ fontSize: 22 }}>📋</Text>
                        </TouchableOpacity>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: '#333' }}>
                            {localEvents.length}
                        </Text>
                        <TouchableOpacity
                            onPress={toggleDebugMode}
                            style={{
                                paddingHorizontal: 10,
                                paddingVertical: 4,
                                borderRadius: 8,
                                backgroundColor: debugMode ? '#FF9800' : '#e0e0e0',
                            }}
                        >
                            <Text style={{ fontSize: 12, fontWeight: '600', color: debugMode ? '#fff' : '#888' }}>
                                {debugMode ? 'DEBUG ON' : 'DEBUG'}
                            </Text>
                        </TouchableOpacity>
                    </View>

                </View>
            </View>

            {/* Pothole detection toast */}
            <Animated.View
                pointerEvents="none"
                style={{
                    position: 'absolute',
                    top: 60,
                    left: 40,
                    right: 40,
                    opacity: toastAnim,
                    transform: [{
                        translateY: toastAnim.interpolate({
                            inputRange: [0, 1],
                            outputRange: [-12, 0],
                        }),
                    }],
                }}
            >
                <View style={{
                    backgroundColor: '#D32F2F',
                    borderRadius: 14,
                    paddingVertical: 12,
                    paddingHorizontal: 20,
                    alignItems: 'center',
                    shadowColor: '#000',
                    shadowOpacity: 0.4,
                    shadowRadius: 10,
                    elevation: 10,
                }}>
                    <Text style={{ color: 'white', fontSize: 16, fontWeight: 'bold' }}>
                        🚨 Pothole Detected!
                    </Text>
                </View>
            </Animated.View>

            <EventHistoryDrawer
                visible={historyVisible}
                events={localEvents}
                onClose={() => setHistoryVisible(false)}
                onClear={handleClearHistory}
            />

        </View>
    );
}
