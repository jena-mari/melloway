import { categories, diningVibes } from "../../data/preferences";
import QuestionPrompt from "../QuestionPrompt";
import { Chips } from "../UI";

export default function FoodQuestion({ draft, update, question }) {
  const vibe = question === 1;
  return (
    <QuestionPrompt
      title={vibe ? "what’s the dining vibe?" : "what food are u feeling?"}
    >
      <fieldset>
        <legend>
          pick a few <span className="optional">optional</span>
        </legend>
        <Chips
          options={vibe ? Object.keys(diningVibes) : categories["typa food"]}
          value={vibe ? draft.diningVibes || [] : draft.preferences}
          multiple
          onChange={(value) =>
            update(vibe ? { diningVibes: value } : { preferences: value })
          }
        />
      </fieldset>
    </QuestionPrompt>
  );
}
