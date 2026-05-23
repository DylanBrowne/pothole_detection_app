import { Text, View } from 'react-native';
import { useState } from 'react';

export default function HomeScreen() {
  const [potholeCount, setPotholeCount] = useState(0);
  return (
      <View style ={{ flex: 1, backgroundColor: 'white'}}>
        <Text>Pothole Detector {potholeCount}</Text>
      </View>
  );
}