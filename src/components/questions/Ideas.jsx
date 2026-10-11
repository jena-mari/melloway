import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ideas } from "../../data/ideas";
import { categories } from "../../data/preferences";
import QuestionPrompt from "../QuestionPrompt";
import { Reveal, gentleEase } from "../Introduction";
import { Chips } from "../UI";
import DateIllustration from "../DateIllustration";
export default function IdeasQuestion({
  draft: d,
  update,
  question,
  onExtras,
}) {
  const reduced = useReducedMotion();
  const index = Math.max(
    0,
    ideas.findIndex((idea) => idea.id === d.idea),
  );
  const idea = ideas[index];
  function move(direction) {
    update({
      idea: ideas[(index + direction + ideas.length) % ideas.length].id,
      ideaExplicit: true,
    });
  }
  if (question > 0) {
    const [title, options] = Object.entries(categories)[question - 1];
    const titles = [
      "what’s ur kinda hangout?",
      "anything ur craving?",
      "a little adventure?",
    ];
    return (
      <QuestionPrompt title={titles[question - 1]}>
        <fieldset>
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
      </QuestionPrompt>
    );
  }
  return (
    <>
      <Reveal as="h1">
        so, it’s {d.mode === "date" ? "a date" : "a hangout"}.<br />
        let’s make it perfect.
      </Reveal>
      <Reveal as="p" className="question-copy" delay={0.06}>
        which one feels like ur vibe?
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
        <button
          type="button"
          className="planning-extra vibe-extra extra-invitation"
          onClick={onExtras}
        >
          make it more ur vibe <span>places & little adventures</span>
        </button>
      </Reveal>
    </>
  );
}
