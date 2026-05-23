import * as SQLite from 'expo-sqlite';

const initDatabase  = async () => {
    const db = await SQLite.openDatabaseAsync('potholes.db');
    await db.execAsync(`CREATE TABLE IF NOT EXISTS pothole_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        latitude REAL,
        longitude REAL,
        z_values TEXT,
        timestamps_ms TEXT,
        detected_at TEXT,
        synced INTEGER DEFAULT 0
    );`)
}

