import assert from "node:assert/strict";
import test from "node:test";
import { decibelAverage, displayLevel, isCalibrated, rangeStart } from "../lib/noise-metrics.mjs";
import { isQuietHour } from "../lib/schedule.mjs";

test("uses energy averaging for decibels",()=>{assert.equal(decibelAverage([]),null);assert.ok(Math.abs(decibelAverage([60,70])-67.4036)<.001)});
test("keeps calibration explicit",()=>{const sample={laeq:-40,calibrationOffset:0};assert.equal(isCalibrated(sample.calibrationOffset),false);assert.equal(displayLevel(sample,"laeq"),-40);sample.calibrationOffset=96;assert.equal(displayLevel(sample,"laeq"),56)});
test("calculates fixed ranges",()=>{const now=Date.UTC(2026,7,31,12);assert.equal(rangeStart("24h",now),now-86_400_000);assert.equal(rangeStart("7d",now),now-7*86_400_000)});
test("skips midnight through 06:59 and resumes at 07:00",()=>{assert.equal(isQuietHour(0),true);assert.equal(isQuietHour(6),true);assert.equal(isQuietHour(7),false);assert.equal(isQuietHour(23),false)});
