import { motion, useReducedMotion } from "framer-motion";
export const gentleEase = [0.22, 1, 0.36, 1];
export function Reveal({
  children,
  className = "",
  as = "div",
  delay = 0,
  ...props
}) {
  const reduced = useReducedMotion(),
    Component = motion[as];
  return (
    <Component
      className={className}
      initial={reduced ? false : { opacity: 0, y: 9 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.32,
        delay: reduced ? 0 : delay,
        ease: gentleEase,
      }}
      {...props}
    >
      {children}
    </Component>
  );
}
