export function isQuietHour(hour, start = 0, end = 7) {
  if (![hour, start, end].every(Number.isInteger)) throw new TypeError("hours_must_be_integers");
  if ([hour, start, end].some((value) => value < 0 || value > 23)) throw new RangeError("hours_out_of_range");
  if (start === end) return false;
  return start < end ? hour >= start && hour < end : hour >= start || hour < end;
}
