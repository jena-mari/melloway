import type { EventMapResponse } from '@melloway/domain';
import { resolveConfig } from './config.ts';

export function eventApiOrigin(): string {
  return resolveConfig('live', process.env.EXPO_PUBLIC_API_URL).apiUrl!;
}

export async function fetchEventMap(origin = eventApiOrigin()): Promise<EventMapResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(`${origin}/api/events`, { signal: controller.signal });
    if (!response.ok) throw new Error('Event venues could not be loaded.');
    const data = await response.json() as EventMapResponse;
    if (!data || !Array.isArray(data.events) || !Array.isArray(data.points)
      || data.events.length > 10 || data.points.length > 10 || typeof data.mapAvailable !== 'boolean'
      || !Number.isInteger(data.missingCoordinates) || data.missingCoordinates < 0
      || data.events.some(event => typeof event.id !== 'string' || typeof event.name !== 'string')
      || data.points.some(point => !/^[A-J]$/.test(point.label) || !Array.isArray(point.eventIds)
        || !Number.isFinite(point.latitude) || !Number.isFinite(point.longitude)
        || Math.abs(point.latitude) > 90 || Math.abs(point.longitude) > 180)) {
      throw new Error('Invalid event venue response.');
    }
    return data;
  } finally { clearTimeout(timer); }
}
