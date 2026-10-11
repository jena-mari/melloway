import { useEffect, useRef, useState } from 'react';
import { Bookmark, Plus, Check } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../hooks/useApp.jsx';
import { sameBusiness } from '../engine/discoveryPool.ts';
import { addDiscoveredPlace } from '../services/placeActions.js';

export default function PlaceActions({ venue }) {
  const { current, savedPlaces, togglePlaceSave, setCurrent, update } = useApp();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const request = useRef(null);
  const latest = useRef(current); latest.current = current;
  useEffect(() => () => request.current?.abort(), [venue.id]);
  const saved = savedPlaces.some(place => sameBusiness(place, venue));
  const included = current?.plan.stops.some(stop => sameBusiness(stop, venue));
  async function add() {
    if (!current?.plan) {
      update({ area: venue.area || 'Sydney CBD', location: { name: venue.name, address: venue.address, lat: venue.lat, lng: venue.lng },
        notes: `Include ${venue.name}, ${venue.address}.`, preferences: venue.tags || [] });
      navigate('/plan/profile'); return;
    }
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    setBusy(true); setMessage('Checking hours, budget & route…');
    try {
      const next = await addDiscoveredPlace(current, venue, { signal: controller.signal });
      if (controller.signal.aborted) return;
      if (latest.current !== current) { setMessage('Your day changed while checking. Try adding this spot again.'); return; }
      if (!setCurrent(next)) { setMessage('Couldn’t save the updated route. Try again.'); return; }
      setMessage('Added to your day.');
    } catch (error) { if (!controller.signal.aborted) setMessage(error.message); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  }
  return <div className="place-actions">
    <div>
      <button type="button" aria-label={`${saved ? 'unsave' : 'save'} ${venue.name}`} aria-pressed={saved}
        onClick={() => setMessage(togglePlaceSave(venue) ? '' : 'Couldn’t save this place. Device storage may be full.')}>
        <Bookmark size={17} fill={saved ? 'currentColor' : 'none'} /> {saved ? 'saved' : 'save place'}
      </button>
      <button type="button" disabled={busy || included} onClick={add}>
        {included ? <Check size={17} /> : <Plus size={17} />}{busy ? 'checking…' : included ? 'in your day' : 'add to itinerary'}
      </button>
    </div>
    {message && <p role="status">{message}</p>}
  </div>;
}
