// A fixed introduction script. Answers populate the existing planning draft;
// the conversation never depends on generated copy or a network response.
export const namePrompts = [
  { id: "hello", as: "h1", text: "hey there,", speed: 32 },
  {
    id: "introduction",
    as: "p",
    className: "question-copy introduction-copy",
    text: "a date, a hangout. let’s make it a good one.",
    speed: 13,
  },
  {
    id: "name",
    as: "p",
    className: "question-copy",
    text: "let’s start with an introduction. what’s ur name?",
    speed: 16,
  },
];
