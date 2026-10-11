import { lazy, Suspense } from "react";
import QuestionPrompt from "../QuestionPrompt";
import { Chips, Field } from "../UI";
const TimePicker = lazy(() => import("../TimePicker"));
const LocationSearch = lazy(() => import("../LocationSearch"));
const DateCalendar = lazy(() => import("../DateCalendar"));

export default function DetailsQuestion({
  draft: d,
  update,
  question,
  onExtras,
}) {
  if (question === 0)
    return (
      <QuestionPrompt title={"great. who u\nhanging out with?"}>
        <fieldset>
          <legend className="sr-only">the company</legend>
          <Chips
            options={["my person", "someone new", "a friend", "my friends"]}
            value={d.companion}
            onChange={(companion) => update({ companion })}
          />
        </fieldset>
      </QuestionPrompt>
    );
  if (question === 1)
    return (
      <QuestionPrompt title="like a date or…?">
        <fieldset>
          <legend className="sr-only">the occasion</legend>
          <Chips
            options={["a date", "just friends", "family"]}
            value={d.mode === "date" ? "a date" : d.occasion || "just friends"}
            onChange={(occasion) =>
              update({
                mode: occasion === "a date" ? "date" : "hangout",
                occasion,
              })
            }
          />
        </fieldset>
      </QuestionPrompt>
    );
  if (question === 2)
    return (
      <QuestionPrompt title="where are we heading?">
        <Suspense
          fallback={
            <p className="location-help" role="status">
              bringing up ur location search…
            </p>
          }
        >
          <LocationSearch draft={d} update={update} />
        </Suspense>
      </QuestionPrompt>
    );
  if (question === 3)
    return (
      <QuestionPrompt title="what’s the budget?">
        <label className="age-label" htmlFor="budget">
          budget each
        </label>
        <div className="budget-entry">
          <span className="budget-currency" aria-hidden="true">
            $
          </span>
          <input
            id="budget"
            type="number"
            inputMode="decimal"
            enterKeyHint="next"
            min="0"
            max="200"
            step="0.01"
            placeholder="e.g. 80"
            aria-describedby="budget-hint"
            value={d.budget}
            onChange={(e) => update({ budget: e.target.value })}
          />
          <span className="budget-unit" aria-hidden="true">
            AUD each
          </span>
        </div>
        <p className="age-hint" id="budget-hint">
          $0–$200 per person
        </p>
        <div
          className="chips budget-presets"
          role="group"
          aria-label="quick budget amounts"
        >
          {[0, 40, 80, 120].map((amount) => (
            <button
              key={amount}
              type="button"
              className={`chip ${d.budget !== "" && Number(d.budget) === amount ? "selected" : ""}`}
              aria-pressed={d.budget !== "" && Number(d.budget) === amount}
              onClick={() => update({ budget: amount })}
            >
              {amount === 0 ? "free" : `$${amount}`}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="planning-extra extra-invitation"
          onClick={onExtras}
        >
          a few more details <span>day, time & getting around</span>
        </button>
      </QuestionPrompt>
    );
  if (question === 4)
    return (
      <QuestionPrompt title="who’s coming along?">
        <Field
          label="their name (optional)"
          id="partner"
          value={d.partner}
          maxLength={60}
          placeholder="name"
          onChange={(e) => update({ partner: e.target.value })}
        />
      </QuestionPrompt>
    );
  if (question === 5)
    return (
      <QuestionPrompt
        title="what day works?"
        copy="optional · defaults to today"
      >
        <Suspense
          fallback={
            <div className="calendar-loading" role="status">
              bringing up the calendar…
            </div>
          }
        >
          <DateCalendar value={d.date} onChange={(date) => update({ date })} />
        </Suspense>
      </QuestionPrompt>
    );
  if (question === 6)
    return (
      <QuestionPrompt
        title="and what time?"
        copy="optional · defaults to 11 am"
      >
        <Suspense
          fallback={
            <div className="calendar-loading" role="status">
              bringing up ur time choices…
            </div>
          }
        >
          <TimePicker
            value={d.time}
            onChange={(time) => update({ time, timeExplicit: !!time })}
          />
        </Suspense>
      </QuestionPrompt>
    );
  if (question === 7)
    return (
      <QuestionPrompt title="how are we getting around?">
        <fieldset>
          <legend className="sr-only">getting around</legend>
          <Chips
            options={["Walking", "Public transport", "Driving"]}
            value={d.transport}
            onChange={(transport) =>
              update({ transport: transport || "Walking" })
            }
          />
        </fieldset>
      </QuestionPrompt>
    );
  return (
    <QuestionPrompt title="how long have we got?">
      <label className="field" htmlFor="duration">
        <span className="sr-only">how long have we got?</span>
        <select
          id="duration"
          value={d.duration}
          onChange={(e) => update({ duration: Number(e.target.value) })}
        >
          {[3, 4, 5, 6, 8].map((n) => (
            <option key={n} value={n}>
              {n} hours
            </option>
          ))}
        </select>
      </label>
    </QuestionPrompt>
  );
}
