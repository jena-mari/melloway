import QuestionPrompt from "../QuestionPrompt";
import { Reveal } from "../Introduction";
import { Chips, Field } from "../UI";
import { useState } from "react";
import TypedPrompts from "../TypedPrompts";
import { namePrompts } from "../../data/prompts";
export function NameQuestion({ draft: d, update }) {
  const [complete, setComplete] = useState(Boolean(d.name));
  return (
    <>
      <TypedPrompts prompts={namePrompts} complete={complete} />
      <Reveal delay={0.12} onFocusCapture={() => setComplete(true)}>
        <Field
          label="what’s ur name?"
          id="name"
          placeholder="insert name here"
          autoComplete="given-name"
          value={d.name}
          maxLength={60}
          onChange={(e) => update({ name: e.target.value })}
        />
      </Reveal>
    </>
  );
}
export function AboutQuestion({ draft: d, update, question }) {
  return question === 0 ? (
    <QuestionPrompt
      title={`cool name,\n${d.name || "new friend"}.`}
      copy="how old are u?"
    >
      <label className="age-label" htmlFor="age">
        age
      </label>
      <div className="age-entry">
        <input
          id="age"
          type="number"
          inputMode="numeric"
          min="18"
          max="100"
          step="1"
          placeholder="e.g. 24"
          aria-describedby="age-hint"
          value={d.age}
          onChange={(e) =>
            update({ age: e.target.value === "" ? "" : Number(e.target.value) })
          }
        />
        <span aria-hidden="true">years old</span>
      </div>
      <p className="age-hint" id="age-hint">
        tap the number to type ur age.
      </p>
    </QuestionPrompt>
  ) : (
    <QuestionPrompt title="and ur gender?" copy="only if you’d like to share.">
      <fieldset>
        <legend>
          gender <span className="optional">optional</span>
        </legend>
        <Chips
          options={["woman", "man", "non-binary", "prefer not to say"]}
          value={d.gender}
          onChange={(gender) => update({ gender })}
        />
      </fieldset>
    </QuestionPrompt>
  );
}
