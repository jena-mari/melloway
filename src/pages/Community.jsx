import { useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Heart,
  ThumbsUp,
  MessageCircle,
  ArrowUpRight,
  Plus,
  Search,
  X,
  UserRound,
  ArrowRight,
} from "lucide-react";
import { useApp } from "../hooks/useApp";
import { MoodImage, Field, Button } from "../components/UI";
import { communityExamples } from "../data/community";
import useCommunity from "../hooks/useCommunity";
import { profileHandle } from "../utils/profile";
import { createId } from "../utils/id";
import BrandLogo from "../components/BrandLogo";
import { communityRouteSnapshot } from "../utils/routeHistory";

import { Avatar, timeAgo } from "../components/CommunityIdentity";

export function CommunityPost({
  post,
  liked,
  onLike,
  replies,
  onReply,
  saved,
  onSave,
  author,
  handle,
}) {
  const hasRoute = post.plan?.stops?.length >= 1;
  const [threadOpen, setThreadOpen] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [saving, setSaving] = useState(false);
  async function bookmark() {
    setSaving(true);
    try {
      await onSave(post.plan);
    } finally {
      setSaving(false);
    }
  }
  function submitReply(event) {
    event.preventDefault();
    if (replyText.trim() && onReply(replyText.trim())) setReplyText("");
  }
  return (
    <article
      className="community-post"
      aria-labelledby={`post-title-${post.id}`}
    >
      <header className="community-person">
        <Avatar
          name={post.author || "you"}
          colour={post.colour}
          src={post.avatar}
        />
        <div>
          <p className="community-byline">
            <strong>{post.author || "you"}</strong>
            <span>@{post.handle || "you"}</span>
            <small>{post.sample ? "sample" : timeAgo(post.createdAt)}</small>
          </p>
        </div>
      </header>
      <div className="community-post-copy">
        <h2 id={`post-title-${post.id}`}>{post.name}</h2>
        <p>{post.description}</p>
      </div>
      {hasRoute && (
        <div
          className="community-photo-strip"
          aria-label={`Stops for ${post.name}`}
        >
          {post.plan.stops.map((stop) => (
            <Link
              key={stop.id}
              to={`/community/${post.id}?stop=${encodeURIComponent(stop.id)}`}
              className="community-stop-photo"
              aria-label={`view ${stop.name} in full route`}
            >
              <span className="community-feed-photo">
                {stop.image && (
                  <MoodImage
                    src={stop.image}
                    alt={
                      stop.source === "demo"
                        ? "Illustrative mood photograph"
                        : ""
                    }
                  />
                )}
                <span className="community-photo-fallback" aria-hidden="true">
                  ✳
                </span>
              </span>
              <strong>{stop.name}</strong>
            </Link>
          ))}
        </div>
      )}
      {(post.photo || (!hasRoute && post.image)) && (
        <div className="community-memory-photo">
          <MoodImage src={post.photo || post.image} alt="Shared memory" />
        </div>
      )}
      {hasRoute && (
        <div className="community-route-line">
          <Link className="community-open-route" to={`/community/${post.id}`}>
            <span className="sr-only">check full route here</span>
            <span aria-hidden="true">view route</span>{" "}
            <ArrowRight size={15} aria-hidden="true" />
          </Link>
        </div>
      )}
      <div className="community-post-actions">
        <button
          type="button"
          aria-label={`Replies to ${post.name}`}
          aria-expanded={threadOpen}
          aria-controls={`thread-${post.id}`}
          onClick={() => setThreadOpen(!threadOpen)}
        >
          <MessageCircle size={19} />
          <span>{replies.length}</span>
        </button>
        <button
          type="button"
          aria-label={`Like ${post.name}`}
          aria-pressed={liked}
          onClick={onLike}
        >
          <ThumbsUp size={19} fill={liked ? "currentColor" : "none"} />
          <span>{liked ? 1 : 0}</span>
        </button>
        {hasRoute && (
          <button
            type="button"
            className="community-route-save"
            aria-label={`${saved ? "Unsave" : "Save"} route ${post.name}`}
            aria-pressed={saved}
            disabled={saving}
            onClick={bookmark}
          >
            <Heart
              size={29}
              strokeWidth={2.2}
              fill={saved ? "currentColor" : "none"}
            />
          </button>
        )}
      </div>
      {threadOpen && (
        <section
          className="community-thread"
          id={`thread-${post.id}`}
          aria-label={`Replies to ${post.name}`}
        >
          <h3>replies</h3>
          <ol>
            {replies.map((reply) => (
              <li key={reply.id}>
                <Avatar name={reply.author} />
                <div>
                  <p className="reply-byline">
                    <strong>{reply.author}</strong>
                    <span>
                      @{reply.handle} · {timeAgo(reply.createdAt)}
                    </span>
                  </p>
                  <p>{reply.text}</p>
                </div>
              </li>
            ))}
          </ol>
          <form onSubmit={submitReply}>
            <label htmlFor={`reply-${post.id}`}>
              reply as {author} <span>@{handle}</span>
            </label>
            <textarea
              id={`reply-${post.id}`}
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              maxLength={280}
              rows={2}
              placeholder="add a reply"
              required
            />
            <div>
              <small>replies stay on this device</small>
              <button type="submit" disabled={!replyText.trim()}>
                reply <ArrowUpRight size={14} />
              </button>
            </div>
          </form>
        </section>
      )}
    </article>
  );
}
export default function Community() {
  const { history, saved, save, remove, current, draft, profile, setStatus } = useApp();
  const {
    posts,
    likes,
    replies,
    addPost,
    like,
    reply: addReply,
  } = useCommunity();
  const [examples] = useState(communityExamples);
  const [params, setParams] = useSearchParams();
  const sharedDate = history.find(r => r.id === params.get("history"));
  const [show, setShow] = useState(params.get("compose") === "1");
  const [photo, setPhoto] = useState("");
  const [query, setQuery] = useState("");
  useEffect(() => {
    if (show) document.getElementById("title")?.focus();
  }, [show]);
  const available = [
    ...new Map(
      [...(sharedDate ? [sharedDate.plan] : []), ...(current?.plan ? [current.plan] : []), ...saved].map((plan) => [
        plan.id,
        plan,
      ]),
    ).values(),
  ];
  const author = profile?.name || draft.name || "you";
  const handle = profile?.handle || profileHandle(author);
  function reply(postId, text) {
    return addReply(postId, text, author, handle);
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
      author: profile?.name || data.get("author").trim() || "you",
      handle:
        profile?.handle || data.get("handle").replace(/^@/, "").toLowerCase(),
      avatar: profile?.avatar,
      area: plan?.prefs.area || "Sydney",
      rating: data.get("rating") ? Number(data.get("rating")) : undefined,
      image: photo || plan?.stops[0].image,
      photo: photo || undefined,
      plan: plan ? communityRouteSnapshot(plan) : undefined,
      createdAt: new Date().toISOString(),
    };
    if (!post.name || !post.description) {
      setStatus("Add a title and a little detail first.");
      return;
    }
    if (addPost(post)) {
      setShow(false);
      setParams({});
      setPhoto("");
      setQuery("");
      setStatus("Added to ur device feed. This is not publicly published.");
    }
  }
  const text = query.trim().toLowerCase();
  const feed = [...posts, ...examples].filter(
    (post) =>
      !text ||
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
        .includes(text.replace(/^@/, "")),
  );
  return (
    <div className="page community-page">
      <h1 className="sr-only">community feed</h1>
      <header className="community-feed-header">
        <Link
          to="/profile"
          className="community-profile-link"
          aria-label="Your profile"
        >
          <UserRound size={23} strokeWidth={2.4} aria-hidden="true" />
        </Link>
        <label className="community-search" htmlFor="ideas-search">
          <span className="sr-only">search posts</span>
          <input
            id="ideas-search"
            type="search"
            placeholder="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query ? (
            <button
              type="button"
              aria-label="clear search"
              onClick={() => {
                setQuery("");
                document.getElementById("ideas-search")?.focus();
              }}
            >
              <X size={18} />
            </button>
          ) : (
            <Search size={19} aria-hidden="true" />
          )}
        </label>
        <Link to="/" className="community-home-mark" aria-label="melloway home">
          <BrandLogo decorative />
        </Link>
      </header>
      {show && (
        <form
          id="community-composer"
          className="share-form community-composer"
          onSubmit={share}
        >
          <h2>new post</h2>
          {profile ? (
            <div className="community-composer-identity">
              <Avatar name={author} src={profile.avatar} />
              <span>
                <strong>{author}</strong>
                <small>@{handle}</small>
              </span>
              <Link to="/profile" aria-label="Edit your profile">
                edit
              </Link>
            </div>
          ) : (
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
          )}
          <Field
            label="title"
            id="title"
            name="title"
            defaultValue={sharedDate ? sharedDate.plan.title || sharedDate.plan.prefs.area : ""}
            required
            maxLength={80}
          />
          <label className="field">
            <span>attach a route</span>
            <select name="plan" defaultValue={sharedDate?.id || available[0]?.id || ""}>
              <option value="">no route</option>
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
              <Link to="/plan/profile">make a route</Link> to attach one.
            </p>
          )}
          <label className="field" htmlFor="description">
            <span>post</span>
            <textarea
              id="description"
              aria-label="post"
              name="description"
              defaultValue={sharedDate?.review.text || ""}
              required
              maxLength={300}
              rows={3}
              placeholder="what made it a good day?"
            />
          </label>
          <div className="two-fields">
            <label className="field">
              <span>your rating</span>
              <select name="rating" defaultValue={sharedDate ? sharedDate.review.rating || '' : 5}>
                <option value="">unrated</option>
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
      <section className="community-feed" aria-label="community route posts">
        {feed.map((post) => (
          <CommunityPost
            key={post.id}
            post={post}
            liked={likes.includes(post.id)}
            onLike={() => like(post.id)}
            replies={replies[post.id] || []}
            onReply={(text) => reply(post.id, text)}
            saved={saved.some((plan) => plan.id === post.plan?.id)}
            onSave={(plan) =>
              saved.some((p) => p.id === plan.id)
                ? remove(plan.id)
                : save(plan)
            }
            author={author}
            handle={handle}
          />
        ))}
        {!feed.length && (
          <div className="community-empty">
            <p>no posts found</p>
            <button
              type="button"
              className="text-button"
              onClick={() => setQuery("")}
            >
              see all posts
            </button>
          </div>
        )}
      </section>
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
        {show ? <X size={24} /> : <Plus size={24} />}
      </button>
    </div>
  );
}
