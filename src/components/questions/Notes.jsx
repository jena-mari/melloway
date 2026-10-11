import { Reveal } from "../Introduction";
import { interestsFromNotes } from "../../utils/interests";
export default function NotesQuestion({ draft: d, update }) {
  const { included } = interestsFromNotes(d.notes);
  return (
    <>
      <Reveal as="h1">let’s lock it in.</Reveal>
      <Reveal as="p" className="question-copy" delay={0.06}>
        what else do you want us to know?
      </Reveal>
      <Reveal delay={0.12}>
        <label className="field" htmlFor="notes">
          <span className="sr-only">anything else for ur plan?</span>
          <textarea
            id="notes"
            rows={5}
            maxLength={1200}
            value={d.notes || ""}
            placeholder="preferences, requests, anything else…"
            onChange={(e) => update({ notes: e.target.value })}
          />
        </label>
        <div className="notes-meta">
          <span>{(d.notes || "").length} / 1200</span>
        </div>
        <p
          className="notes-clues"
          style={{ visibility: included.length ? "visible" : "hidden" }}
          aria-live="polite"
        >
          {included
            .slice(0, 3)
            .map((tag) => tag.toLowerCase())
            .join(" + ")}
          {included.length > 3 ? " + more" : ""}
        </p>
      </Reveal>
    </>
  );
}
