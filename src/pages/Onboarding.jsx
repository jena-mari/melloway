import { useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
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
  const index = steps.indexOf(step);
  if (index < 0)
    return (
      <div className="page">
        <h1>let’s start at the beginning.</h1>
        <Link to="/plan/profile">say hello</Link>
      </div>
    );
  function advance(skipped = false) {
    setError("");
    if (
      index >= 2 &&
      (draft.date < sydneyToday() || !draft.time || !draft.date)
    ) {
      setError("Pick today or a future date, and a starting time.");
      return;
    }
    if (index === 3) update({ idea: skipped ? "" : draft.idea || ideas[0].id });
    navigate(
      index === steps.length - 1 ? "/generating" : `/plan/${steps[index + 1]}`,
    );
  }
  function submit(e) {
    e.preventDefault();
    advance();
  }
  return (
    <div className={`intro-screen question-screen question-${step}`}>
      <div className="question-top">
        <Link
          to={index ? `/plan/${steps[index - 1]}` : "/"}
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
        <button
          type="button"
          className="question-skip"
          onClick={() => advance(true)}
        >
          lemme skip this +
        </button>
      </div>
      <form
        className="question-form"
        id={`plan-${step}`}
        onSubmit={submit}
        noValidate
      >
        {index === 0 && <NameQuestion draft={draft} update={update} />}
        {index === 1 && <AboutQuestion draft={draft} update={update} />}
        {index === 2 && <DetailsQuestion draft={draft} update={update} />}
        {index === 3 && <IdeasQuestion draft={draft} update={update} />}
        {index === 4 && <NotesQuestion draft={draft} update={update} />}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="question-actions">
          <Button type="submit" className="pink">
            {index === 4 ? "submit" : "continue"}
          </Button>
        </div>
      </form>
    </div>
  );
}
