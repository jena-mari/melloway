import { useState, useEffect, lazy, Suspense } from "react";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
  useLocation,
} from "react-router-dom";
import { ArrowLeft, ArrowRight, CircleArrowRight, Heart } from "lucide-react";
import { useApp } from "../hooks/useApp";
import { communityExamples } from "../data/community";
import { readPosts, withProfile } from "../hooks/useCommunity";
import { createId } from "../utils/id";
import { normalisePlanNames, normaliseRouteNames } from "../utils/venueNames";
import { MoodImage } from "../components/UI";
import { Avatar, timeAgo } from "../components/CommunityIdentity";
import StopDetails from "../components/StopDetails";
import Venue from "./Venue";
const RouteMap = lazy(() => import("../components/RouteMap"));
export default function CommunityRoute() {
  const { postId } = useParams();
  return <CommunityRouteView key={postId} />;
}
function CommunityRouteView() {
  const { postId, id } = useParams();
  const [params] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { setCurrent, draft, profile, setStatus, saved, save, remove } =
    useApp();
  const [posts] = useState(() => [...readPosts(), ...communityExamples()]);
  const storedPost = posts.find((p) => p.id === postId);
  const post = storedPost ? withProfile(storedPost, profile) : null;
  const [route] = useState(
    () =>
      normaliseRouteNames(location.state?.route) ||
      (post?.plan ? { plan: post.plan, candidates: [], matrix: [] } : null),
  );
  const [detailId, setDetailId] = useState(params.get("stop") || "");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setDetailId(params.get("stop") || "");
  }, [params]);
  if (!post || !route?.plan?.stops?.length)
    return (
      <div className="page community-empty">
        <h1>that route has wandered off.</h1>
        <Link className="button" to="/community">
          back to community feed
        </Link>
      </div>
    );
  const backTo = `/community/${encodeURIComponent(postId)}`;
  if (id) return <Venue route={route} backTo={backTo} />;
  const { plan } = route;
  const isSaved = saved.some((p) => p.id === plan.id);
  const detailIndex = plan.stops.findIndex((stop) => stop.id === detailId);
  async function bookmark() {
    setSaving(true);
    try {
      if (isSaved) await remove(plan.id);
      else await save(plan);
    } finally {
      setSaving(false);
    }
  }
  function copyRoute() {
    setCurrent({
      ...route,
      plan: {
        ...plan,
        id: createId(),
        prefs: { ...plan.prefs, name: draft.name, partner: draft.partner },
        createdAt: new Date().toISOString(),
      },
    });
    setStatus("Route copied.");
    navigate("/itinerary");
  }
  return (
    <div className="page community-expanded-page">
      <Link
        className="back community-route-back"
        to="/community"
        aria-label="back to community feed"
      >
        <ArrowLeft size={18} /> feed
      </Link>
      <article
        className="community-post community-expanded-post"
        aria-labelledby="expanded-post-title"
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
            <h2>{post.name}</h2>
          </div>
          <button
            className="community-expanded-save"
            disabled={saving}
            aria-label={`${isSaved ? "Unsave" : "Save"} route ${post.name}`}
            aria-pressed={isSaved}
            onClick={bookmark}
          >
            <Heart size={25} fill={isSaved ? "currentColor" : "none"} />
          </button>
        </header>
        <div className="community-post-copy">
          <p>{post.description}</p>
        </div>
        <div
          className="community-photo-strip"
          aria-label={`Stops for ${post.name}`}
        >
          {plan.stops.map((stop) => (
            <button
              key={stop.id}
              className="community-stop-photo"
              onClick={() => setDetailId(stop.id)}
              aria-label={`view ${stop.name} details`}
            >
              {stop.image && (
                <MoodImage
                  src={stop.image}
                  alt={
                    stop.source === "demo" ? "Illustrative mood photograph" : ""
                  }
                />
              )}
              <span className="community-photo-fallback" aria-hidden="true">
                ✳
              </span>
              <strong>{stop.name}</strong>
            </button>
          ))}
        </div>
        {post.photo && (
          <div className="community-memory-photo">
            <MoodImage src={post.photo} alt="Shared memory" />
          </div>
        )}
        <h1 id="expanded-post-title" className="community-route-title">
          {post.name} <span>by {post.author || "you"}</span>
        </h1>
        <ol className="community-place-list" aria-label="Route stops">
          {plan.stops.map((stop, index) => (
            <li key={stop.id}>
              <button
                onClick={() => setDetailId(stop.id)}
                aria-label={`open ${stop.name} details`}
              >
                <span className="route-letter" aria-hidden="true">
                  {String.fromCharCode(65 + index)}
                </span>
                <span className="community-place-info">
                  <strong>{stop.name}</strong>
                  <small>{stop.address}</small>
                </span>
                <CircleArrowRight
                  size={21}
                  strokeWidth={1.5}
                  aria-hidden="true"
                />
              </button>
            </li>
          ))}
        </ol>
        <div className="community-expanded-map">
          <Suspense
            fallback={
              <div className="map-loading" role="status">
                loading map…
              </div>
            }
          >
            <RouteMap
              stops={plan.stops}
              transport={plan.prefs.transport}
              selectedStopId={detailId || plan.stops[0].id}
              onSelectStop={setDetailId}
            />
          </Suspense>
        </div>
        <Link className="itinerary-explore-link" to="/explore">explore more spots <ArrowRight size={16} /></Link>
        <button className="button community-copy-route" onClick={copyRoute}>
          make this my day <ArrowRight size={16} />
        </button>
        <details className="community-notice community-expanded-notice">
          <summary>{post.sample ? "sample route" : "route details"}</summary>
          <p>
            {plan.notice} Posts stay on this device. Times and costs are
            estimates.
          </p>
        </details>
      </article>
      {detailIndex >= 0 && (
        <StopDetails
          stop={plan.stops[detailIndex]}
          index={detailIndex}
          prefs={plan.prefs}
          onClose={() => setDetailId("")}
          venueLink={`${backTo}/venue/${encodeURIComponent(plan.stops[detailIndex].id)}`}
          venueState={{ route }}
        />
      )}
    </div>
  );
}
