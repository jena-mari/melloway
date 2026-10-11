import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Play, Plus, X } from "lucide-react";
import { discoverSocial, previewSocial } from "../services/social.js";
import { socialEmbed, socialPost } from "../utils/social.js";
import { readLocal, writeLocal } from "../services/storage.js";

const storageKey = (venue) =>
  `melloway.social.${JSON.stringify([venue.name, venue.lat, venue.lng])}`;
function savedLinks(key) {
  const value = readLocal(key, []);
  return Array.isArray(value)
    ? value.filter((link) => socialPost(link)).slice(0, 12)
    : [];
}

function InstagramPreview({ post }) {
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
        title="Instagram preview"
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

export default function VenueSocial({ venue }) {
  const [posts, setPosts] = useState([]),
    [filter, setFilter] = useState("all"),
    [state, setState] = useState("loading");
  const [selected, setSelected] = useState(null),
    [adding, setAdding] = useState(false),
    [url, setUrl] = useState("");
  const [error, setError] = useState(""),
    [saving, setSaving] = useState(false);
  const controller = useRef(null);
  const key = storageKey(venue);
  useEffect(() => {
    const abort = new AbortController();
    controller.current = abort;
    setPosts([]);
    setState("loading");
    setFilter("all");
    setSelected(null);
    setError("");
    setAdding(false);
    const links = savedLinks(key);
    // Shared links appear immediately, even if search or metadata is unavailable.
    setPosts(links.map((link) => ({ ...socialPost(link), shared: true })));
    Promise.allSettled([
      discoverSocial(venue, abort.signal),
      Promise.all(
        links.map(async (link) => ({
          ...(await previewSocial(link, abort.signal)),
          shared: true,
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
          if (currentLinks.has(post.url)) merged.set(post.url, post);
        return [...merged.values()].map((post) => ({
          ...post,
          shared: currentLinks.has(post.url),
        }));
      });
      setState(discovered.status === "fulfilled" ? "ready" : "unavailable");
    });
    return () => abort.abort();
  }, [key]);
  async function addPost(event) {
    event.preventDefault();
    const post = socialPost(url.trim());
    if (!post) {
      setError("Use a TikTok video or Instagram post link.");
      return;
    }
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
        { ...preview, shared: true },
      ]);
      setFilter("all");
      setUrl("");
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
      setPosts((previous) => previous.filter((item) => item.url !== post.url));
    } catch {
      setAdding(true);
      setError("Couldn’t update saved links.");
    }
  }
  const visible = posts.filter(
    (post) => filter === "all" || post.platform === filter,
  );
  const search = encodeURIComponent(`${venue.name} Sydney`);
  return (
    <section className="venue-social" aria-labelledby="venue-social-title">
      <header>
        <h2 id="venue-social-title">see the vibe</h2>
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
      <div className="social-platforms" role="group" aria-label="filter posts">
        {["all", "TikTok", "Instagram"].map((platform) => (
          <button
            key={platform}
            aria-pressed={filter === platform}
            onClick={() => setFilter(platform)}
          >
            {platform}
          </button>
        ))}
      </div>
      {adding && (
        <form onSubmit={addPost} className="social-link-form">
          <label htmlFor="venue-social-url">post link</label>
          <div>
            <input
              id="venue-social-url"
              type="url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="TikTok or Instagram URL"
              required
              maxLength={500}
            />
            <button disabled={saving}>{saving ? "adding…" : "add"}</button>
          </div>
          <small>Links you add stay on this device.</small>
          {error && <p role="alert">{error}</p>}
        </form>
      )}
      {visible.length > 0 && (
        <div className="venue-social-grid">
          {visible.map((post) => (
            <div className="venue-social-item" key={post.url}>
              <button
                className="venue-social-card"
                onClick={() => setSelected(post)}
                aria-label={`watch ${post.platform} post${post.creator ? ` by ${post.creator}` : ""}`}
              >
                <div className="social-card-media">
                  {post.platform === "Instagram" ? (
                    <InstagramPreview post={post} />
                  ) : post.thumbnail ? (
                    <img
                      src={post.thumbnail}
                      alt=""
                      loading="lazy"
                      onError={(event) => {
                        event.currentTarget.style.display = "none";
                      }}
                    />
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
            </div>
          ))}
        </div>
      )}
      {state === "loading" && (
        <p className="social-status" role="status">
          finding posts…
        </p>
      )}
      {state !== "loading" && !visible.length && (
        <p className="social-status">
          {posts.length
            ? `No ${filter} posts yet.`
            : state === "unavailable"
              ? "Post search is unavailable right now."
              : "No public posts found yet."}
        </p>
      )}
      <div className="social-search-links">
        <a
          href={`https://www.tiktok.com/search?q=${search}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          find on TikTok <ArrowUpRight size={14} />
        </a>
        <a
          href={`https://www.instagram.com/explore/search/keyword/?q=${search}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          find on Instagram <ArrowUpRight size={14} />
        </a>
      </div>
      {selected && (
        <PostPreview post={selected} onClose={() => setSelected(null)} />
      )}
    </section>
  );
}
