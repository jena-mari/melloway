const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export function validDate(value) {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return (
    Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

export function validTime(value) {
  return typeof value === "string" && TIME_PATTERN.test(value);
}

export function sydneyToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Sydney",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

// Dates and times are optional answers; the planner still needs a concrete schedule.
export function withScheduleDefaults(prefs) {
  const today = sydneyToday();
  return {
    ...prefs,
    date: !prefs.date || prefs.date < today ? today : prefs.date,
    time: prefs.time || "11:00",
    timeExplicit:
      prefs.timeExplicit ?? Boolean(prefs.time && prefs.time !== "11:00"),
  };
}

// Form values are Sydney calendar values, regardless of the user's device timezone.
export function outingInstant(date, time) {
  if (!validDate(date) || !validTime(time))
    throw new Error("Invalid outing date or time");
  const reference = Date.parse(`${date}T${time}:00Z`);
  const offsetFormat = new Intl.DateTimeFormat("en", {
    timeZone: "Australia/Sydney",
    timeZoneName: "shortOffset",
  });
  let instant = reference;
  // Re-evaluate at the candidate instant to handle the day the offset changes.
  for (let i = 0; i < 3; i++) {
    const offsetLabel = offsetFormat
      .formatToParts(instant)
      .find((part) => part.type === "timeZoneName").value;
    const match = offsetLabel.match(/GMT([+-])(\d+)(?::(\d+))?/);
    const offset = match
      ? (Number(match[2]) * 60 + Number(match[3] || 0)) *
        (match[1] === "+" ? 1 : -1)
      : 0;
    const next = reference - offset * 60_000;
    if (next === instant) break;
    instant = next;
  }
  const localParts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Australia/Sydney",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(instant)
      .map((part) => [part.type, part.value]),
  );
  const local = `${localParts.year}-${localParts.month}-${localParts.day}T${localParts.hour}:${localParts.minute}`;
  if (local !== `${date}T${time}`)
    throw new Error(
      "That time does not exist in Sydney due to daylight saving",
    );
  return new Date(instant).toISOString();
}
