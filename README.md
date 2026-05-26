# Pothole Detection App

Mobile application built with Expo (React Native) that collects sensor data, detects potholes, and stores events locally with support for backend syncing.

## Team — Here for Free Food (HF³)
- Dylan Browne (primary developer)
- Willow Bloom
- Jordan Eng

## Features
- Real-time accelerometer data (X, Y, Z)
- Pothole count display
- Offline storage (SQLite)
- Runs with Expo Go

## Tech Stack
- Expo (React Native)
- SQLite
- FastAPI (backend, separate repo)
- Supabase / PostGIS
- Next.js (dashboard)

## Run
```bash
npx expo start
```

or
```bash
npx expo start --tunnel
```

Scan the QR code with Expo Go.

## Structure
```text
src/
  screens/
  sensors/
  database/
  services/
```

## Notes
- Backend and dashboard are separate repositories
