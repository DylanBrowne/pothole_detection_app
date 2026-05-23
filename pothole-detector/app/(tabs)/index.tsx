import { Text, View } from 'react-native';
import { useState, useEffect } from 'react';
import * as Location from 'expo-location';

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
            await Location.watchPositionAsync(
                { accuracy: Location.Accuracy.High, timeInterval: 1000 },
                (location) => {
                    const speed = location.coords.speed ?? 0; // m/s
                    if (speed >= 6.7056) {
                        console.log('Driving');
                        setIsDriving(true);
                    } else {
                        console.log('Not driving');
                        setIsDriving(false);
                    }
                }
            );
        };
        start();
        console.log("App started");
    }, []);

  return (
      <View style ={{ flex: 1, backgroundColor: 'white'}}>
        <Text>Pothole Detector: {potholeCount}</Text>
          <Text>Driving: {isDriving ? 'Yes' : 'No'}</Text>
      </View>
  );
}