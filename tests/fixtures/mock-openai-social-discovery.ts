// MOCK ONLY: fictional café, synthetic video URLs and Responses payloads. No real posts/searches.
export const mockCafe = { venueId: 'mock-cafe-newtown', name: 'Mock Café (Test)', suburb: 'Newtown' };
export const mockNow = () => new Date('2026-10-11T06:00:00.000Z');
export const mockUrls = [
  'https://tiktok.com/@mock_fixture/video/9000000000000000001/?share=fixture',
  'https://instagram.com/reel/MOCK_Reel-2?igsh=fixture',
];
export const mockEvidence = 'Fictional fixture: Mock Café (Test), Newtown. This is not a real video.';
export const mockCandidates = mockUrls.map(url => ({ url, evidence: mockEvidence }));
export function mockResponse(sources = mockUrls, candidates = mockCandidates) {
  return { id: 'mock-response', status: 'completed', error: null, incomplete_details: null, output: [
    { id: 'mock-search', type: 'web_search_call', status: 'completed',
      action: { type: 'search', queries: ['"Mock Café (Test)" "Newtown" Sydney'],
        sources: sources.map(url => ({ type: 'url', url })) } },
    { id: 'mock-message', type: 'message', role: 'assistant', status: 'completed',
      content: [{ type: 'output_text', text: JSON.stringify({ candidates }), annotations: [] }] },
  ] };
}
