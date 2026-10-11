// A fixed introduction script. Answers populate the existing planning draft;
// the conversation never depends on generated copy or a network response.
export const namePrompts = [
  { id: "hello", as: "h1", text: "hey there,", speed: 32 },
  {
    id: "name",
    as: "p",
    className: "question-copy",
    text: "what’s ur name?",
    speed: 16,
  },
];
