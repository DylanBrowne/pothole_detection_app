const BASE_URL = 'https://holes.sinuboh.xyz';

interface EventPayload {
    device_id: string;
    latitude: number;
    longitude: number;
    detected_at: string;
    app_version: string;
    z_values: number[];
    timestamps_ms: number[];
}

export async function postEvent(payload: EventPayload): Promise<void> {
    const response = await fetch(`${BASE_URL}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
    if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(`HTTP ${response.status}: ${body}`);
    }
}
