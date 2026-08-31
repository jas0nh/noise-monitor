export const RANGES = Object.freeze({
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
});

export function decibelAverage(values) {
  const finite = values.filter(Number.isFinite);
  if (finite.length === 0) return null;
  const energy = finite.reduce((sum, value) => sum + 10 ** (value / 10), 0);
  return 10 * Math.log10(energy / finite.length);
}

export function isCalibrated(offset) {
  return Number.isFinite(offset) && Math.abs(offset) > 0.001;
}

export function displayLevel(sample, key) {
  return sample[key] + sample.calibrationOffset;
}

export function rangeStart(range, now = Date.now()) {
  return now - (RANGES[range] ?? RANGES["24h"]);
}
