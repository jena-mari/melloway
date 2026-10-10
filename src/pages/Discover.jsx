import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Heart, ArrowUpRight, Star, ImagePlus } from "lucide-react";
import { useApp } from "../hooks/useApp";
import { MoodImage, Field, Button } from "../components/UI";
import { readLocal, writeLocal } from "../services/storage";
const examples = [
  {
    id: "example1",
    name: "a slow saturday in newtown",
    author: "the melloway moodboard",
    area: "Newtown",
    description:
      "matcha, second-hand treasures, and a stroll with no particular rush.",
    image:
      "https://images.unsplash.com/photo-1507842217343-583bb7270b66?auto=format&fit=crop&w=800&q=80",
    rating: 5,
  },
  {
    id: "example2",
    name: "harbour views & happy hearts",
    author: "the melloway moodboard",
    area: "Sydney CBD",
    description: "a little art, a picnic, and the postcard kind of view.",
    image:
      "https://images.unsplash.com/photo-1506973035872-a4ec16b8e8d9?auto=format&fit=crop&w=800&q=80",
    rating: 5,
  },
  {
    id: "example3",
    name: "just one more coffee",
    author: "the melloway moodboard",
    area: "Surry Hills",
    description: "bookshops and brunch. some days, simple is everything.",
    image:
      "https://images.unsplash.com/photo-1442512595331-e89e73853f31?auto=format&fit=crop&w=800&q=80",
    rating: 4,
  },
];
export function Community() {
  const { saved, setStatus, setCurrent } = useApp(),
    navigate = useNavigate(),
    [posts, setPosts] = useState(() => readLocal("melloway.posts", [])),
    [show, setShow] = useState(false),
    [photo, setPhoto] = useState(""),
    [likes, setLikes] = useState(() => readLocal("melloway.likes", []));
  function like(id) {
    const next = likes.includes(id)
      ? likes.filter((x) => x !== id)
      : [...likes, id];
    try {
      writeLocal("melloway.likes", next);
      setLikes(next);
    } catch {
      setStatus("Unable to store this like.");
    }
  }
  async function file(e) {
    const f = e.target.files[0];
    if (!f) return;
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(f.type) ||
      f.size > 1500000
    ) {
      setStatus("Choose a JPEG, PNG or WebP photo under 1.5 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setPhoto(reader.result);
    reader.readAsDataURL(f);
  }
  function share(e) {
    e.preventDefault();
    const data = new FormData(e.target),
      p = saved.find((p) => p.id === data.get("plan"));
    const post = {
      id: crypto.randomUUID(),
      name: data.get("title"),
      description: data.get("description"),
      rating: Number(data.get("rating")),
      author: "you · device-only post",
      area: p?.prefs.area || "Sydney",
      image: photo || p?.stops[0].image,
      plan: p,
    };
    try {
      const next = [post, ...posts];
      writeLocal("melloway.posts", next);
      setPosts(next);
      setShow(false);
      setPhoto("");
      setStatus(
        "Added to your device’s demo feed. This is not publicly published.",
      );
    } catch {
      setStatus(
        "Photo or post is too large for browser storage. Try a smaller photo.",
      );
    }
  }
  return (
    <div className="page collection">
      <div className="page-heading">
        <div>
          <span className="eyebrow">GOOD IDEAS ARE BETTER SHARED</span>
          <h1>
            a little
            <br />
            <em>inspiration club.</em>
          </h1>
          <p className="sub">
            date ideas from our demo moodboard, and your own memories.
          </p>
        </div>
        <Button className="pink" onClick={() => setShow(!show)}>
          add a memory <ImagePlus size={18} />
        </Button>
      </div>
      <div className="data-notice">
        <strong>DEMO COMMUNITY</strong> Example posts and ratings are fictional.
        Your posts, photos and likes stay on this device.
      </div>
      {show && (
        <form onSubmit={share} className="share-form">
          <h2>how was ur day?</h2>
          <Field
            label="give it a little title"
            id="title"
            name="title"
            required
            maxLength={80}
          />
          <label className="field">
            <span>which saved plan?</span>
            <select name="plan">
              <option value="">a memory without a plan</option>
              {saved.map((p) => (
                <option value={p.id} key={p.id}>
                  {p.prefs.area} · {p.prefs.date}
                </option>
              ))}
            </select>
          </label>
          <Field
            label="the little details"
            id="description"
            name="description"
            required
            maxLength={300}
          />
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
          <Button className="pink">
            save to device feed <ArrowUpRight size={18} />
          </Button>
        </form>
      )}
      <div className="collection-grid">
        {[...posts, ...examples].map((p) => (
          <article className="collection-card" key={p.id}>
            <div className="collection-photo">
              <MoodImage src={p.image} />
              <span className="pill-label">{p.area}</span>
            </div>
            <div className="collection-body">
              <span className="eyebrow">{p.author}</span>
              <h2>{p.name}</h2>
              <p>{p.description}</p>
              {p.plan && (
                <button
                  className="text-button"
                  onClick={() => {
                    setCurrent({ plan: p.plan, candidates: [], matrix: [] });
                    navigate("/itinerary");
                  }}
                >
                  see this plan <ArrowUpRight size={17} />
                </button>
              )}
              <div className="card-actions">
                <span className="rating">
                  <Star size={15} fill="currentColor" /> {p.rating} / 5{" "}
                  {p.id.startsWith("example") ? "· sample" : ""}
                </span>
                <button
                  aria-label={`Like ${p.name}`}
                  aria-pressed={likes.includes(p.id)}
                  className="icon-button"
                  onClick={() => like(p.id)}
                >
                  <Heart
                    size={20}
                    fill={likes.includes(p.id) ? "#F8A8B9" : "none"}
                  />
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
export function Events() {
  const [filter, setFilter] = useState("all");
  const events = [
    {
      title: "a weekend market wander",
      type: "markets",
      text: "vintage finds, fresh pastries, zero rush.",
      image: examples[0].image,
    },
    {
      title: "an afternoon of art",
      type: "exhibitions",
      text: "a new perspective, a long conversation.",
      image:
        "https://images.unsplash.com/photo-1577083552431-6e5fd01aa342?auto=format&fit=crop&w=800&q=80",
    },
    {
      title: "a little live music",
      type: "concerts",
      text: "find a new favourite song, together.",
      image:
        "https://images.unsplash.com/photo-1516280440614-37939bbacd81?auto=format&fit=crop&w=800&q=80",
    },
    {
      title: "a festival kind of day",
      type: "festivals",
      text: "something colourful. something shared.",
      image: examples[1].image,
    },
    {
      title: "meet the neighbourhood",
      type: "community",
      text: "small local moments worth making time for.",
      image: examples[2].image,
    },
  ];
  return (
    <div className="page collection">
      <span className="eyebrow">A REASON TO GET OUT THERE</span>
      <h1>
        what’s on?
        <br />
        <em>possibilities.</em>
      </h1>
      <p className="sub">
        a moodboard for the weekend, until a live events provider is connected.
      </p>
      <div className="data-notice">
        <strong>DEMO EVENTS</strong> These are illustrative ideas, not scheduled
        events. No dates, tickets or availability are claimed.
      </div>
      <div className="chips event-filters">
        {[
          "all",
          "markets",
          "festivals",
          "exhibitions",
          "concerts",
          "community",
        ].map((t) => (
          <button
            className={`chip ${filter === t ? "selected" : ""}`}
            aria-pressed={filter === t}
            key={t}
            onClick={() => setFilter(t)}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="collection-grid">
        {events
          .filter((e) => filter === "all" || e.type === filter)
          .map((e) => (
            <article className="collection-card" key={e.title}>
              <div className="collection-photo">
                <MoodImage src={e.image} />
                <span className="pill-label">{e.type}</span>
              </div>
              <div className="collection-body">
                <h2>{e.title}</h2>
                <p>{e.text}</p>
                <Link className="text-button" to="/plan/vibes">
                  plan around ur vibe <ArrowUpRight size={17} />
                </Link>
              </div>
            </article>
          ))}
      </div>
    </div>
  );
}
