import { fetchSydneyEvents } from '../server/ticketmaster.ts';

try {
  const events = await fetchSydneyEvents();
  console.log(JSON.stringify(events, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Unable to fetch Ticketmaster events.');
  process.exitCode = 1;
}
