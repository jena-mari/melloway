import { Link, useNavigate } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { Reveal, gentleEase } from "../components/Introduction";
import BrandLogo from "../components/BrandLogo";
export default function Landing() {
  const navigate = useNavigate(),
    reduced = useReducedMotion();
  return (
    <div className="intro-screen landing">
      <Reveal as="p" className="intro-kicker">
        good plans start here.
      </Reveal>
      <div className="landing-centre">
        <Reveal as="h1" className="intro-logo" delay={0.06}>
          <BrandLogo />
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
        </Reveal>
      </div>
    </div>
  );
}
