import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ideas } from "../../data/ideas";
import { categories } from "../../data/preferences";
import { Reveal, gentleEase } from "../Introduction";
import { Chips } from "../UI";
import DateIllustration from "../DateIllustration";
export default function IdeasQuestion({ draft: d, update }) {
  const reduced = useReducedMotion();
  const index = Math.max(
    0,
    ideas.findIndex((idea) => idea.id === d.idea),
  );
  const idea = ideas[index];
  function move(direction) {
    update({
      idea: ideas[(index + direction + ideas.length) % ideas.length].id,
    });
  }
  return (
    <>
      <Reveal as="h1">
        so, it’s {d.mode === "date" ? "a date" : "a hangout"}.<br />
        let’s make it perfect.
      </Reveal>
      <Reveal as="p" className="question-copy" delay={0.06}>
        we have a few suggestions for you. what’s the closest to the vibe ur
        going with?
      </Reveal>
      <Reveal delay={0.12}>
        <section
          className="idea-carousel"
          aria-label="Suggested date ideas"
          aria-roledescription="carousel"
        >
          <button
            className="idea-arrow"
            type="button"
            aria-label="Previous idea"
            onClick={() => move(-1)}
          >
            <ChevronLeft size={17} />
          </button>
          <div className="idea-window">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={idea.id}
                initial={reduced ? false : { opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={reduced ? { opacity: 1 } : { opacity: 0, x: -10 }}
                transition={{ duration: reduced ? 0 : 0.18, ease: gentleEase }}
                drag={reduced ? false : "x"}
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={0.12}
                onDragEnd={(_, info) => {
                  if (info.offset.x < -35) move(1);
                  else if (info.offset.x > 35) move(-1);
                }}
                style={{ touchAction: "pan-y" }}
              >
                <DateIllustration kind={idea.drawing} />
              </motion.div>
            </AnimatePresence>
          </div>
          <button
            className="idea-arrow"
            type="button"
            aria-label="Next idea"
            onClick={() => move(1)}
          >
            <ChevronRight size={17} />
          </button>
        </section>
        <p className="idea-caption" aria-live="polite">
          {idea.title}
        </p>
        <div className="idea-dots" aria-label="Choose an idea">
          {ideas.map((item, i) => (
            <button
              type="button"
              key={item.id}
              aria-label={item.title}
              aria-pressed={i === index}
              onClick={() => update({ idea: item.id })}
            >
              <span className={i === index ? "active" : ""} />
            </button>
          ))}
        </div>
        <details className="planning-extra vibe-extra">
          <summary>
            make it more ur vibe <span>food, places & little adventures</span>
          </summary>
          {Object.entries(categories).map(([title, options]) => (
            <fieldset key={title}>
              <legend>
                {title} <span className="optional">pick a few</span>
              </legend>
              <Chips
                options={options}
                value={d.preferences}
                multiple
                onChange={(preferences) => update({ preferences })}
              />
            </fieldset>
          ))}
        </details>
      </Reveal>
    </>
  );
}
