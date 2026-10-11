/** Private CLI: mock by default; explicit live/tiktok commands use their respective providers. */
import { readFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { discoverCafeVideos } from '../server/socialDiscovery.ts';
import { createLocalReviewQueue } from '../server/discoveryReviewQueue.ts';
import { exportApprovedVideos } from '../server/discoveryExport.ts';
import { discoverTikTokCafeVideos, type TikTokCollector } from '../server/tiktokDiscovery.ts';
import type { SocialSearchSource } from '@melloway/domain';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const privateDirectory = resolve(root, '.local/discovery');
const notice = 'Private local curation tool, not secure multi-user moderation. Matches remain tentative.';
const usage = 'Usage: discovery:review -- [--queue path] mock <venue-id> "<exact name>" "<Sydney suburb>" <mock-sources.json> | live <venue-id> "<exact name>" "<Sydney suburb>" | tiktok <venue-id> "<exact name>" "<Sydney suburb>" | list | approve <id> | reject <id> | export <new-output.json>';
const inside = (parent: string, child: string) => {
  const rel = relative(parent, child);
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
};

function requirePrivatePath(path: string) {
  if (inside(root, path) && !inside(privateDirectory, path)) {
    throw new Error('Keep repository-local queues and exports inside .local/discovery/, or use a path outside the repository.');
  }
}

/** Fetch is injectable for isolated live-command tests; production uses the server adapter. */
export async function runReviewCommand(input: string[], options: { fetcher?: typeof fetch; tiktokCollector?: TikTokCollector } = {}) {
  const args = [...input];
  let queuePath = resolve(privateDirectory, 'review-queue.json');
  const flag = args.indexOf('--queue');
  if (flag !== -1) {
    if (!args[flag + 1] || args[flag + 1].startsWith('--')) throw new Error(usage);
    queuePath = resolve(args[flag + 1]);
    args.splice(flag, 2);
  }
  if (args.some(arg => arg.startsWith('--'))) throw new Error(usage);
  // Repository-local generated data must stay in the directory ignored by Git.
  requirePrivatePath(queuePath);
  const queue = createLocalReviewQueue(queuePath);
  const [command, ...values] = args;
  if (command === 'mock' && values.length === 4) {
    const [venueId, name, suburb, sourceFile] = values;
    let payload: unknown;
    try { payload = JSON.parse(await readFile(sourceFile, 'utf8')); }
    catch { throw new Error('Cannot read the mock source fixture. No candidates were saved.'); }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Invalid mock source fixture.');
    const fixture = payload as Record<string, unknown>;
    const cafe = fixture.cafe as Record<string, unknown> | undefined;
    if (fixture.mode !== 'mock' || typeof fixture.description !== 'string' || !fixture.description.trim()
      || !cafe || cafe.venueId !== venueId || cafe.name !== name || cafe.suburb !== suburb
      || !Array.isArray(fixture.sources)
      || fixture.sources.some(source => !source || typeof source !== 'object' || Array.isArray(source)
        || typeof source.url !== 'string' || (source.title !== undefined && typeof source.title !== 'string')
        || (source.snippet !== undefined && typeof source.snippet !== 'string'))) throw new Error('Invalid mock fixture or café does not match its labelled fixture.');
    const sources = fixture.sources as SocialSearchSource[];
    const candidates = await discoverCafeVideos({ venueId, name, suburb }, {
      mode: 'mock', mockProvider: { mode: 'mock', async search() { return sources; } },
    });
    return { notice, mode: 'mock', fixture: fixture.description, ...await queue.importPending(candidates) };
  } else if (command === 'live' && values.length === 3) {
    const [venueId, name, suburb] = values;
    await queue.list(); // Do not spend a request on a known malformed queue.
    const candidates = await discoverCafeVideos({ venueId, name, suburb }, { mode: 'live', fetcher: options.fetcher });
    return { notice, mode: 'live', ...await queue.importPending(candidates) };
  } else if (command === 'tiktok' && values.length === 3) {
    const [venueId, name, suburb] = values;
    await queue.list(); // Validate existing storage before starting a browser.
    const result = await discoverTikTokCafeVideos({ venueId, name, suburb }, {
      mode: 'live', collector: options.tiktokCollector,
    });
    return { notice, mode: 'tiktok-local', received: result.received,
      matching: result.candidates.length, ...await queue.importPending(result.candidates) };
  } else if (command === 'list' && values.length === 0) {
    return { notice, records: await queue.list() };
  } else if ((command === 'approve' || command === 'reject') && values.length === 1) {
    const record = await queue.decide(values[0], command === 'approve' ? 'approved' : 'rejected');
    return { notice, record };
  } else if (command === 'export' && values.length === 1) {
    const output = resolve(values[0]);
    requirePrivatePath(output);
    return { notice, ...await exportApprovedVideos(queuePath, output) };
  } else throw new Error(usage);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(await runReviewCommand(process.argv.slice(2)), null, 2)); }
  catch (error) {
    console.error(error instanceof Error ? error.message : 'Local review command failed.');
    process.exitCode = 1;
  }
}
