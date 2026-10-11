// Gregorian Easter; the gallery explicitly closes on Good Friday.
function goodFriday(year) {
  const a = year % 19,
    b = Math.floor(year / 100),
    c = year % 100,
    d = Math.floor(b / 4),
    e = b % 4,
    f = Math.floor((b + 8) / 25),
    g = Math.floor((b - f + 1) / 3),
    h = (19 * a + b - d - g + 15) % 30,
    i = Math.floor(c / 4),
    k = c % 4,
    l = (32 + 2 * e + 2 * i - h - k) % 7,
    m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31),
    day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day - 2))
    .toISOString()
    .slice(0, 10);
}
export function closedOn(venue, date) {
  return Boolean(
    venue.closedDates?.includes(date) ||
    venue.closedMonthDays?.includes(date.slice(5)) ||
    (venue.closesGoodFriday && date === goodFriday(Number(date.slice(0, 4)))),
  );
}
export function offsetDate(date, offset) {
  const instant = new Date(`${date}T12:00:00Z`);
  instant.setUTCDate(instant.getUTCDate() + offset);
  return instant.toISOString().slice(0, 10);
}
