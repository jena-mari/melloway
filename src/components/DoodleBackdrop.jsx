import { memo, useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";

// The supplied artwork is shared by backgrounds, covers and route suggestions.
const artwork = {
  matcha: "green_matcha",
  coffee: "black_coffee",
  cookie: "black_cookie",
  pot: "black_pot",
  whisk: "green_whisk",
  strain: "green_strain",
  cat: "pink_cat",
  duo: "pink_duo",
  wine: "pink_wine",
  camera: "yellow_camera",
  music: "yellow_music",
  shell: "yellow_shell",
  palette: "yellow_palette",
  kaomoji: "yellow_kaomoji",
  sparkle: "yellow_sparkle",
  salmon: "yellow_salmon",
  bread: "yellow_bread",
  fish: "yellow_fish",
  // Keep existing callers while replacing every old drawing with supplied art.
  apple: "green_matcha",
  flower: "yellow_kaomoji",
  star: "yellow_sparkle",
  leaf: "green_whisk",
  bag: "pink_duo",
  book: "yellow_music",
  plate: "black_pot",
  dessert: "black_cookie",
};
export function Doodle({ kind }) {
  return (
    <img
      className="doodle-art"
      src={`/icons/optimized/${artwork[kind] || artwork.matcha}.png`}
      alt=""
      aria-hidden="true"
      width="256"
      height="256"
      decoding="async"
      draggable={false}
    />
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
  const motifs = [
    "matcha", "camera", "cat", "whisk", "coffee", "music",
    "duo", "wine", "shell", "cookie", "pot", "strain",
    "palette", "kaomoji", "sparkle", "bread", "salmon", "fish",
  ];
  const introduction = screen.startsWith("/plan/") || screen === "/generating";
  const seed =
    [...screen].reduce((sum, letter) => sum + letter.charCodeAt(0), 0) %
    motifs.length;
  return (
    <div
      className={`doodle-backdrop ${screen === "/" ? "home-doodles" : introduction ? "intro-doodles" : "edge-doodles"} ${screen === "/plan/profile" ? "name-doodles" : ""}`}
      aria-hidden="true"
    >
      {Array.from({ length: 6 }, (_, i) => (
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
