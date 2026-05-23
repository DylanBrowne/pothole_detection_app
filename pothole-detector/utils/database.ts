import * as SQLite from 'expo-sqlite';
import {OrientedBurst} from "@/utils/orientedBurst";

let db: SQLite.SQLiteDatabase;

const initDatabase  = async () => {
    db = await SQLite.openDatabaseAsync('potholes.db');
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

async function saveEvent(latitude: number, longitude: number, burst: OrientedBurst, detectAt: string): Promise<void> {
    await db.runAsync(`INSERT INTO pothole_events (latitude, longitude, z_values, timestamps_ms, detected_at)
        VALUES (?, ?, ?, ?, ?)`,
        [latitude, longitude,
            JSON.stringify(burst.z_values),
            JSON.stringify(burst.timestamps_ms),
            detectAt]);
}

export { initDatabase, saveEvent };

