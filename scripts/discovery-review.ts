/** Mock-only CLI; intentionally no live mode, dotenv loading, endpoints or publishing. */
import { readFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { discoverCafeVideos } from '../server/socialDiscovery.ts';
import { createLocalReviewQueue } from '../server/discoveryReviewQueue.ts';
import type { SocialSearchSource } from '@melloway/domain';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const privateDirectory = resolve(root, '.local/discovery');
const notice = 'Private local curation tool, not secure multi-user moderation. Matches remain tentative.';
const usage = 'Usage: discovery:review -- [--queue path] mock <venue-id> "<exact name>" "<Sydney suburb>" <mock-sources.json> | list | approve <id> | reject <id>';
const inside = (parent: string, child: string) => {
  const rel = relative(parent, child);
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
};

try {
  const args = process.argv.slice(2);
  let queuePath = resolve(privateDirectory, 'review-queue.json');
  const flag = args.indexOf('--queue');
  if (flag !== -1) {
    if (!args[flag + 1] || args[flag + 1].startsWith('--')) throw new Error(usage);
    queuePath = resolve(args[flag + 1]);
    args.splice(flag, 2);
  }
  if (args.some(arg => arg.startsWith('--'))) throw new Error(usage);
  // Repository-local generated data must stay in the directory ignored by Git.
  if (inside(root, queuePath) && !inside(privateDirectory, queuePath)) {
    throw new Error('Keep repository-local queues inside .local/discovery/, or use a path outside the repository.');
  }
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
    console.log(JSON.stringify({ notice, mode: 'mock', fixture: fixture.description,
      ...await queue.importPending(candidates) }, null, 2));
  } else if (command === 'list' && values.length === 0) {
    console.log(JSON.stringify({ notice, records: await queue.list() }, null, 2));
  } else if ((command === 'approve' || command === 'reject') && values.length === 1) {
    const record = await queue.decide(values[0], command === 'approve' ? 'approved' : 'rejected');
    console.log(JSON.stringify({ notice, record }, null, 2));
  } else throw new Error(usage);
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Local review command failed.');
  process.exitCode = 1;
}
