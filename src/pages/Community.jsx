import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Heart,
  Bookmark,
  ArrowUpRight,
  Plus,
  Search,
  MapPin,
  Clock,
  X,
} from "lucide-react";
import { useApp } from "../hooks/useApp";
import { MoodImage, Field, Button } from "../components/UI";
import { communityExamples } from "../data/community";
import { readLocal, writeLocal } from "../services/storage";
import { createId } from "../utils/id";
const RouteMap = lazy(() => import("../components/RouteMap"));

function Avatar({ name, colour = "pink" }) {
  return (
    <span className={`community-avatar avatar-${colour}`} aria-hidden="true">
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}
function RouteAttachment({ post, onOpen }) {
  const { saved, save, remove } = useApp();
  const [selected, setSelected] = useState(post.plan.stops[0].id);
  const [visible, setVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const preview = useRef(null);
  const kept = saved.some((plan) => plan.id === post.plan.id);
  useEffect(() => {
    if (!window.IntersectionObserver) {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(preview.current);
    return () => observer.disconnect();
  }, []);
  async function bookmark() {
    setSaving(true);
    try {
      await (kept ? remove(post.plan.id) : save(post.plan));
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="community-route">
      <div className="community-route-heading">
        <span>
          <MapPin size={14} aria-hidden="true" />
          {post.area} · {post.plan.stops.length} stops
        </span>
        <span>~${post.plan.cost} each</span>
      </div>
      <div ref={preview} className="community-map-preview">
        {visible && (
          <Suspense
            fallback={
              <div className="community-map-loading" role="status">
                bringing up the route…
              </div>
            }
          >
            <RouteMap
              id={`post-map-${post.id}`}
              title={post.name}
              compact
              stops={post.plan.stops}
              transport={post.plan.prefs.transport}
              selectedStopId={selected}
              onSelectStop={setSelected}
            />
          </Suspense>
        )}
      </div>
      <ol className="community-stops" aria-label={`Stops for ${post.name}`}>
        {post.plan.stops.map((stop, i) => (
          <li key={stop.id}>
            <button
              type="button"
              aria-pressed={selected === stop.id}
              onClick={() => setSelected(stop.id)}
            >
              <span>{i + 1}</span>
              <strong>{stop.name}</strong>
            </button>
          </li>
        ))}
      </ol>
      <div className="community-route-footer">
        <span>
          <Clock size={13} aria-hidden="true" />
          {Math.round((post.plan.elapsed / 60) * 10) / 10}h ·{" "}
          {post.plan.prefs.transport.toLowerCase()}
        </span>
        <button
          type="button"
          aria-label={`${kept ? "Unsave" : "Save"} route ${post.name}`}
          aria-pressed={kept}
          disabled={saving}
          onClick={bookmark}
        >
          <Bookmark size={16} fill={kept ? "currentColor" : "none"} />
          {saving ? "saving…" : kept ? "saved" : "save"}
        </button>
      </div>
      <button type="button" className="community-open-route" onClick={onOpen}>
        see this route <ArrowUpRight size={16} />
      </button>
    </div>
  );
}
function CommunityPost({ post, liked, onLike, onOpen }) {
  const hasRoute = post.plan?.stops?.length >= 1;
  const photo =
    post.photo || (post.image?.startsWith("data:") ? post.image : null);
  return (
    <article
      className="community-post"
      aria-labelledby={`post-title-${post.id}`}
    >
      <header className="community-person">
        <Avatar name={post.author || "you"} colour={post.colour} />
        <div>
          <strong>{post.author || "you"}</strong>
          <span>@{post.handle || "you"}</span>
        </div>
        <span className="community-post-kind">
          {post.sample ? "sample" : "on ur device"}
        </span>
      </header>
      <div className="community-post-copy">
        <h2 id={`post-title-${post.id}`}>{post.name}</h2>
        <p>{post.description}</p>
      </div>
      {hasRoute && photo && (
        <div className="community-memory-photo">
          <MoodImage src={photo} alt="Shared memory" />
        </div>
      )}
      {hasRoute ? (
        <RouteAttachment post={post} onOpen={onOpen} />
      ) : post.image ? (
        <div className="community-memory-photo">
          <MoodImage src={post.image} alt="Shared memory" />
        </div>
      ) : null}
      <div className="community-post-actions">
        <button
          type="button"
          aria-label={`Like ${post.name}`}
          aria-pressed={liked}
          onClick={onLike}
        >
          <Heart size={19} fill={liked ? "currentColor" : "none"} />
          {liked ? "liked" : "like"}
        </button>
        <span>
          {post.rating} / 5 day{post.sample ? " · sample rating" : ""}
        </span>
      </div>
    </article>
  );
}
export default function Community() {
  const { saved, current, draft, setStatus, setCurrent } = useApp();
  const navigate = useNavigate();
  const [posts, setPosts] = useState(() => {
    const data = readLocal("melloway.posts", []);
    return Array.isArray(data) ? data : [];
  });
  const [examples] = useState(communityExamples);
  const [likes, setLikes] = useState(() => {
    const data = readLocal("melloway.likes", []);
    return Array.isArray(data) ? data : [];
  });
  const [show, setShow] = useState(false);
  const [photo, setPhoto] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("for you");
  const available = [
    ...new Map(
      [...(current?.plan ? [current.plan] : []), ...saved].map((plan) => [
        plan.id,
        plan,
      ]),
    ).values(),
  ];
  const author = draft.name || "you";
  const handle =
    author
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, "")
      .slice(0, 24) || "you";
  function like(id) {
    const next = likes.includes(id)
      ? likes.filter((item) => item !== id)
      : [...likes, id];
    try {
      writeLocal("melloway.likes", next);
      setLikes(next);
    } catch {
      setStatus("Unable to store this like.");
    }
  }
  function file(event) {
    const image = event.target.files[0];
    if (!image) {
      setPhoto("");
      return;
    }
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(image.type) ||
      image.size > 1500000
    ) {
      setStatus("Choose a JPEG, PNG or WebP photo under 1.5 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setPhoto(reader.result);
    reader.readAsDataURL(image);
  }
  function share(event) {
    event.preventDefault();
    const data = new FormData(event.target);
    const plan = available.find((item) => item.id === data.get("plan"));
    const post = {
      id: createId(),
      name: data.get("title").trim(),
      description: data.get("description").trim(),
      author: data.get("author").trim() || "you",
      handle: data.get("handle").replace(/^@/, "").toLowerCase(),
      area: plan?.prefs.area || "Sydney",
      rating: Number(data.get("rating")),
      image: photo || plan?.stops[0].image,
      photo: photo || undefined,
      plan,
      createdAt: new Date().toISOString(),
    };
    if (!post.name || !post.description) {
      setStatus("Add a title and a little detail first.");
      return;
    }
    try {
      const next = [post, ...posts];
      writeLocal("melloway.posts", next);
      setPosts(next);
      setShow(false);
      setPhoto("");
      setQuery("");
      setFilter("for you");
      setStatus("Added to ur device feed. This is not publicly published.");
    } catch {
      setStatus(
        "Photo or post is too large for browser storage. Try a smaller photo.",
      );
    }
  }
  const text = query.trim().toLowerCase();
  const feed = [...posts, ...examples].filter(
    (post) =>
      (filter !== "liked" || likes.includes(post.id)) &&
      (filter !== "your posts" || !post.sample) &&
      (!text ||
        [
          post.name,
          post.author,
          post.handle,
          post.description,
          post.area,
          ...(post.plan?.stops || []).map((stop) => stop.name),
        ]
          .join(" ")
          .toLowerCase()
          .includes(text.replace(/^@/, ""))),
  );
  return (
    <div className="page community-page">
      <header className="community-heading">
        <div>
          <h1>the ideas club.</h1>
          <p>little routes from people like u.</p>
        </div>
        <button
          type="button"
          className="community-compose-button"
          aria-label={show ? "close new post" : "share a route"}
          aria-expanded={show}
          aria-controls="community-composer"
          onClick={() => {
            setShow(!show);
            setPhoto("");
          }}
        >
          {show ? <X size={22} /> : <Plus size={22} />}
        </button>
      </header>
      <details className="community-notice">
        <summary>community preview</summary>
        <p>
          Example people, routes and ratings are fictional. Your posts and likes
          stay on this device.
        </p>
      </details>
      {show && (
        <form
          id="community-composer"
          className="share-form community-composer"
          onSubmit={share}
        >
          <h2>ur route, ur take.</h2>
          <div className="community-identity-fields">
            <Field
              label="display name"
              id="post-author"
              name="author"
              defaultValue={author}
              required
              maxLength={40}
            />
            <Field
              label="your @"
              id="post-handle"
              name="handle"
              defaultValue={handle}
              required
              maxLength={25}
              pattern="@?[A-Za-z0-9_.]{1,24}"
              title="Use up to 24 letters, numbers, dots or underscores."
            />
          </div>
          <Field
            label="give it a little title"
            id="title"
            name="title"
            required
            maxLength={80}
          />
          <label className="field">
            <span>attach a route</span>
            <select name="plan" defaultValue={available[0]?.id || ""}>
              <option value="">just a little idea</option>
              {available.map((plan) => (
                <option value={plan.id} key={plan.id}>
                  {plan.prefs.area} · {plan.stops.length} stops ·{" "}
                  {plan.prefs.date}
                </option>
              ))}
            </select>
          </label>
          {!available.length && (
            <p className="community-composer-tip">
              <Link to="/plan/profile">make a route</Link> to attach a map, or
              share a little idea for now.
            </p>
          )}
          <label className="field" htmlFor="description">
            <span>the little details</span>
            <textarea
              id="description"
              name="description"
              required
              maxLength={300}
              rows={3}
              placeholder="what made it a good day?"
            />
          </label>
          <div className="two-fields">
            <label className="field">
              <span>your rating</span>
              <select name="rating">
                {[5, 4, 3, 2, 1].map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>photo · optional</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={file}
              />
            </label>
          </div>
          {photo && (
            <img
              className="upload-preview"
              src={photo}
              alt="Your selected memory"
            />
          )}
          <Button type="submit">
            save to device feed <ArrowUpRight size={18} />
          </Button>
        </form>
      )}
      <label className="community-search" htmlFor="ideas-search">
        <Search size={18} aria-hidden="true" />
        <span className="sr-only">search ideas</span>
        <input
          id="ideas-search"
          type="search"
          placeholder="find a person, place or route"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      <div className="community-filters" role="group" aria-label="ideas feed">
        {["for you", "liked", "your posts"].map((tab) => (
          <button
            key={tab}
            type="button"
            aria-pressed={filter === tab}
            onClick={() => setFilter(tab)}
          >
            {tab}
          </button>
        ))}
      </div>
      <section className="community-feed" aria-label="community route posts">
        {feed.map((post) => (
          <CommunityPost
            key={post.id}
            post={post}
            liked={likes.includes(post.id)}
            onLike={() => like(post.id)}
            onOpen={() => {
              setCurrent({ plan: post.plan, candidates: [], matrix: [] });
              navigate("/itinerary");
            }}
          />
        ))}
        {!feed.length && (
          <div className="community-empty">
            <h2>
              {query
                ? "no little plans found."
                : filter === "liked"
                  ? "keep a few favourites."
                  : "ur first post starts here."}
            </h2>
            <p>
              {query
                ? "try a name, suburb or another spot."
                : filter === "liked"
                  ? "tap a heart on a post to find it here."
                  : "share a route or a little idea with the club."}
            </p>
            <button
              type="button"
              className="text-button"
              onClick={() => {
                setQuery("");
                setFilter("for you");
              }}
            >
              see all ideas
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
