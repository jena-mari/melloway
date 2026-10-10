// MOCK ONLY: fictional café, synthetic post identifiers, no live search or posts.
export const mockCafe = { venueId: 'mock-cafe-newtown', name: 'Mock Café (Test)', suburb: 'Newtown' };
export const mockSources = [
  {
    url: 'https://tiktok.com/@mock_fixture/video/9000000000000000001/?share=fixture',
    title: 'Mock Café (Test) — Newtown',
    snippet: 'Fictional search fixture for testing only; no real video is asserted.',
  },
  {
    url: 'https://instagram.com/reel/MOCK_Reel-2?igsh=fixture',
    title: 'Fictional café fixture',
    snippet: 'Testing Mock Café (Test) in Newtown. Synthetic search evidence only.',
  },
];
export const mockNow = () => new Date('2026-10-11T04:00:00.000Z');
