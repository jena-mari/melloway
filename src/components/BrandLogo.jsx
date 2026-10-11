export default function BrandLogo({ decorative = false, className = "" }) {
  return (
    <img
      className={`brand-logo ${className}`.trim()}
      src="/icons/optimized/melloway_logo.png"
      alt={decorative ? "" : "melloway"}
      aria-hidden={decorative || undefined}
      width="512"
      height="512"
      decoding="async"
    />
  );
}
