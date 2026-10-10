import { useNavigate } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowUpRight, Heart, Star } from "lucide-react";
import { useApp } from "../hooks/useApp";
import { MoodImage } from "../components/UI";
export default function Landing() {
  const navigate = useNavigate(),
    { update } = useApp(),
    reduced = useReducedMotion();
  function start(mode) {
    update({ mode });
    navigate("/plan/profile");
  }
  return (
    <motion.div
      className="landing"
      initial={reduced ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <span className="eyebrow">
        <span className="little-dot" /> good plans start here.
      </span>
      <h1>
        less planning.
        <br />
        more <em>chemistry.</em>
        <span className="heading-star" aria-hidden="true">
          ✳
        </span>
      </h1>
      <p className="home-sub">your kind of places. your kind of person.</p>
      <div className="home-moment" aria-hidden="true">
        <div className="photo-main">
          <MoodImage src="https://images.unsplash.com/photo-1506973035872-a4ec16b8e8d9?auto=format&fit=crop&w=700&q=85" />
          <span>go make a little memory.</span>
        </div>
        <div className="photo-small">
          <MoodImage src="https://images.unsplash.com/photo-1515823064-d6e0c04616a7?auto=format&fit=crop&w=400&q=85" />
          <span>meet cute. sip matcha.</span>
        </div>
        <div className="round-sticker">
          <Heart size={22} strokeWidth={1.5} />
          <span>
            entirely
            <br />
            ur vibe
          </span>
        </div>
      </div>
      <section className="home-choices" aria-labelledby="planning-prompt">
        <h2 id="planning-prompt">what are we planning?</h2>
        <button onClick={() => start("date")} className="mode pink">
          <Heart size={22} />
          <span>
            a date<small>let’s make sparks fly</small>
          </span>
          <ArrowUpRight size={20} />
        </button>
        <button onClick={() => start("hangout")} className="mode yellow">
          <Star size={22} />
          <span>
            just a cute hangout<small>good company, great plans</small>
          </span>
          <ArrowUpRight size={20} />
        </button>
      </section>
      <p className="home-fine">♡ &nbsp; a little magic. a lot of you.</p>
    </motion.div>
  );
}
