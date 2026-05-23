import { Text, View } from 'react-native';
import { useState, useEffect } from 'react';
import * as Location from 'expo-location';

useEffect(() => {
    // your startup code goes here
    const start = async () => {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
            console.log('Permission denied');
            return;
        }
    };
    console.log("App started");
}, []);

export default function HomeScreen() {
  const [potholeCount, setPotholeCount] = useState(0);
  return (
      <View style ={{ flex: 1, backgroundColor: 'white'}}>
        <Text>Pothole Detector {potholeCount}</Text>
      </View>
  );
}