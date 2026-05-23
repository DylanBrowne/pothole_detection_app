import { Text, View } from 'react-native';
import { useState, useEffect } from 'react';
import * as Location from 'expo-location';
import {collectOrientedBurst} from "@/utils/orientedBurst";
import {Accelerometer} from "expo-sensors";
import {initDatabase, saveEvent} from "@/utils/database";
import {syncEvents} from "@/utils/database";

export default function HomeScreen() {

  const [potholeCount, setPotholeCount] = useState(0);
  const [isDriving, setIsDriving] = useState(false);
    useEffect(() => {
        // your startup code goes here
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

            await Location.watchPositionAsync(
                { accuracy: Location.Accuracy.High, timeInterval: 1000 },
                (location) => {
                    let currentLocation = location;
                    const speed = currentLocation.coords.speed ?? 0; // m/s
                    if (speed >= 6.7056) {
                        setIsDriving(true);
                        if (accelSubscription == null) {
                            accelSubscription = Accelerometer.addListener(async ({ x, y, z }) => {
                                if (Math.abs(z) > 1.5) {
                                    const burst = await collectOrientedBurst();
                                    await saveEvent(currentLocation.coords.latitude,
                                        currentLocation.coords.longitude,
                                        burst,
                                        currentLocation.timestamp.toString());
                                    setPotholeCount(prev => prev + 1);
                                }
                            });
                        }
                    } else {
                        // not driving
                        setIsDriving(false);
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

    return (
        <View style={{ flex: 1, backgroundColor: 'white', padding: 40, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 32, fontWeight: 'bold' }}>🚗 Pothole Detector</Text>
            <Text style={{ fontSize: 24, marginTop: 20, color: isDriving ? 'green' : 'gray' }}>
                {isDriving ? '🟢 Driving' : '⚫ Not Driving'}
            </Text>
            <Text style={{ fontSize: 48, fontWeight: 'bold', marginTop: 30 }}>{potholeCount}</Text>
            <Text style={{ fontSize: 16, color: 'gray' }}>Potholes Detected</Text>
        </View>
    );
}