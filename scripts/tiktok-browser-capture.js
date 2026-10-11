// Run once on a loaded TikTok search page. Reads displayed DOM only: no requests,
// cookies, storage, scrolling, page navigation or video downloads.
(() => {
  const page = new URL(location.href);
  const query = page.searchParams.get('q');
  if (page.origin !== 'https://www.tiktok.com' || !/^\/search\/?$/.test(page.pathname)
    || !query?.trim() || query.length > 300) throw new Error('Open a TikTok search page with loaded results first.');
  const sources = [];
  const seen = new Set();
  const links = document.querySelectorAll('a[href*="/video/"], a[href*="/photo/"]');
  for (const link of Array.from(links).slice(0, 20)) {
    let url;
    try { url = new URL(link.getAttribute('href'), page); } catch { continue; }
    if (url.origin !== 'https://www.tiktok.com' || url.username || url.password
      || !/^\/@[A-Za-z0-9_.]{1,100}\/video\/[0-9]{1,30}$/.test(url.pathname)) continue;
    const canonical = `${url.origin}${url.pathname}`;
    if (seen.has(canonical)) continue;
    seen.add(canonical);
    // Image alt text is the caption TikTok displays for the post, not the query
    // or a view count. If absent, leave evidence blank for the matcher to exclude.
    const snippet = link.querySelector('img')?.getAttribute('alt') || '';
    sources.push({ url: canonical, snippet: snippet.slice(0, 8192) });
  }
  const search = new URL('/search', page.origin);
  search.searchParams.set('q', query);
  return { version: 1, mode: 'browser-capture', searchUrl: search.href,
    capturedAt: new Date().toISOString(), sources };
})();
