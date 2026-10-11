import { Link, useNavigate } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { Reveal, gentleEase } from "../components/Introduction";
import { useApp } from '../hooks/useApp';
export default function Landing() {
  const { current, history } = useApp();
  const navigate = useNavigate(),
    reduced = useReducedMotion();
  return (
    <div className="intro-screen landing">
      <Reveal as="p" className="intro-kicker">
        good plans start here.
      </Reveal>
      <div className="landing-centre">
        <Reveal as="h1" className="intro-logo" delay={0.06}>
          melloway
        </Reveal>
        <Reveal delay={0.14}>
          <motion.button
            className="intro-start"
            onClick={() => navigate("/plan/profile")}
            whileHover={reduced ? {} : { scale: 1.03 }}
            whileTap={reduced ? {} : { scale: 0.96 }}
            transition={{ duration: 0.18, ease: gentleEase }}
          >
            start
          </motion.button>
          <Link className="landing-picks-link" to="/picks">
            melloway picks ↗
          </Link>
          {current && <Link className="landing-picks-link landing-resume" to="/itinerary">
            {current.plan.status === 'in-progress' ? 'continue ur day' : 'ur upcoming day'} ↗
          </Link>}
          {history.length > 0 && <Link className="landing-picks-link" to="/history">past dates ↗</Link>}
        </Reveal>
      </div>
    </div>
  );
}
