import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Reveal } from "../components/Introduction";
import { Button } from "../components/UI";
import { useApp } from "../hooks/useApp";
import { generate } from "../services/discovery";
import { preferencesForPlan } from "../utils/interests";
import { withScheduleDefaults } from "../utils/date";
import { ideas } from "../data/ideas";

export default function Generating() {
  const { draft, setCurrent } = useApp(),
    navigate = useNavigate();
  const { pathname } = useLocation();
  const reduced = useReducedMotion();
  const [stage, setStage] = useState("getting ur preferences together…"),
    [error, setError] = useState(""),
    [canRetry, setCanRetry] = useState(false),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (pathname !== "/generating") return;
    const controller = new AbortController();
    setError("");
    setCanRetry(false);
    setStage("getting ur preferences together…");
    generate(
      {
        ...withScheduleDefaults(draft),
        selectedPreferences: [
          ...new Set([
            ...draft.preferences,
            ...(draft.ideaExplicit
              ? ideas.find((i) => i.id === draft.idea)?.tags || []
              : []),
          ]),
        ],
        preferences: preferencesForPlan(draft),
      },
      0,
      setStage,
      null,
      { signal: controller.signal },
    )
      .then((bundle) => {
        if (controller.signal.aborted) return;
        if (!bundle.plan) {
          setError(
            bundle.failure?.message ||
              "No suitable route fits your interests, hours, area and budget. Try changing the details.",
          );
          return;
        }
        setCurrent(bundle);
        navigate("/itinerary", { replace: true });
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          setCanRetry(error.message !== "Please check your planning details.");
          setError(
            error.message === "Please check your planning details."
              ? error.message
              : "Something interrupted planning. Your preferences are saved; give it another go.",
          );
        }
      });
    return () => controller.abort();
  }, [draft, navigate, setCurrent, attempt, pathname]);
  return (
    <div className="intro-screen loading-intro">
      <p className="intro-kicker">good plans start here.</p>
      <div className="loading-centre">
        <Reveal as="h1">{error ? "a little hiccup." : "loading..."}</Reveal>
        <div className="loading-stage" role="status" aria-live="polite">
          <AnimatePresence mode="wait" initial={false}>
            <motion.p
              key={error || stage}
              initial={reduced ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={reduced ? { opacity: 1 } : { opacity: 0 }}
              transition={{ duration: reduced ? 0 : 0.12 }}
            >
              {error || stage}
            </motion.p>
          </AnimatePresence>
        </div>
        {!error && (
          <div className="loading-dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </div>
        )}
      </div>
      {error && (
        <div className="generation-recovery">
          {canRetry && (
            <Button
              className="pink"
              onClick={() => setAttempt((old) => old + 1)}
            >
              try again
            </Button>
          )}
          <Link className="button" to="/plan/details">
            tweak the details
          </Link>
        </div>
      )}
    </div>
  );
}
