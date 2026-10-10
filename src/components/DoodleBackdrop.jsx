import { memo, useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";

// Small original SVG doodles keep the artwork crisp and light on a phone.
function Doodle({ kind }) {
  return (
    <svg
      viewBox="0 0 100 100"
      fill="none"
      stroke="#111"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {kind === "apple" && (
        <>
          <path
            d="M49 29 C33 15 10 34 19 61 C24 81 38 91 49 84 C62 93 78 78 83 59 C91 34 69 17 49 29 Z"
            fill="#d3e4b4"
          />
          <path
            d="M49 30 Q46 17 52 8 M51 20 Q65 5 76 14 Q69 27 54 24"
            fill="#f5e8aa"
          />
          <path d="M29 39 Q23 45 25 53" stroke="white" strokeWidth="4" />
        </>
      )}
      {kind === "matcha" && (
        <>
          <ellipse
            cx="45"
            cy="79"
            rx="34"
            ry="6"
            fill="#f5e8aa"
            stroke="none"
          />
          <path d="M19 43 Q17 79 47 80 Q74 78 73 43" fill="white" />
          <ellipse cx="46" cy="43" rx="27" ry="7" fill="#d3e4b4" />
          <path d="M74 48 Q94 43 89 61 Q86 72 74 69 M35 29 Q26 22 35 12 M55 28 Q47 21 55 10" />
          <path d="M26 88 Q48 92 73 86" />
        </>
      )}
      {kind === "flower" && (
        <>
          <path
            d="M50 21 Q62 6 69 24 Q88 19 83 39 Q100 49 81 59 Q88 78 68 76 Q62 96 49 80 Q30 93 28 74 Q7 77 17 57 Q1 45 21 36 Q17 17 36 24 Q40 7 50 21 Z"
            fill="#f8a8b9"
          />
          <circle cx="49" cy="50" r="13" fill="#f5e8aa" />
          <path d="M43 53 Q49 59 55 52" />
        </>
      )}
    </svg>
  );
}

function DoodleBackdrop({ screen, paused = false }) {
  const reduced = useReducedMotion();
  const [visible, setVisible] = useState(
    () => document.visibilityState === "visible",
  );
  useEffect(() => {
    const update = () => setVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  const quiet = paused || !visible;
  const motifs = ["apple", "matcha", "flower"];
  const introduction = screen.startsWith("/plan/") || screen === "/generating";
  const seed =
    [...screen].reduce((sum, letter) => sum + letter.charCodeAt(0), 0) %
    motifs.length;
  return (
    <div
      className={`doodle-backdrop ${screen === "/" ? "home-doodles" : introduction ? "intro-doodles" : "edge-doodles"} ${screen === "/plan/profile" ? "name-doodles" : ""}`}
      aria-hidden="true"
    >
      {[0, 1]
        .filter((i) => !reduced || i === 0)
        .map((i) => (
          <motion.span
            key={`${screen}-${i}`}
            className={`floating-doodle doodle-${i + 1}`}
            initial={false}
            animate={
              quiet
                ? { opacity: 0, y: 0, rotate: 0 }
                : reduced
                  ? { opacity: 0.48, y: 0, rotate: -6 }
                  : {
                      opacity: [0, 0.7, 0.7, 0],
                      y: [10, 0, -10, -18],
                      rotate: [-8, -4, 3, 6],
                    }
            }
            transition={
              quiet || reduced
                ? { duration: 0 }
                : {
                    duration: 7,
                    delay: i === 0 ? 0.2 : 11,
                    repeat: Infinity,
                    repeatDelay: 13,
                    ease: "easeInOut",
                    times: [0, 0.18, 0.76, 1],
                  }
            }
          >
            <Doodle kind={motifs[(seed + i) % motifs.length]} />
          </motion.span>
        ))}
    </div>
  );
}
export default memo(DoodleBackdrop);
