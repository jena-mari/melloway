import { memo, useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";

// Small original SVG doodles keep the artwork crisp and light on a phone.
export function Doodle({ kind }) {
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
      {kind === "camera" && (
        <>
          <path
            d="M15 34 L32 34 L37 24 L63 24 L68 34 L85 34 Q91 34 91 42 L91 76 Q91 84 83 84 L17 84 Q9 84 9 76 L9 42 Q9 34 15 34 Z"
            fill="#f5e8aa"
          />
          <circle cx="50" cy="58" r="18" fill="white" />
          <circle cx="50" cy="58" r="11" fill="#f8a8b9" />
          <path d="M76 43 L82 43 M21 27 L27 27 M13 16 L13 23 M9 19 L17 19" />
        </>
      )}
      {kind === "star" && (
        <>
          <path
            d="M49 13 Q52 41 82 49 Q54 52 48 84 Q44 56 16 49 Q42 43 49 13 Z"
            fill="#f5e8aa"
          />
          <path d="M81 13 L81 27 M74 20 L88 20 M14 72 L14 84 M8 78 L20 78" />
        </>
      )}
      {kind === "leaf" && (
        <>
          <path d="M23 79 Q7 30 77 18 Q90 72 23 79 Z" fill="#d3e4b4" />
          <path d="M14 88 Q42 55 67 31 M35 65 L32 45 M48 51 L70 52" />
          <path d="M83 71 Q87 82 97 76" stroke="#f8a8b9" strokeWidth="4" />
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
  const motifs = ["apple", "matcha", "flower", "camera", "star", "leaf"];
  const introduction = screen.startsWith("/plan/") || screen === "/generating";
  const seed =
    [...screen].reduce((sum, letter) => sum + letter.charCodeAt(0), 0) %
    motifs.length;
  return (
    <div
      className={`doodle-backdrop ${screen === "/" ? "home-doodles" : introduction ? "intro-doodles" : "edge-doodles"} ${screen === "/plan/profile" ? "name-doodles" : ""}`}
      aria-hidden="true"
    >
      {motifs.map((_, i) => (
        <motion.span
          key={`${screen}-${i}`}
          className={`floating-doodle doodle-${i + 1}`}
          initial={false}
          animate={
            quiet
              ? { opacity: 0, y: 0, rotate: 0 }
              : reduced
                ? { opacity: 0.42, y: 0, rotate: -6 }
                : {
                    opacity:
                      i % 2 === 0 ? [0.35, 0.6, 0.5, 0.35] : [0, 0.6, 0.5, 0],
                    y: [10, 0, -10, -18],
                    rotate: [-8, -4, 3, 6],
                  }
          }
          transition={
            quiet || reduced
              ? { duration: 0 }
              : {
                  duration: 12,
                  delay: 0.15 + i * 0.4,
                  repeat: Infinity,
                  repeatDelay: 2,
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
