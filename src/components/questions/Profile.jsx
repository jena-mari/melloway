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
export function AboutQuestion({ draft: d, update }) {
  return (
    <>
      <Reveal as="h1">
        cool name,
        <br />
        {d.name || "new friend"}.
      </Reveal>
      <Reveal as="p" className="question-copy" delay={0.06}>
        we’ll learn more about ur interests later, but right now, let me ask ur
        age and gender.
      </Reveal>
      <Reveal delay={0.12}>
        <label className="range-label" htmlFor="age">
          age <output htmlFor="age">{d.age}</output>
        </label>
        <input
          id="age"
          aria-label="age"
          type="range"
          min="18"
          max="100"
          value={d.age}
          onChange={(e) => update({ age: Number(e.target.value) })}
        />
        <fieldset>
          <legend>
            gender <span className="optional">if you’d like</span>
          </legend>
          <Chips
            options={["woman", "man", "non-binary", "prefer not to say"]}
            value={d.gender}
            onChange={(gender) => update({ gender })}
          />
        </fieldset>
      </Reveal>
    </>
  );
}
