import { ArrowUpRight, BusFront, Footprints, Pin, Ship, TrainFront, X } from 'lucide-react';
import type { JourneyStep, RouteLeg } from '../../shared/routeJourney.ts';
import './MapRoutePreview.css';

interface Props { leg: RouteLeg; stops: { name: string; lat: number; lng: number }[]; onClose: () => void; onPin: () => void; pinned?: boolean }
const clock = new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Sydney', hour: 'numeric', minute: '2-digit' });
const schedule = new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Sydney', weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const mins = (minutes: number | undefined) => minutes === undefined ? '' : `${Math.max(1, Math.ceil(minutes))} min`;

function transitLabel(step: Extract<JourneyStep, { mode: 'transit' }>) {
  const names: Record<string, string> = { BUS: 'Bus', INTERCITY_BUS: 'Bus', TROLLEYBUS: 'Bus', TRAIN: 'Train', HEAVY_RAIL: 'Train',
    COMMUTER_TRAIN: 'Train', HIGH_SPEED_TRAIN: 'Train', LONG_DISTANCE_TRAIN: 'Train', RAIL: 'Train', METRO_RAIL: 'Metro',
    SUBWAY: 'Metro', TRAM: 'Light rail', LIGHT_RAIL: 'Light rail', FERRY: 'Ferry' };
  return [names[step.vehicle || ''] || 'Transit', step.line].filter(Boolean).join(' ');
}

export default function MapRoutePreview({ leg, stops, onClose, onPin, pinned = false }: Props) {
  const from = stops[leg.fromIndex], to = stops[leg.toIndex];
  if (!from || !to) return null;
  const journey = leg.journey;
  const rides = journey?.steps.filter(step => step.mode === 'transit').length || 0;
  const walks = journey?.steps.filter(step => step.mode === 'walk') || [];
  const walkingMinutes = walks.every(step => step.minutes !== undefined) ? walks.reduce((sum, step) => sum + step.minutes!, 0) : undefined;
  const directions = new URL('https://www.google.com/maps/dir/');
  directions.searchParams.set('api', '1');
  directions.searchParams.set('origin', `${from.lat},${from.lng}`);
  directions.searchParams.set('destination', `${to.lat},${to.lng}`);
  directions.searchParams.set('travelmode', 'transit');
  return <aside className="map-spot-preview map-route-preview" aria-label="Transport preview" onPointerDown={onPin}>
    <button type="button" className="map-preview-close" aria-label="close transport preview" onClick={onClose}><X size={16} /></button>
    <button type="button" className="map-route-preview-pin" aria-label="keep transport preview open" aria-pressed={pinned}
      title={pinned ? 'Directions stay open until you close them' : 'Keep these directions open'} onClick={onPin}><Pin size={15} /></button>
    <header>
      <strong>{String.fromCharCode(65 + leg.fromIndex)} → {String.fromCharCode(65 + leg.toIndex)}
        {journey?.durationMinutes !== undefined && <span> · {mins(journey.durationMinutes)}</span>}</strong>
      <small className="map-route-place-names">{from.name} → {to.name}</small>
      {journey && <small>{rides === 0 ? 'Walking connection' : rides === 1 ? 'No transfers' : `${rides - 1} ${rides === 2 ? 'transfer' : 'transfers'}`}
        {rides > 0 && walks.length > 0 && ` · ${walkingMinutes !== undefined ? `${mins(walkingMinutes)} walking` : 'Includes walking'}`}</small>}
    </header>
    {journey ? <ol className="map-route-steps">
      {journey.steps.map((step, index) => {
        if (step.mode === 'walk') {
          const next = journey.steps.slice(index + 1).find(step => step.mode === 'transit');
          return <li className="map-route-walk-step" key={index}><Footprints size={16} aria-hidden="true" /><div>
            <strong>Walk{step.minutes !== undefined ? ` ${mins(step.minutes)}` : ''}</strong>
            <small>to {next?.mode === 'transit' ? next.departureStop.name : to.name}</small>
          </div></li>;
        }
        const Icon = step.vehicle === 'FERRY' ? Ship : step.vehicle?.includes('BUS') ? BusFront
          : /RAIL|TRAIN|TRAM|SUBWAY/.test(step.vehicle || '') ? TrainFront : ArrowUpRight;
        return <li key={index}><Icon size={16} aria-hidden="true" /><div>
          <strong>{transitLabel(step)}{step.minutes !== undefined ? ` · ${mins(step.minutes)}` : ''}</strong>
          {step.headsign && <small className="map-route-headsign">towards {step.headsign}</small>}
          <small>Board at {step.departureStop.name}{step.departureTime && ` · ${clock.format(new Date(step.departureTime))}`}</small>
          <small>Get off at {step.arrivalStop.name}{step.arrivalTime && ` · ${clock.format(new Date(step.arrivalTime))}`}</small>
          {step.stopCount !== undefined && step.stopCount > 0 && <small className="map-route-stop-count">{step.stopCount} {step.stopCount === 1 ? 'stop' : 'stops'}</small>}
        </div></li>;
      })}
    </ol> : <p className="map-route-unavailable">Transport details aren’t available for this connection.</p>}
    <footer>
      {journey && <small>Leaving {schedule.format(new Date(journey.departureTime))} · estimated</small>}
      <a href={directions.toString()} target="_blank" rel="noreferrer">directions &amp; alternatives <ArrowUpRight size={14} /></a>
    </footer>
  </aside>;
}
