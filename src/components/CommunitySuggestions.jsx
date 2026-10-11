import { Link } from "react-router-dom";
import { Layers, ArrowUpRight } from "lucide-react";
import { MoodImage } from "./UI";
export default function CommunitySuggestions({ posts, currentId }) {
  const suggestions = posts.filter(
    (post) => post.id !== currentId && post.plan?.stops?.length,
  );
  return (
    <section
      className="community-suggestions"
      aria-labelledby="community-suggestions-title"
    >
      <header>
        <h2 id="community-suggestions-title">more suggestions</h2>
        <Link to="/community">
          explore <ArrowUpRight size={15} />
        </Link>
      </header>
      <div className="community-explore-grid">
        {suggestions.map((post) => (
          <Link
            key={post.id}
            to={`/community/${encodeURIComponent(post.id)}`}
            className="community-explore-tile"
            aria-label={`view route ${post.name} by ${post.author}`}
          >
            <div
              className={`explore-tile-images ${post.photo ? "single" : "collage"}`}
            >
              {post.photo ? (
                <MoodImage src={post.photo} alt="" />
              ) : (
                post.plan.stops
                  .slice(0, 3)
                  .map((stop) => (
                    <div key={stop.id}>
                      {stop.image && <MoodImage src={stop.image} alt="" />}
                    </div>
                  ))
              )}
            </div>
            <span className="explore-tile-count">
              <Layers size={13} /> {post.plan.stops.length}
            </span>
            <div className="explore-tile-caption">
              <strong>{post.name}</strong>
              <span>@{post.handle || "you"}</span>
            </div>
          </Link>
        ))}
      </div>
      {!suggestions.length && (
        <Link className="text-button" to="/community">
          browse community routes
        </Link>
      )}
    </section>
  );
}
