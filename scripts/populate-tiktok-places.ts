import { populateTikTokPlaces } from '../server/tiktokPlaceCatalogue.ts';
import { parseArgs } from 'node:util';

try {
  const { values, positionals } = parseArgs({ options: { retry: { type: 'boolean', default: false } }, allowPositionals: true });
  if (positionals.length > 1) throw new Error('Usage: npm run discovery:populate -- [--retry] ["Sydney café search query"]');
  const result = await populateTikTokPlaces(positionals[0], { retry: values.retry });
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : 'TikTok place population failed.');
  process.exitCode = 1;
}
