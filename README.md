# pothole_detection_app
Mobile application built with Expo (React Native). Handles user interaction, sensor data, and offline storage, with support for syncing to a backend service.

pothole_detection_app/\n
│\n
├── App.js\n
├── app.json\n
├── package.json
├── package-lock.json
│
├── assets/
│   ├── images/
│   ├── icons/
│   └── fonts/
│
├── src/
│   ├── components/
│   │   ├── Button.js
│   │   ├── StatusCard.js
│   │   └── PotholeMarker.js
│   │
│   ├── screens/
│   │   ├── HomeScreen.js
│   │   ├── DetectionScreen.js
│   │   └── LogsScreen.js
│   │
│   ├── sensors/
│   │   ├── accelerometer.js
│   │   ├── gyroscope.js
│   │   └── detector.js
│   │
│   ├── database/
│   │   ├── sqlite.js
│   │   └── eventQueue.js
│   │
│   ├── services/
│   │   ├── locationService.js
│   │   └── syncService.js
│   │
│   ├── hooks/
│   │   └── usePotholeDetection.js
│   │
│   ├── utils/
│   │   ├── math.js
│   │   ├── thresholds.js
│   │   └── constants.js
│   │
│   └── navigation/
│       └── AppNavigator.js
│
├── scripts/
│   └── (build / helper scripts if needed)
│
├── node_modules/
│
├── .expo/
│   ├── settings.json
│   ├── packager-info.json
│   └── (cache files)
│
├── .idea/
│   └── (IntelliJ config files)
│
├── .vscode/
│   └── settings.json
│
├── .Claude/
│   └── (AI/tool metadata folder)
│
└── README.md
