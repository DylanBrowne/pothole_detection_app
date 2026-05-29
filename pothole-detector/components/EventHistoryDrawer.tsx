import { LocalEvent } from '@/utils/database';
import { useEffect, useRef, useState } from 'react';
import { Alert, Animated, Dimensions, Image, ScrollView, Text, TouchableOpacity, View } from 'react-native';

const DRAWER_WIDTH = Math.round(Dimensions.get('window').width * 0.88);
const MARGIN_RIGHT = 0.5

function formatRelativeTime(isoString: string): string {
    const diff = Date.now() - new Date(isoString).getTime();
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days === 1) return 'Yesterday';
    return `${days}d ago`;
}

function severityColor(peak: number): string {
    if (peak > 8) return '#F44336';
    if (peak > 4) return '#FF9800';
    return '#FFC107';
}

interface Props {
    visible: boolean;
    events: LocalEvent[];
    onClose: () => void;
    onClear: () => void;
}

export function EventHistoryDrawer({ visible, events, onClose, onClear }: Props) {
    const translateX = useRef(new Animated.Value(DRAWER_WIDTH)).current;
    const scrimOpacity = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.parallel([
            Animated.timing(translateX, {
                toValue: visible ? 0 : DRAWER_WIDTH,
                duration: 280,
                useNativeDriver: true,
            }),
            Animated.timing(scrimOpacity, {
                toValue: visible ? 1 : 0,
                duration: 280,
                useNativeDriver: true,
            }),
        ]).start();
    }, [visible]);

    return (
        <View
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
            pointerEvents={visible ? 'auto' : 'none'}
        >
            <Animated.View
                style={{
                    position: 'absolute',
                    top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.45)',
                    opacity: scrimOpacity,
                }}
            >
                <TouchableOpacity style={{ flex: 1 }} onPress={onClose} activeOpacity={1} />
            </Animated.View>

            <Animated.View style={{
                position: 'absolute',
                right: 0,
                top: 0,
                bottom: 0,
                width: DRAWER_WIDTH,
                backgroundColor: '#fff',
                transform: [{ translateX }],
                shadowColor: '#000',
                shadowOpacity: 0.25,
                shadowRadius: 16,
                elevation: 24,
            }}>
                <View style={{
                    paddingTop: 54,
                    paddingBottom: 14,
                    paddingHorizontal: 16,
                    borderBottomWidth: 1,
                    borderColor: '#eee',
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                }}>
                    <View>
                        <Text style={{ fontSize: 17, fontWeight: '700', color: '#111' }}>
                            Detection History
                        </Text>
                        <Text style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
                            {events.length} event{events.length !== 1 ? 's' : ''} · last 30 days
                        </Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <TouchableOpacity
                            onPress={() => Alert.alert(
                                'Clear History',
                                'This will permanently delete all detection history. Continue?',
                                [
                                    { text: 'Cancel', style: 'cancel' },
                                    { text: 'Clear', style: 'destructive', onPress: onClear },
                                ]
                            )}
                            style={{ backgroundColor: '#eee', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 6 }}
                        >
                            <Text style={{ fontSize: 14, fontWeight: '600', color: '#888' }}>CLEAR</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            onPress={onClose}
                            style={{ backgroundColor: '#eee', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 6 }}
                        >
                            <Text style={{ fontSize: 14, fontWeight: '600', color: '#E57373' }}>✕</Text>
                        </TouchableOpacity>
                    </View>
                </View>

                <ScrollView
                    contentContainerStyle={{ padding: 16, gap: 12 }}
                    showsVerticalScrollIndicator={false}
                >
                    {events.length === 0 ? (
                        <Text style={{ color: '#bbb', textAlign: 'center', marginTop: 60, fontSize: 14 }}>
                            No detections recorded yet
                        </Text>
                    ) : (
                        events.map(ev => <EventCard key={ev.id} event={ev} />)
                    )}
                </ScrollView>
            </Animated.View>
        </View>
    );
}

function EventCard({ event }: { event: LocalEvent }) {
    const color = severityColor(event.peak_accel);
    const values = event.z_values;
    const maxAbs = Math.max(...values.map(Math.abs), 0.1);

    const [width, setWidth] = useState(3);

    return (
        <View style={{ backgroundColor: '#f7f7f7', borderRadius: 12, overflow: 'hidden' }}>
            {event.snapshot_b64 ? (
                <Image
                    source={{ uri: `data:image/jpeg;base64,${event.snapshot_b64}` }}
                    style={{ width: '100%', height: 130 }}
                    resizeMode="cover"
                />
            ) : null}
            <View style={{ padding: 12 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: '#111' }}>
                        {formatRelativeTime(event.detected_at)}
                    </Text>
                    <Text style={{ fontSize: 15, fontWeight: '700', color, fontVariant: ['tabular-nums'] }}>
                        {event.peak_accel.toFixed(2)} m/s²
                    </Text>
                </View>
                <Text style={{ fontSize: 11, color: '#aaa', marginBottom: 8, fontVariant: ['tabular-nums'] }}>
                    {event.latitude.toFixed(5)}, {event.longitude.toFixed(5)}
                </Text>
                <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ flexDirection: 'row', alignItems: 'center', height: 28 }}>
                    {values.map((v, i) => {
                        const h = Math.max(1, (Math.abs(v) / maxAbs) * 14);
                        const totalMargin = MARGIN_RIGHT * values.length;
                        return (
                            <View
                                key={i}
                                style={{
                                    width: (width - totalMargin) / values.length,
                                    height: h,
                                    marginRight: 0.5,
                                    backgroundColor: v < 0 ? '#2196F3' : '#F44336',
                                    alignSelf: 'center',
                                }}
                            />
                        );
                    })}
                </View>
            </View>
        </View>
    );
}
