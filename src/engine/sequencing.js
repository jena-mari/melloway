export const activityTemplates = Object.freeze({
  evening: [
    ["bar", "meal", "bar"],
    ["meal", "bar"],
    ["bar", "meal"],
  ],
  shopping: [
    ["cafe", "shop", "bookshop"],
    ["cafe", "shop", "meal"],
    ["cafe", "shop"],
    ["shop", "cafe", "bookshop"],
  ],
  culture: [
    ["culture", "walk", "meal"],
    ["cafe", "culture", "walk"],
    ["culture", "walk"],
    ["culture", "walk", "culture"],
    ["walk", "meal"],
    ["cafe", "walk"],
  ],
  books: [
    ["cafe", "bookshop", "walk"],
    ["cafe", "bookshop"],
    ["bookshop", "cafe"],
    ["bookshop", "cafe", "dessert"],
  ],
  dinner: [
    ["culture", "walk", "meal"],
    ["walk", "meal"],
    ["meal", "dessert"],
    ["meal", "bar"],
  ],
  casual: [
    ["cafe", "shop", "bookshop"],
    ["cafe", "bookshop", "dessert"],
    ["cafe", "activity"],
    ["cafe", "bookshop"],
    ["cafe", "culture", "walk"],
    ["cafe", "walk", "meal"],
    ["culture", "walk", "meal"],
    ["cafe", "dessert"],
    ["culture", "walk"],
  ],
  activity: [
    ["cafe", "activity"],
    ["activity", "meal"],
    ["activity", "dessert"],
  ],
});
export function templatesForIntent(intent, prefs) {
  const r = intent.requiredRoles;
  if (intent.sightseeing && !r.length)
    return [["culture", "walk"], ["cafe", "culture", "walk"], ["walk", "culture"]];
  let key =
    intent.hiddenBars && r.includes("meal")
      ? "evening"
      : intent.upscaleMeal
        ? "dinner"
        : r.includes("shop")
          ? "shopping"
          : r.includes("culture") || r.includes("walk")
            ? "culture"
            : r.includes("bookshop")
              ? "books"
              : r.includes("activity")
                ? "activity"
                : "casual";
  if (r.length === 1 && r.includes("bar"))
    return [
      ["bar", "bar"],
      ["bar", "meal", "bar"],
    ];
  let templates = activityTemplates[key].filter((t) =>
    r.every((role) => t.includes(role)),
  );
  if (!templates.length && r.length >= 2 && r.length <= 4)
    templates = [
      [...r].sort(
        (a, b) =>
          [
            "cafe",
            "culture",
            "shop",
            "bookshop",
            "walk",
            "meal",
            "bar",
            "dessert",
            "activity",
          ].indexOf(a) -
          [
            "cafe",
            "culture",
            "shop",
            "bookshop",
            "walk",
            "meal",
            "bar",
            "dessert",
            "activity",
          ].indexOf(b),
      ),
    ];
  return templates;
}
