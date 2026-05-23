import * as SQLite from 'expo-sqlite';
import { OrientedBurst } from '@/utils/orientedBurst';
import Constants from 'expo-constants';
import { postEvent } from './api';

let db: SQLite.SQLiteDatabase;
let deviceId: string | null = null;

function generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
}

async function getOrCreateDeviceId(): Promise<string> {
    if (deviceId) return deviceId;
    const row = await db.getFirstAsync<{ value: string }>(
        'SELECT value FROM device_config WHERE key = ?', ['device_id']
    );
    if (row) {
        deviceId = row.value;
    } else {
        const newId = generateUUID();
        await db.runAsync(
            'INSERT INTO device_config (key, value) VALUES (?, ?)',
            ['device_id', newId]
        );
        deviceId = newId;
    }
    return deviceId!;
}

const initDatabase = async () => {
    db = await SQLite.openDatabaseAsync('potholes.db');
    await db.execAsync(`
        CREATE TABLE IF NOT EXISTS events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            latitude REAL,
            longitude REAL,
            z_values TEXT,
            timestamps_ms TEXT,
            detected_at TEXT,
            synced INTEGER DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS device_config (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
    `);
};

async function saveEvent(latitude: number, longitude: number, burst: OrientedBurst, detectAt: string): Promise<void> {
    await db.runAsync(
        `INSERT INTO events (latitude, longitude, z_values, timestamps_ms, detected_at) VALUES (?, ?, ?, ?, ?)`,
        [latitude, longitude, JSON.stringify(burst.z_values), JSON.stringify(burst.timestamps_ms), detectAt]
    );
}

export async function syncEvents() {
    const rows = await db.getAllAsync('SELECT * FROM events WHERE synced = 0');
    console.log('Unsynced events:', rows.length);

    const device_id = await getOrCreateDeviceId();
    const app_version = Constants.expoConfig?.version ?? '1.0.0';

    for (const row of rows as any[]) {
        try {
            await postEvent({
                device_id,
                latitude: row.latitude,
                longitude: row.longitude,
                detected_at: row.detected_at,
                app_version,
                z_values: JSON.parse(row.z_values),
                timestamps_ms: JSON.parse(row.timestamps_ms),
            });
            await db.runAsync('UPDATE events SET synced = 1 WHERE id = ?', [row.id]);
        } catch (e) {
            console.log('Sync failed:', e);
        }
    }
}

export { initDatabase, saveEvent };
