import { useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowUpRight,
  Bookmark,
  Camera,
  Ellipsis,
  Heart,
  MapPin,
  MessageSquare,
  Pencil,
  Plus,
} from "lucide-react";
import { useApp } from "../hooks/useApp";
import useCommunity, { readLikes } from "../hooks/useCommunity";
import { CommunityPost } from "./Community";
import { Avatar } from "../components/CommunityIdentity";
import { Doodle } from "../components/DoodleBackdrop";
import BrandLogo from "../components/BrandLogo";
import EventPoster from "../components/EventPoster";
import { communityExamples } from "../data/community";
import { events } from "../data/events";
import { sydneyEvents } from "../data/sydneyEvents.js";
import { savedInstagramEvents } from "../services/instagramEvents.js";
import { writeLocal } from "../services/storage";
import { profileHandle, profileSocialUrl } from "../utils/profile";
import { sydneyToday, validDate } from "../utils/date";

const tabs = [
  { id: "posts", label: "Your Posts", icon: MessageSquare },
  { id: "saved", label: "Your Saved", icon: Bookmark },
  { id: "likes", label: "Your Likes", icon: Heart },
];

function CoverArtwork({ image }) {
  if (image) return <img className="profile-cover-image" src={image} alt="" />;
  return (
    <div className="profile-cover-art" aria-hidden="true">
      <span className="profile-cover-doodle">
        <Doodle kind="matcha" />
      </span>
      <span className="profile-cover-wordmark"><BrandLogo decorative /></span>
      <span className="profile-cover-doodle">
        <Doodle kind="camera" />
      </span>
      <span className="profile-cover-star">
        <Doodle kind="star" />
      </span>
    </div>
  );
}

function ProfileField({ label, id, multiline = false, ...props }) {
  return (
    <label className="profile-editor-row" htmlFor={id}>
      <span>{label}</span>
      {multiline ? (
        <textarea id={id} rows={2} {...props} />
      ) : (
        <input id={id} {...props} />
      )}
    </label>
  );
}

function ProfileEditor({ identity, onSave, dialog }) {
  const [avatar, setAvatar] = useState(identity.avatar);
  const [cover, setCover] = useState(identity.cover);
  const [coverImage, setCoverImage] = useState(identity.coverImage || "");
  const [reading, setReading] = useState({});
  const [photoOptions, setPhotoOptions] = useState(false);
  const [error, setError] = useState("");
  const request = useRef({ avatar: 0, coverImage: 0 });
  function clearPhoto(target) {
    setError("");
    request.current[target]++;
    setReading((current) => ({ ...current, [target]: false }));
    (target === "avatar" ? setAvatar : setCoverImage)("");
  }
  function photo(event, target = "avatar") {
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
    const token = ++request.current[target];
    setError("");
    setReading((current) => ({ ...current, [target]: true }));
    const reader = new FileReader();
    reader.onload = () => {
      if (token !== request.current[target]) return;
      (target === "avatar" ? setAvatar : setCoverImage)(reader.result);
      setReading((current) => ({ ...current, [target]: false }));
    };
    reader.onerror = () => {
      if (token !== request.current[target]) return;
      setReading((current) => ({ ...current, [target]: false }));
      setError("Couldn’t read that photo. Try another one.");
    };
    reader.readAsDataURL(file);
  }
  function submit(event) {
    event.preventDefault();
    if (Object.values(reading).some(Boolean)) return;
    const data = new FormData(event.currentTarget);
    const name = data.get("name").trim();
    if (!name) {
      event.currentTarget.elements.name.focus();
      return;
    }
    const birthdate = data.get("birthdate");
    if (birthdate && (!validDate(birthdate) || birthdate > sydneyToday())) {
      setError("Choose a birthdate on or before today.");
      event.currentTarget.elements.birthdate.focus();
      return;
    }
    const socials = {};
    for (const platform of ["tiktok", "instagram"]) {
      const value = data.get(platform).trim();
      socials[platform] = profileSocialUrl(value, platform);
      if (value && !socials[platform]) {
        setError(
          `Use a ${platform === "tiktok" ? "TikTok" : "Instagram"} link from ${platform}.com.`,
        );
        event.currentTarget.elements[platform].focus();
        return;
      }
    }
    if (
      onSave({
        name,
        handle: data.get("handle"),
        bio: data.get("bio").trim(),
        location: data.get("location").trim(),
        avatar,
        cover,
        coverImage,
        birthdate,
        ...socials,
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
      <h2 id="edit-profile-title" className="profile-editor-title">
        edit profile
      </h2>
      <div className="profile-editor-media">
        <div className={`profile-cover-preview cover-${cover}`}>
          <CoverArtwork image={coverImage} />
          <label className="profile-upload profile-cover-upload">
            <Pencil size={19} aria-hidden="true" />
            <input
              aria-label="Cover photo"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(event) => photo(event, "coverImage")}
            />
          </label>
        </div>
        <div className="profile-photo-edit">
          <label className="profile-upload profile-avatar-upload">
            <Avatar name={identity.name} src={avatar} />
            <span className="profile-camera-overlay">
              <Camera size={29} aria-hidden="true" />
            </span>
            <input
              aria-label="Profile photo"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(event) => photo(event)}
            />
          </label>
          <button
            type="button"
            className="icon-button"
            aria-label="Photo options"
            aria-expanded={photoOptions}
            aria-controls="profile-photo-options"
            onClick={() => setPhotoOptions((open) => !open)}
          >
            <Ellipsis size={22} aria-hidden="true" />
          </button>
        </div>
        {photoOptions && (
          <fieldset className="profile-cover-picker" id="profile-photo-options">
            <legend className="profile-editor-title">Photo options</legend>
            <div className="profile-cover-colours">
              {["white", "matcha", "peach"].map((colour) => (
                <button
                  key={colour}
                  type="button"
                  aria-label={`${colour} cover`}
                  aria-pressed={!coverImage && cover === colour}
                  className={`profile-swatch cover-${colour}`}
                  onClick={() => {
                    clearPhoto("coverImage");
                    setCover(colour);
                  }}
                >
                  <span aria-hidden="true">
                    {!coverImage && cover === colour ? "✓" : ""}
                  </span>
                </button>
              ))}
              {coverImage && (
                <button
                  type="button"
                  className="text-button"
                  onClick={() => clearPhoto("coverImage")}
                >
                  remove cover
                </button>
              )}
              {avatar && (
                <button
                  type="button"
                  className="text-button"
                  onClick={() => clearPhoto("avatar")}
                >
                  remove photo
                </button>
              )}
            </div>
          </fieldset>
        )}
      </div>
      <div className="profile-editor-fields">
        <ProfileField
          label="name"
          id="profile-name"
          name="name"
          defaultValue={identity.name}
          maxLength={40}
          required
          autoComplete="name"
        />
        <ProfileField
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
        <ProfileField
          label="bio"
          id="profile-bio"
          name="bio"
          multiline
          defaultValue={identity.bio}
          maxLength={160}
          placeholder="add a bio"
        />
        <ProfileField
          label="location"
          id="profile-location"
          name="location"
          defaultValue={identity.location}
          maxLength={60}
          placeholder="add a location"
          autoComplete="address-level2"
        />
        <ProfileField
          label="birthdate"
          id="profile-birthdate"
          name="birthdate"
          type="date"
          defaultValue={identity.birthdate || ""}
          max={sydneyToday()}
          autoComplete="bday"
        />
        <ProfileField
          label="TikTok"
          id="profile-tiktok"
          name="tiktok"
          type="url"
          defaultValue={identity.tiktok || ""}
          placeholder="https://www.tiktok.com/@you"
          maxLength={500}
          autoCapitalize="none"
          spellCheck={false}
        />
        <ProfileField
          label="Instagram"
          id="profile-instagram"
          name="instagram"
          type="url"
          defaultValue={identity.instagram || ""}
          placeholder="https://www.instagram.com/you"
          maxLength={500}
          autoCapitalize="none"
          spellCheck={false}
        />
      </div>
      {error && (
        <p className="profile-editor-error" role="alert">
          {error}
        </p>
      )}
      <footer className="profile-editor-actions">
        <button type="button" onClick={() => dialog.current.close()}>
          cancel
        </button>
        <button
          type="submit"
          className="profile-save"
          disabled={Object.values(reading).some(Boolean)}
        >
          save
        </button>
      </footer>
      <p className="profile-local-note">Saved on this device.</p>
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
    openSavedPlan,
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
    coverImage: "",
  };
  const shownPosts =
    tab === "posts"
      ? posts
      : [...posts, ...examples].filter((p) => likes.includes(p.id));
  const shownEvents = [...savedInstagramEvents(), ...sydneyEvents, ...events].filter((e) =>
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
      <div className={`profile-cover cover-${identity.cover}`}>
        <CoverArtwork image={identity.coverImage} />
        <Link
          className="profile-cover-button profile-back-button"
          to="/community"
          aria-label="Back to community"
        >
          <ArrowLeft size={22} />
        </Link>
        <button
          className="profile-cover-button profile-edit-button"
          aria-label="edit profile"
          onClick={() => {
            setEditSession((n) => n + 1);
            dialog.current.showModal();
          }}
        >
          <Pencil size={19} aria-hidden="true" />
        </button>
      </div>
      <section className="profile-details" aria-label="Your profile">
        <div className="profile-avatar-row">
          <Avatar name={identity.name} src={identity.avatar} />
          <Link
            className="profile-create-button"
            to="/community?compose=1"
            aria-label="Create a post"
          >
            <Plus size={23} aria-hidden="true" />
          </Link>
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
        <Link className="text-button profile-history-link" to="/history">past dates ↗</Link>
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
            <Link to={tab === "posts" ? "/community?compose=1" : tab === "saved" ? "/explore" : "/community"}>
              {tab === "posts" ? "make a post" : tab === "saved" ? "explore" : "browse feed"}
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
                aria-label={`Open saved route ${plan.title || plan.prefs.area}`}
                onClick={() => {
                  const destination = openSavedPlan(plan);
                  if (destination) navigate(destination);
                }}
              >
                <span>
                  <strong>{plan.title || plan.prefs.area}</strong>
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
                aria-label={`Unsave route ${plan.title || plan.prefs.area}`}
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
                  <small>{event.area} · {event.source === "instagram" ? "Instagram" : event.source === "organiser" ? event.when : "sample event"}</small>
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
