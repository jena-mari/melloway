// Phone-sized copies of the supplied vibe-check artwork. Originals stay untouched.
export default function DateIllustration({ kind }) {
  return (
    <img
      src={`/icons/vibe-check/optimized/${kind}.png`}
      className="date-illustration"
      alt=""
      aria-hidden="true"
      width="768"
      height="768"
      decoding="async"
      draggable={false}
    />
  );
}
