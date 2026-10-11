import { useEffect, useRef, useState } from "react";
import {
  useNavigate,
  useParams,
  useSearchParams,
  Link,
} from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { gentleEase } from "../components/Introduction";
import { ArrowLeft } from "lucide-react";
import { useApp } from "../hooks/useApp";
import { sydneyToday } from "../data/preferences";
import { NameQuestion, AboutQuestion } from "../components/questions/Profile";
import DetailsQuestion from "../components/questions/Details";
import IdeasQuestion from "../components/questions/Ideas";
import NotesQuestion from "../components/questions/Notes";
import { ideas } from "../data/ideas";
import { Button } from "../components/UI";
const steps = ["profile", "about", "details", "vibes", "notes"];
export default function Onboarding() {
  const { step } = useParams(),
    { draft, update } = useApp(),
    navigate = useNavigate();
  const [error, setError] = useState("");
  const [search, setSearch] = useSearchParams();
  const turn = useRef(null);
  const reduced = useReducedMotion();
  const lastQuestion =
    step === "about" ? 1 : step === "details" ? 8 : step === "vibes" ? 3 : 0;
  const question = Math.min(
    lastQuestion,
    Math.max(0, Math.floor(Number(search.get("q"))) || 0),
  );
  const nextQuestion = (q) => {
    setError("");
    setSearch(q ? { q: String(q) } : {});
  };
  const index = steps.indexOf(step);
  useEffect(() => {
    // Focus after the browser restores the previous history entry's control.
    const frame = requestAnimationFrame(() =>
      turn.current?.focus({ preventScroll: true }),
    );
    setError("");
    return () => cancelAnimationFrame(frame);
  }, [step, question]);
  if (index < 0)
    return (
      <div className="page">
        <h1>let’s start at the beginning.</h1>
        <Link to="/plan/profile">say hello</Link>
      </div>
    );
  function advance(skipped = false) {
    setError("");
    if (step === "details")
      update({ budget: budgetIsValid() ? Number(draft.budget) : 80 });
    if (index === 3)
      update({
        idea: skipped ? "" : draft.idea || ideas[0].id,
        ideaExplicit: skipped ? false : !!draft.ideaExplicit,
      });
    navigate(
      index === steps.length - 1 ? "/generating" : `/plan/${steps[index + 1]}`,
    );
  }
  function budgetIsValid() {
    const amount = Number(draft.budget);
    return (
      draft.budget !== "" &&
      Number.isFinite(amount) &&
      amount >= 0 &&
      amount <= 200
    );
  }
  function validateBudget() {
    if (budgetIsValid()) return true;
    setError("Enter an amount from $0 to $200 AUD per person.");
    return false;
  }
  function skip() {
    if (step === "details" && question === 2) {
      update({ area: "Anywhere in Sydney", location: null, locationQuery: "" });
      advance(true);
      return;
    }
    if (step === "details" && (question === 5 || question === 6)) {
      update({
        [question === 5 ? "date" : "time"]: "",
        ...(question === 6 ? { timeExplicit: false } : {}),
      });
      nextQuestion(question + 1);
    } else advance(true);
  }
  function submit(e) {
    e.preventDefault();
    if (step === "details" && question === 3 && !validateBudget()) return;
    if (
      step === "details" &&
      question === 2 &&
      draft.locationQuery?.trim() &&
      draft.locationQuery !== draft.area
    ) {
      setError("Choose a suggestion, or leave it open to anywhere in Sydney.");
      return;
    }
    if (
      step === "about" &&
      question === 0 &&
      draft.age !== "" &&
      (!Number.isInteger(Number(draft.age)) ||
        Number(draft.age) < 18 ||
        Number(draft.age) > 100)
    ) {
      setError("Enter a whole age between 18 and 100.");
      return;
    }
    if (
      step === "details" &&
      question === 5 &&
      draft.date &&
      draft.date < sydneyToday()
    ) {
      setError("Pick today or a future date.");
      return;
    }
    if (
      (step === "about" && question < 1) ||
      (step === "details" && question < 3) ||
      (step === "details" && question >= 4 && question < 8) ||
      (step === "vibes" && question > 0 && question < 3)
    ) {
      nextQuestion(question + 1);
    } else advance();
  }
  return (
    <div
      className={`intro-screen question-screen question-${step} ${step === "details" && question === 5 ? "question-calendar" : ""}`}
    >
      <div className="question-top">
        <Link
          to={
            question
              ? `/plan/${step}${question > 1 ? `?q=${question - 1}` : ""}`
              : index
                ? `/plan/${steps[index - 1]}`
                : "/"
          }
          className="back"
          aria-label="back"
        >
          <ArrowLeft size={16} />
        </Link>
        <div
          className="question-progress"
          role="progressbar"
          aria-label="Planning progress"
          aria-valuemin={1}
          aria-valuemax={steps.length}
          aria-valuenow={index + 1}
        >
          {steps.map((s, i) => (
            <span key={s} className={i <= index ? "active" : ""} />
          ))}
        </div>
        <button type="button" className="question-skip" onClick={skip}>
          lemme skip this +
        </button>
      </div>
      <form
        className="question-form"
        id={`plan-${step}`}
        onSubmit={submit}
        noValidate
      >
        <motion.div
          key={`${step}-${question}`}
          ref={turn}
          tabIndex={-1}
          className="question-turn"
          initial={reduced ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduced ? 0 : 0.22, ease: gentleEase }}
        >
          {index === 0 && <NameQuestion draft={draft} update={update} />}
          {index === 1 && (
            <AboutQuestion draft={draft} update={update} question={question} />
          )}
          {index === 2 && (
            <DetailsQuestion
              draft={draft}
              update={update}
              question={question}
              onExtras={() => {
                if (!validateBudget()) return;
                update({ budget: Number(draft.budget) });
                nextQuestion(4);
              }}
            />
          )}
          {index === 3 && (
            <IdeasQuestion
              draft={draft}
              update={update}
              question={question}
              onExtras={() => nextQuestion(1)}
            />
          )}
          {index === 4 && <NotesQuestion draft={draft} update={update} />}
        </motion.div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="question-actions">
          {(step === "about" ||
            step === "details" ||
            (step === "vibes" && question > 0)) && (
            <p className="question-beat" aria-live="polite">
              {step === "about"
                ? `${question + 1} of 2`
                : step === "details"
                  ? question < 4
                    ? `${question + 1} of 4`
                    : `${question - 3} of 5`
                  : `${question} of 3`}
            </p>
          )}
          <Button type="submit" className="pink">
            {index === 4 ? "submit" : "continue"}
          </Button>
        </div>
      </form>
    </div>
  );
}
