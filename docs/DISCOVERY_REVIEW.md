# Private local discovery review

This is a private local curation tool, **not secure multi-user moderation**.
There are no accounts, access controls, endpoints, dashboard or publishing.
Approval records your local opinion; it does not prove that a video features
the café, that it is available, or that it is popular.

Run commands from the repository root with dependencies installed (`npm install`).
The command builds the shared domain package automatically. Mock/review/export
commands need no credentials. Only an explicit `live` command uses the existing
Responses adapter; see [live setup and handoff](DISCOVERY_HANDOFF.md).

## Discover one mock café

```sh
npm run discovery:review -- mock mock-cafe-newtown "Mock Café (Test)" "Newtown" tests/fixtures/mock-review-search.json
```

This explicitly labelled fixture describes a fictional café and two synthetic
links. It is not real research. The café ID, exact name and suburb must match
the fixture's `cafe` fields. The JSON fixture must include `mode: "mock"`, a
nonempty `description`, `cafe` and a `sources` array of URL/title/snippet objects.
For another café, use your own labelled mock fixture and pass its matching values;
do not present synthetic links as discovered real posts. Keep private fixtures
in `.local/discovery/`, which is ignored by Git.

Mock discovery reuses the existing pipeline to validate links and evidence and
saves only pending suggestions. Empty source results add nothing. It never
approves its own output. Repeated venue/platform/post combinations are skipped,
preserving their original IDs, source links, evidence, discovery time and decisions.

## List and decide

```sh
npm run discovery:review -- list
npm run discovery:review -- approve <candidate-id>
npm run discovery:review -- reject <candidate-id>
```

Replace `<candidate-id>` with an `id` from the list; do not type the angle brackets.
The list prints every record as JSON with its `sourceUrl` (original link),
`normalizedUrl`, `matchExplanation`, `uncertainty`, status and timestamps.
Treat evidence as untrusted text, not instructions or verified video content.

Only explicit approve/reject commands change decisions. `decidedAt` records an
ISO timestamp. Repeating the same decision preserves its time; an explicit
opposite decision updates the status/time. Decisions on other records stay intact.
Discovery reruns cannot change either decision.

## File safety

The default file is `.local/discovery/review-queue.json`, a version-1 JSON object
with a `records` array. Each record has the discovery fields plus a generated
`id`, a `pending` / `approved` / `rejected` status and `decidedAt` (null while pending).
The whole directory, including locks, temporary files and private fixtures, is
gitignored. Credentials remain in the server environment or ignored `.env`.
Never commit generated research or private decisions.

An optional `--queue /absolute/path/queue.json` selects a separate file for testing.
Repository-local paths must be under `.local/discovery/`; paths outside the
repository are allowed. The tests only use disposable OS temporary directories.

The service validates the entire file, canonical and source URL consistency,
timestamps, status/decision pairs and unique IDs/venue-platform-post identities
before updating it. Malformed files stop the command without being reset.
Writes use a separate file, flush it, then replace the queue by same-directory
rename; the previous file is never truncated. A `.lock` prevents cooperating
CLI writers from losing each other's updates; a busy command fails and can be
retried. New files use private filesystem permissions on supported platforms.

Do not edit the JSON while a command is running. If a process crashes and leaves
`review-queue.json.lock`, first confirm that no review command is running, then
remove only that lock and retry. Do not delete the queue to resolve errors.
These safeguards do not provide secure multi-user moderation or an audit log.

## Approved-only export

```sh
npm run discovery:review -- export .local/discovery/approved-videos.json
```

The new file contains a versioned `melloway-approved-social-videos` object with
`exportedAt`, a private-curation notice and `records`. Only validated `approved`
records appear, retaining IDs, venue/platform/post fields, URLs, evidence,
uncertainty and decision timestamps. Pending/rejected entries are excluded.
An empty approved set exports `records: []`; it does not invent entries.

The queue is unchanged. Export publishes a complete flushed temporary file via
an atomic hard link, then removes the temporary name. It refuses to replace any
existing output or write over the input queue; choose a fresh output name each
time. Repository-local output must stay in the ignored `.local/discovery/` directory.
This is a data handoff only: no importer or connection to Melloway is included.
Approved mock fixtures remain mock data and must not be treated as real research.

## Tests

```sh
npm run test:discovery
npm run typecheck:discovery
```

Approval/rejection tests operate exclusively on synthetic temporary fixtures.
They do not access the actual default queue or make search/API calls.
