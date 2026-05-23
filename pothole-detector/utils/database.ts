import * as SQLite from 'expo-sqlite';
import {OrientedBurst} from "@/utils/orientedBurst";
import supabase from './supabase';

let db: SQLite.SQLiteDatabase;

const initDatabase  = async () => {
    db = await SQLite.openDatabaseAsync('potholes.db');
    await db.execAsync(`CREATE TABLE IF NOT EXISTS events (
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
    await db.runAsync(`INSERT INTO events (latitude, longitude, z_values, timestamps_ms, detected_at)
        VALUES (?, ?, ?, ?, ?)`,
        [latitude, longitude,
            JSON.stringify(burst.z_values),
            JSON.stringify(burst.timestamps_ms),
            detectAt]);
}

export async function syncEvents() {
    const rows = await db.getAllAsync(
        'SELECT * FROM events WHERE synced = 0'
    );
    console.log('Unsynced events:', rows.length);

    for (const row of rows as any[]) {
        try {
            await supabase.from('events').insert({
                latitude: row.latitude,
                longitude: row.longitude,
                z_values: row.z_values,
                timestamps_ms: row.timestamps_ms,
                detected_at: row.detected_at,
            });
            await db.runAsync(
                'UPDATE events SET synced = 1 WHERE id = ?',
                [row.id]
            );
        } catch (e) {
            console.log('Sync failed:', e);
        }
    }
}

export { initDatabase, saveEvent };

