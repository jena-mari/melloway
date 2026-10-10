import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Heart } from "lucide-react";
import { useApp } from "../hooks/useApp";
import { generate } from "../services/discovery";

export default function Generating() {
  const { draft, setCurrent } = useApp(),
    navigate = useNavigate();
  const [stage, setStage] = useState("getting ur preferences together…"),
    [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    generate(draft, 0, setStage, null, { signal: controller.signal })
      .then((bundle) => {
        if (controller.signal.aborted) return;
        if (!bundle.plan) {
          setError(
            "No three-stop plan fits those hours, area and budget. Try an earlier start, longer duration, or wider area.",
          );
          return;
        }
        setCurrent(bundle);
        navigate("/itinerary", { replace: true });
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setError(
            error.message === "Please check your planning details."
              ? error.message
              : "Something interrupted planning. Your preferences are saved; give it another go.",
          );
      });
    return () => controller.abort();
  }, [draft, navigate, setCurrent]);
  return (
    <div className="loading-page page">
      <div className="loading-heart">
        <Heart size={70} strokeWidth={1} />
      </div>
      <span className="eyebrow">A LITTLE THOUGHT GOES A LONG WAY</span>
      <h1>
        connecting
        <br />
        <em>the cute dots.</em>
      </h1>
      <p role="status">{error || stage}</p>
      <p className="fine">
        Using prototype demo data unless a live provider is configured.
        <br />
        We never check live events or reservations during planning.
      </p>
      {error && (
        <Link className="button pink" to="/plan/details">
          tweak the details
        </Link>
      )}
    </div>
  );
}
