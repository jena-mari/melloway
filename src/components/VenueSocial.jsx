import { cleanEvidence } from '../engine/recommendationEvidence.js';
import { useEffect, useId, useRef, useState } from "react";
import { ArrowUpRight, Instagram, Play, Plus, X } from "lucide-react";
import { discoverSocial, previewSocial } from "../services/social.js";
import { socialEmbed, socialPost } from "../utils/social.js";
import { readLocal, writeLocal } from "../services/storage.js";
import { venuePostLinks } from "../data/venuePosts.ts";
import { inferSocialContext, mediaVenueKey } from '@melloway/domain';

const storageKey = (venue) =>
  `melloway.social.${JSON.stringify([venue.name, venue.lat, venue.lng])}`;
function savedLinks(key) {
  const value = readLocal(key, []);
  return Array.isArray(value)
    ? value.filter((link) => socialPost(link)).slice(0, 12)
    : [];
}

export function EmbeddedPreview({ post }) {
  const frame = useRef(null);
  const [width, setWidth] = useState(160);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) =>
      setWidth(entry.contentRect.width),
    );
    observer.observe(frame.current);
    return () => observer.disconnect();
  }, []);
  return (
    <div
      ref={frame}
      className="social-instagram-preview"
      aria-hidden="true"
      inert
    >
      <iframe
        src={socialEmbed(post)}
        title={`${post.platform} preview`}
        loading="lazy"
        tabIndex={-1}
        style={{ transform: `scale(${width / 320})` }}
      />
    </div>
  );
}

function PostPreview({ post, onClose }) {
  const dialog = useRef(null);
  useEffect(() => {
    dialog.current.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className="venue-social-dialog"
      aria-labelledby="social-player-title"
      onClose={onClose}
      onClick={(event) => {
        if (event.target === dialog.current) dialog.current.close();
      }}
    >
      <header>
        <h2 id="social-player-title">{post.platform}</h2>
        <button
          className="icon-button"
          aria-label="close post"
          autoFocus
          onClick={() => dialog.current.close()}
        >
          <X size={20} />
        </button>
      </header>
      <iframe
        src={socialEmbed(post)}
        title={`${post.platform} post`}
        allow="fullscreen; encrypted-media; picture-in-picture"
        allowFullScreen
      />
      <a href={post.url} target="_blank" rel="noopener noreferrer">
        open on {post.platform} <ArrowUpRight size={16} />
      </a>
      <p>Preview not loading? Open the original post.</p>
    </dialog>
  );
}

export default function VenueSocial({ venue, compact = false }) {
  const titleId = useId(), inputId = useId();
  const [posts, setPosts] = useState([]),
    [state, setState] = useState("loading");
  const [selected, setSelected] = useState(null),
    [adding, setAdding] = useState(false),
    [url, setUrl] = useState("");
  const [error, setError] = useState(""),
    [saving, setSaving] = useState(false);
  const [confirmed, setConfirmed] = useState(false), [attempt, setAttempt] = useState(0);
  const controller = useRef(null);
  const key = storageKey(venue);
  const attached = venuePostLinks(venue);
  const attachedKey = JSON.stringify(attached);
  useEffect(() => {
    const abort = new AbortController();
    controller.current = abort;
    setPosts([]);
    setState("loading");
    setSelected(null);
    setError("");
    setAdding(false);
    setConfirmed(false);
    setSaving(false);
    const links = savedLinks(key);
    const previewLinks = [...new Set([...attached, ...links])];
    // Attached and shared links appear even without search or metadata.
    const researched = cleanEvidence(venue.recommendationEvidence).flatMap(item => {
      const post = socialPost(item.url); return post ? [{ ...post, caption: item.summary, discovery: 'web' }] : [];
    });
    const initial = [...researched, ...previewLinks.map(link => ({
      ...socialPost(link), attached: attached.includes(link), shared: links.includes(link),
    }))];
    setPosts([...new Map(initial.map(post => [post.url, post])).values()]);
    Promise.allSettled([
      discoverSocial(venue, abort.signal),
      Promise.all(
        previewLinks.map(async (link) => ({
          ...(await previewSocial(link, abort.signal)),
          attached: attached.includes(link),
        })),
      ),
    ]).then(([discovered, shared]) => {
      if (abort.signal.aborted) return;
      const currentLinks = new Set(savedLinks(key));
      setPosts((existing) => {
        const merged = new Map(existing.map((post) => [post.url, post]));
        for (const post of discovered.status === "fulfilled"
          ? discovered.value
          : [])
          merged.set(post.url, post);
        for (const post of shared.status === "fulfilled" ? shared.value : [])
          if (currentLinks.has(post.url) || attached.includes(post.url)) merged.set(post.url, {
            ...merged.get(post.url), ...post,
            ...(attached.includes(post.url) ? { venueKey: mediaVenueKey(venue) } : merged.get(post.url)?.venueKey ? {} : { metadataSource: undefined }),
          });
        return [...merged.values()].map((post) => ({
          ...post,
          shared: currentLinks.has(post.url),
          attached: attached.includes(post.url),
        }));
      });
      setState(discovered.status === "fulfilled" ? "ready" : "unavailable");
    });
    return () => abort.abort();
  }, [key, attachedKey, attempt]);
  async function addPost(event) {
    event.preventDefault();
    const post = socialPost(url.trim());
    if (!post) {
      setError("Use a TikTok video or Instagram post link.");
      return;
    }
    if (!confirmed) { setError('Confirm this post shows this exact place and branch.'); return; }
    const signal = controller.current.signal;
    setSaving(true);
    setError("");
    try {
      const links = savedLinks(key);
      if (!links.includes(post.url) && links.length >= 12)
        throw new Error("Up to 12 shared posts per place.");
      const preview = await previewSocial(post.url, signal);
      if (signal.aborted) return;
      writeLocal(key, [...new Set([...links, post.url])]);
      setPosts((previous) => [
        ...previous.filter((p) => p.url !== post.url),
        { ...preview, shared: true, attached: attached.includes(post.url) },
      ]);
      setUrl("");
      setConfirmed(false);
      setAdding(false);
    } catch (failure) {
      if (!signal.aborted)
        setError(failure.message || "Couldn’t save this link.");
    } finally {
      if (!signal.aborted) setSaving(false);
    }
  }
  function removeShared(post) {
    try {
      writeLocal(
        key,
        savedLinks(key).filter((link) => link !== post.url),
      );
      setPosts((previous) => previous.flatMap(item => item.url !== post.url
        ? [item] : item.attached ? [{ ...item, shared: false }] : []));
    } catch {
      setAdding(true);
      setError("Couldn’t update saved links.");
    }
  }
  const search = encodeURIComponent(`${venue.name} Sydney`);
  const inferred = inferSocialContext(venue, posts);
  const vibe = [...inferred.atmosphere, ...inferred.interests].slice(0, 4);
  return (
    <section className={`venue-social${compact ? " venue-social-compact" : ""}`} aria-labelledby={titleId}>
      <header>
        <h2 id={titleId}>{compact ? "at this spot" : "see the vibe"}</h2>
        <button
          onClick={() => {
            setAdding(!adding);
            setError("");
          }}
          aria-label="add a post"
          aria-expanded={adding}
        >
          <Plus size={18} />
        </button>
      </header>
      {adding && (
        <form onSubmit={addPost} className="social-link-form">
          <label htmlFor={inputId}>post link</label>
          <div>
            <input
              id={inputId}
              type="url"
              value={url}
              onChange={(event) => { setUrl(event.target.value); setConfirmed(false); }}
              placeholder="TikTok or Instagram URL"
              required
              maxLength={500}
            />
            <button disabled={saving}>{saving ? "adding…" : "add"}</button>
          </div>
          <small>Links you add stay on this device.</small>
          <label className="social-confirm"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />
            This shows {venue.name} at {venue.address}.</label>
          {error && <p role="alert">{error}</p>}
        </form>
      )}
      {posts.length > 0 && (
        <div className="venue-social-grid" tabIndex={0} role="region" aria-label="Posts at this spot">
          {posts.map((post) => (
            <div className="venue-social-item" key={post.url}>
              <button
                className="venue-social-card"
                onClick={() => setSelected(post)}
                aria-label={`watch ${post.platform} post${post.creator ? ` by ${post.creator}` : ""}`}
              >
                <div className="social-card-media">
                  {post.platform === "Instagram" ? (
                    <EmbeddedPreview post={post} />
                  ) : post.thumbnail ? (
                    <img
                      src={post.thumbnail}
                      alt=""
                      loading="lazy"
                      onError={(event) => {
                        event.currentTarget.style.display = "none";
                      }}
                    />
                  ) : compact ? (
                    <EmbeddedPreview post={post} />
                  ) : (
                    <span className="social-no-thumbnail">TikTok</span>
                  )}
                  <span className="social-play">
                    <Play size={14} fill="currentColor" />
                  </span>
                  <span className="social-platform-label">{post.platform}</span>
                </div>
                <span className="social-card-caption">
                  {post.caption ||
                    (post.shared ? "shared post" : `${post.platform} post`)}
                </span>
                {post.creator && <small>{post.creator}</small>}
                {post.attached && <small>venue link</small>}
                {post.shared && <small>shared link</small>}
              </button>
              {post.shared && (
                <button
                  className="social-remove"
                  aria-label={`remove shared ${post.platform} post`}
                  onClick={() => removeShared(post)}
                >
                  <X size={14} />
                </button>
              )}
              <a className="social-original" href={post.url} target="_blank" rel="noopener noreferrer">original <ArrowUpRight size={12} /></a>
            </div>
          ))}
        </div>
      )}
      {vibe.length > 0 && <p className="social-inferred">From captions · {vibe.join(' · ')} <small>(inferred)</small></p>}
      {state === "loading" && (
        <p className="social-status" role="status">
          finding posts…
        </p>
      )}
      {state !== "loading" && !posts.length && (
        <p className="social-status">
          {state === "unavailable"
            ? "Post search is unavailable right now."
            : "No public posts found yet."}
        </p>
      )}
      {state === 'unavailable' && <button className="text-button" type="button" onClick={() => setAttempt(value => value + 1)}>retry posts</button>}
      {(!compact || !posts.length) && <div className="social-search-links">
        <a
          href={`https://www.tiktok.com/search?q=${search}`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="find on TikTok"
          title="find on TikTok"
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            focusable="false"
          >
            <path d="M14 3h3a6 6 0 0 0 4 5.2v3.2a9 9 0 0 1-4-1.6v7.1a6.1 6.1 0 1 1-7-6v3.3a2.9 2.9 0 1 0 4 2.7V3Z" />
          </svg>
        </a>
        <a
          href={`https://www.instagram.com/explore/search/keyword/?q=${search}`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="find on Instagram"
          title="find on Instagram"
        >
          <Instagram size={24} strokeWidth={1.75} aria-hidden="true" />
        </a>
      </div>}
      {selected && (
        <PostPreview post={selected} onClose={() => setSelected(null)} />
      )}
    </section>
  );
}
