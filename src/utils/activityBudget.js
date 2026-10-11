export const budgetCategories = [
  { id: "food", label: "food" },
  { id: "drinks", label: "drinks" },
  { id: "shopping", label: "shopping" },
  { id: "activities", label: "activities" },
];
const ids = budgetCategories.map(({ id }) => id);
const cents = (value) => Math.round(Number(value) * 100);
export function validActivityBudgets(value) {
  return (
    value === undefined ||
    (value !== null &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.entries(value).every(
        ([key, amount]) =>
          ids.includes(key) &&
          typeof amount === "number" &&
          Number.isFinite(amount) &&
          amount >= 0 &&
          amount <= 200 &&
          Math.abs(amount * 100 - cents(amount)) < 0.000001,
      ))
  );
}
export function estimatedCost(venue) {
  return venue.estimatedCost ?? venue.cost;
}
export function budgetCategory(venue) {
  const tags = venue.tags || [];
  const role = venue.activityRole || venue.roles?.[0];
  if (
    ["shop", "bookshop"].includes(role) ||
    (!role &&
      tags.some((t) =>
        [
          "Shopping",
          "Thrifting",
          "Vintage stores",
          "Flea markets",
          "Bookshops",
        ].includes(t),
      ))
  )
    return "shopping";
  if (["meal", "dessert"].includes(role)) return "food";
  if (role === "cafe")
    return venue.foodAllowance && estimatedCost(venue) >= venue.foodAllowance
      ? "food"
      : "drinks";
  if (role === "bar") return "drinks";
  if (
    !role &&
    tags.some((t) =>
      [
        "Dinner",
        "Fine dining",
        "Brunch",
        "Café food",
        "Italian food",
        "Asian food",
        "Street food",
        "Desserts",
      ].includes(t),
    )
  )
    return "food";
  if (
    !role &&
    tags.some((t) =>
      [
        "Coffee shops",
        "Matcha cafés",
        "Cocktail bars",
        "Speakeasies",
        "Jazz bars",
      ].includes(t),
    )
  )
    return "drinks";
  return "activities";
}
export function replacementBudget(previous, venue) {
  venue = { ...venue,
    ...(previous.arrivalOverride != null ? { arrivalOverride: previous.arrivalOverride } : {}),
    ...(previous.visitOverride != null ? { mins: previous.visitOverride, visitOverride: previous.visitOverride } : {}) };
  const category = budgetCategory(venue);
  const minimum = estimatedCost(venue);
  return previous.budgetCategory === category &&
    Number.isFinite(previous.estimatedCost)
    ? {
        ...venue,
        estimatedCost: minimum,
        cost: Math.max(minimum, previous.cost),
        budgetCategory: category,
      }
    : venue;
}

// Preserve sourced estimates. A budget is an allowance, not a venue price.
// Shopping needs purchase money even where browsing has no admission charge.
export function allocateActivityBudgets(stops, prefs, transport = 0) {
  if (!validActivityBudgets(prefs.activityBudgets)) return null;
  const caps = prefs.activityBudgets || {};
  const available = cents(prefs.budget) - cents(transport);
  if (!Number.isFinite(available) || available < 0) return null;
  const rows = stops.map((venue, index) => ({
    index,
    venue,
    group: budgetCategory(venue),
    minimum: cents(estimatedCost(venue)),
  }));
  if (
    rows.some(
      (row) =>
        !Number.isFinite(estimatedCost(row.venue)) ||
        estimatedCost(row.venue) < 0,
    )
  )
    return null;
  const breakdown = Object.fromEntries(
    ids.map((id) => [
      id,
      { minimum: 0, allowance: 0, custom: Object.hasOwn(caps, id), count: 0 },
    ]),
  );
  for (const row of rows) {
    breakdown[row.group].minimum += row.minimum;
    breakdown[row.group].count++;
  }
  let allocated = 0;
  for (const id of ids) {
    const group = breakdown[id];
    group.allowance = group.custom ? cents(caps[id]) : group.minimum;
    if (group.allowance < group.minimum) return null;
    allocated += group.allowance;
  }
  if (allocated > available) return null;
  const shopping = breakdown.shopping;
  if (shopping.count && !shopping.custom) {
    // Route edits retain money already set aside for purchases. Adding a café
    // must not silently pay for it by shrinking the user's shopping allowance.
    const retained = rows
      .filter(
        (row) =>
          row.group === "shopping" &&
          row.venue.budgetCategory === "shopping" &&
          Number.isFinite(row.venue.estimatedCost),
      )
      .reduce(
        (sum, row) => sum + Math.max(0, cents(row.venue.cost) - row.minimum),
        0,
      );
    // New generation keeps a buffer for opt-in extras.
    const purchases =
      retained ||
      Math.min(
        Math.floor((available - allocated) / 2),
        Math.round(available * 0.4),
      );
    shopping.allowance += purchases;
    allocated += purchases;
    if (allocated > available) return null;
  }
  const allocatedStops = [];
  for (const id of ids) {
    const groupRows = rows.filter((row) => row.group === id);
    let extra = breakdown[id].allowance - breakdown[id].minimum;
    let weight = groupRows.reduce(
      (sum, row) =>
        sum +
        (id === "shopping"
          ? row.venue.activityRole === "shop" ||
            row.venue.roles?.includes("shop")
            ? 3
            : 1
          : Math.max(1, row.minimum)),
      0,
    );
    groupRows.forEach((row, index) => {
      const shareWeight =
        id === "shopping"
          ? row.venue.activityRole === "shop" ||
            row.venue.roles?.includes("shop")
            ? 3
            : 1
          : Math.max(1, row.minimum);
      const share =
        index === groupRows.length - 1
          ? extra
          : Math.floor((extra * shareWeight) / weight);
      extra -= share;
      weight -= shareWeight;
      allocatedStops[row.index] = {
        ...row.venue,
        estimatedCost: row.minimum / 100,
        cost: (row.minimum + share) / 100,
        budgetCategory: id,
      };
    });
  }
  return {
    stops: allocatedStops,
    cost:
      (cents(transport) +
        allocatedStops.reduce((sum, stop) => sum + cents(stop.cost), 0)) /
      100,
    budgetAllocated: (allocated + cents(transport)) / 100,
    budgetUnassigned: (available - allocated) / 100,
    budgetBreakdown: Object.fromEntries(
      ids.map((id) => [
        id,
        {
          ...breakdown[id],
          minimum: breakdown[id].minimum / 100,
          allowance: breakdown[id].allowance / 100,
        },
      ]),
    ),
  };
}
