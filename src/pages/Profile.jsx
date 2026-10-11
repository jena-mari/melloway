import { useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowUpRight,
  Bookmark,
  Camera,
  Heart,
  MapPin,
  MessageSquare,
  Plus,
  X,
} from "lucide-react";
import { useApp } from "../hooks/useApp";
import useCommunity, { readLikes } from "../hooks/useCommunity";
import { CommunityPost } from "./Community";
import { Avatar } from "../components/CommunityIdentity";
import { Doodle } from "../components/DoodleBackdrop";
import EventPoster from "../components/EventPoster";
import { Field } from "../components/UI";
import { communityExamples } from "../data/community";
import { events } from "../data/events";
import { writeLocal } from "../services/storage";
import { profileHandle } from "../utils/profile";

const tabs = [
  { id: "posts", label: "Your Posts", icon: MessageSquare },
  { id: "saved", label: "Your Saved", icon: Bookmark },
  { id: "likes", label: "Your Likes", icon: Heart },
];

function ProfileEditor({ identity, onSave, dialog }) {
  const [avatar, setAvatar] = useState(identity.avatar);
  const [cover, setCover] = useState(identity.cover);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState("");
  const request = useRef(0);
  function photo(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
      file.size > 1000000
    ) {
      setError("Choose a JPEG, PNG or WebP under 1 MB.");
      return;
    }
    const token = ++request.current;
    setError("");
    setReading(true);
    const reader = new FileReader();
    reader.onload = () => {
      if (token !== request.current) return;
      setAvatar(reader.result);
      setReading(false);
    };
    reader.onerror = () => {
      if (token !== request.current) return;
      setReading(false);
      setError("Couldn’t read that photo. Try another one.");
    };
    reader.readAsDataURL(file);
  }
  function submit(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const name = data.get("name").trim();
    if (!name) {
      event.currentTarget.elements.name.focus();
      return;
    }
    if (
      onSave({
        name,
        handle: data.get("handle"),
        bio: data.get("bio").trim(),
        location: data.get("location").trim(),
        avatar,
        cover,
      })
    )
      dialog.current.close();
    else
      setError(
        "Couldn’t save your profile. Check device storage and try again.",
      );
  }
  return (
    <form onSubmit={submit} className="profile-editor">
      <header>
        <button
          type="button"
          className="icon-button"
          aria-label="Close edit profile"
          onClick={() => dialog.current.close()}
        >
          <X size={22} />
        </button>
        <h2 id="edit-profile-title">edit profile</h2>
        <button className="profile-save" type="submit" disabled={reading}>
          save
        </button>
      </header>
      <div className="profile-photo-edit">
        <Avatar name={identity.name} src={avatar} />
        <label className="profile-upload">
          <Camera size={18} /> photo
          <input
            aria-label="Profile photo"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={photo}
          />
        </label>
        {avatar && (
          <button
            type="button"
            className="text-button"
            onClick={() => {
              request.current++;
              setReading(false);
              setAvatar("");
            }}
          >
            remove
          </button>
        )}
      </div>
      <Field
        label="name"
        id="profile-name"
        name="name"
        defaultValue={identity.name}
        maxLength={40}
        required
        autoComplete="name"
      />
      <Field
        label="username"
        id="profile-handle"
        name="handle"
        defaultValue={identity.handle}
        maxLength={24}
        required
        pattern="[A-Za-z0-9_.]{1,24}"
        title="Use 1–24 letters, numbers, dots or underscores."
        autoCapitalize="none"
        spellCheck={false}
      />
      <label className="field" htmlFor="profile-bio">
        <span>bio</span>
        <textarea
          id="profile-bio"
          name="bio"
          rows={3}
          defaultValue={identity.bio}
          maxLength={160}
        />
      </label>
      <Field
        label="location"
        id="profile-location"
        name="location"
        defaultValue={identity.location}
        maxLength={60}
      />
      <fieldset className="profile-cover-picker">
        <legend>cover</legend>
        {["white", "matcha", "peach"].map((colour) => (
          <button
            key={colour}
            type="button"
            aria-label={`${colour} cover`}
            aria-pressed={cover === colour}
            className={`profile-swatch cover-${colour}`}
            onClick={() => setCover(colour)}
          >
            <span aria-hidden="true">{cover === colour ? "✓" : ""}</span>
          </button>
        ))}
      </fieldset>
      <p className="profile-local-note">
        Profile and posts stay on this device.
      </p>
      {error && (
        <p className="profile-editor-error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

export default function Profile() {
  const {
    profile,
    updateProfile,
    draft,
    saved,
    savedEvents,
    toggleEventSave,
    save,
    remove,
    setCurrent,
    setStatus,
  } = useApp();
  const { posts, likes, replies, like, reply } = useCommunity();
  const [examples] = useState(communityExamples);
  const [eventLikes, setEventLikes] = useState(() =>
    readLikes("melloway.eventLikes"),
  );
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const dialog = useRef(null);
  const [editSession, setEditSession] = useState(0);
  const tab = tabs.some((t) => t.id === params.get("tab"))
    ? params.get("tab")
    : "posts";
  const identity = profile || {
    name: draft.name || "you",
    handle: profileHandle(draft.name),
    bio: "",
    location: "Sydney",
    avatar: "",
    cover: "white",
  };
  const shownPosts =
    tab === "posts"
      ? posts
      : [...posts, ...examples].filter((p) => likes.includes(p.id));
  const shownEvents = events.filter((e) =>
    (tab === "saved" ? savedEvents : eventLikes).includes(e.id),
  );
  const empty =
    tab === "saved"
      ? !saved.length && !shownEvents.length
      : !shownPosts.length && (tab !== "likes" || !shownEvents.length);
  function likeEvent(id) {
    const next = eventLikes.filter((item) => item !== id);
    try {
      writeLocal("melloway.eventLikes", next);
      setEventLikes(next);
    } catch {
      setStatus("Couldn’t save that change. Device storage may be full.");
    }
  }
  function switchTab(event, index) {
    const keys = {
      ArrowRight: (index + 1) % 3,
      ArrowLeft: (index + 2) % 3,
      Home: 0,
      End: 2,
    };
    if (!(event.key in keys)) return;
    event.preventDefault();
    const next = tabs[keys[event.key]].id;
    setParams({ tab: next }, { preventScrollReset: true });
    document.getElementById(`profile-tab-${next}`)?.focus();
  }
  return (
    <div className="profile-page">
      <header className="profile-toolbar">
        <Link
          className="icon-button"
          to="/community"
          aria-label="Back to community"
        >
          <ArrowLeft size={22} />
        </Link>
        <div>
          <strong>{identity.name}</strong>
          <small>
            {posts.length} {posts.length === 1 ? "post" : "posts"}
          </small>
        </div>
        <Link
          className="icon-button"
          to="/community?compose=1"
          aria-label="Create a post"
        >
          <Plus size={22} />
        </Link>
      </header>
      <div
        className={`profile-cover cover-${identity.cover}`}
        aria-hidden="true"
      >
        <span className="profile-cover-doodle">
          <Doodle kind="matcha" />
        </span>
        <span className="profile-cover-wordmark">melloway</span>
        <span className="profile-cover-doodle">
          <Doodle kind="camera" />
        </span>
        <span className="profile-cover-star">
          <Doodle kind="star" />
        </span>
      </div>
      <section className="profile-details" aria-label="Your profile">
        <div className="profile-avatar-row">
          <Avatar name={identity.name} src={identity.avatar} />
          <button
            className="profile-edit-button"
            onClick={() => {
              setEditSession((n) => n + 1);
              dialog.current.showModal();
            }}
          >
            edit profile
          </button>
        </div>
        <h1>{identity.name}</h1>
        <p className="profile-handle">@{identity.handle}</p>
        {identity.bio && <p className="profile-bio">{identity.bio}</p>}
        {identity.location && (
          <p className="profile-location">
            <MapPin size={15} aria-hidden="true" />
            {identity.location}
          </p>
        )}
      </section>
      <div
        className="profile-tabs"
        role="tablist"
        aria-label="Profile activity"
      >
        {tabs.map(({ id, label, icon: Icon }, index) => (
          <button
            key={id}
            id={`profile-tab-${id}`}
            role="tab"
            type="button"
            aria-label={label}
            title={label}
            aria-selected={tab === id}
            aria-controls={`profile-panel-${id}`}
            tabIndex={tab === id ? 0 : -1}
            onClick={() => setParams({ tab: id }, { preventScrollReset: true })}
            onKeyDown={(e) => switchTab(e, index)}
          >
            <Icon
              aria-hidden="true"
              size={23}
              strokeWidth={tab === id ? 2.2 : 1.7}
            />
          </button>
        ))}
      </div>
      <section
        key={tab}
        className="profile-content"
        id={`profile-panel-${tab}`}
        role="tabpanel"
        aria-labelledby={`profile-tab-${tab}`}
        tabIndex={0}
      >
        {empty && (
          <div className="profile-empty">
            <p>
              {tab === "posts"
                ? "no posts yet"
                : tab === "saved"
                  ? "nothing saved yet"
                  : "no likes yet"}
            </p>
            <Link to={tab === "posts" ? "/community?compose=1" : "/community"}>
              {tab === "posts" ? "make a post" : "explore"}
              <ArrowUpRight size={16} />
            </Link>
          </div>
        )}
        {tab !== "saved" && (
          <div className="community-feed">
            {shownPosts.map((post) => (
              <CommunityPost
                key={post.id}
                post={post}
                liked={likes.includes(post.id)}
                onLike={() => like(post.id)}
                replies={replies[post.id] || []}
                onReply={(text) =>
                  reply(post.id, text, identity.name, identity.handle)
                }
                saved={saved.some((p) => p.id === post.plan?.id)}
                onSave={(plan) =>
                  saved.some((p) => p.id === plan.id)
                    ? remove(plan.id)
                    : save(plan)
                }
                author={identity.name}
                handle={identity.handle}
              />
            ))}
          </div>
        )}
        {tab === "saved" &&
          saved.map((plan) => (
            <article key={plan.id} className="profile-saved-route">
              <button
                className="profile-route-open"
                aria-label={`Open saved route ${plan.prefs.area}`}
                onClick={() => {
                  setCurrent({ plan, candidates: [], matrix: [] });
                  navigate("/itinerary");
                }}
              >
                <span>
                  <strong>{plan.prefs.area}</strong>
                  <small>
                    {plan.stops.length} stops · ~${plan.cost} each
                    {plan.stops[0].source === "demo" ? " · sample" : ""}
                  </small>
                </span>
                <ArrowUpRight size={20} />
                <ol>
                  {plan.stops.map((s) => (
                    <li key={s.id}>{s.name}</li>
                  ))}
                </ol>
              </button>
              <button
                className="icon-button"
                aria-label={`Unsave route ${plan.prefs.area}`}
                onClick={() => remove(plan.id)}
              >
                <Bookmark size={21} fill="currentColor" />
              </button>
            </article>
          ))}
        {tab !== "posts" &&
          shownEvents.map((event) => (
            <article key={event.id} className="profile-event-card">
              <Link
                to={`/events?event=${event.id}`}
                aria-label={`View event ${event.title}`}
              >
                <EventPoster event={event} compact />
                <span>
                  <strong>{event.title}</strong>
                  <small>{event.area} · sample event</small>
                </span>
              </Link>
              <button
                className="icon-button"
                aria-label={`${tab === "saved" ? "Unsave" : "Unlike"} event ${event.title}`}
                onClick={() =>
                  tab === "saved"
                    ? toggleEventSave(event.id)
                    : likeEvent(event.id)
                }
              >
                {tab === "saved" ? (
                  <Bookmark size={21} fill="currentColor" />
                ) : (
                  <Heart size={21} fill="currentColor" />
                )}
              </button>
            </article>
          ))}
      </section>
      <dialog
        className="profile-dialog"
        ref={dialog}
        aria-labelledby="edit-profile-title"
        onClick={(e) => {
          if (e.target === e.currentTarget) dialog.current.close();
        }}
      >
        <ProfileEditor
          key={editSession}
          identity={identity}
          onSave={updateProfile}
          dialog={dialog}
        />
      </dialog>
    </div>
  );
}
