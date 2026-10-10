import { Reveal } from "../Introduction";
import { Chips, Field } from "../UI";
import { areas, sydneyToday } from "../../data/preferences";
export default function DetailsQuestion({ draft: d, update }) {
  return (
    <>
      <Reveal as="h1">
        great. who u<br />
        hanging out with?
      </Reveal>
      <Reveal delay={0.06}>
        <fieldset>
          <legend>the company</legend>
          <Chips
            options={["my person", "someone new", "a friend", "my friends"]}
            value={d.companion}
            onChange={(companion) => update({ companion })}
          />
        </fieldset>
        <fieldset>
          <legend>like a date or…?</legend>
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
        <label className="field area-field" htmlFor="area">
          <span>any specific location in mind?</span>
          <select
            id="area"
            value={d.area}
            onChange={(e) => update({ area: e.target.value })}
          >
            {Object.keys(areas).map((area) => (
              <option key={area}>{area}</option>
            ))}
          </select>
        </label>
        <label className="range-label budget-label" htmlFor="budget">
          budget each? <output htmlFor="budget">${d.budget}</output>
        </label>
        <input
          id="budget"
          aria-label="budget each"
          type="range"
          min="0"
          max="200"
          step="5"
          value={d.budget}
          onChange={(e) => update({ budget: Number(e.target.value) })}
        />
        <p className="budget-caption">
          {d.budget < 40
            ? "a little goes a long way."
            : d.budget < 100
              ? "ok pretty good."
              : "a little room to treat yourselves."}
        </p>
        <details className="planning-extra">
          <summary>
            a few more details <span>day, time & getting around</span>
          </summary>
          <div className="extra-fields">
            <Field
              label="their name (optional)"
              id="partner"
              value={d.partner}
              maxLength={60}
              placeholder="your favourite human"
              onChange={(e) => update({ partner: e.target.value })}
            />
            <div className="two-fields">
              <Field
                label="the day"
                id="date"
                type="date"
                min={sydneyToday()}
                value={d.date}
                required
                onChange={(e) => update({ date: e.target.value })}
              />
              <Field
                label="start around"
                id="time"
                type="time"
                value={d.time}
                required
                onChange={(e) => update({ time: e.target.value })}
              />
            </div>
            <fieldset>
              <legend>getting around</legend>
              <Chips
                options={["Walking", "Public transport", "Driving"]}
                value={d.transport}
                onChange={(transport) =>
                  update({ transport: transport || "Walking" })
                }
              />
            </fieldset>
            <label className="field" htmlFor="duration">
              <span>how long have we got?</span>
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
          </div>
        </details>
      </Reveal>
    </>
  );
}
