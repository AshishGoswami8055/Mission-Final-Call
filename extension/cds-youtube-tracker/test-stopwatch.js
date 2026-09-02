/**
 * Unit tests for wall-clock stopwatch math used by the extension.
 * Run: node extension/cds-youtube-tracker/test-stopwatch.js
 */

function getPlayedMs(playedMs, segmentStart, running, now = Date.now()) {
  let ms = playedMs;
  if (segmentStart !== null && running) ms += now - segmentStart;
  return Math.max(0, ms);
}

function formatClock(ms) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function effectiveToday(todayMinutes, serverMinutes, livePlayedMs, isPlaying, lastProgressAt, now) {
  let liveMs = livePlayedMs;
  if (isPlaying) liveMs += Math.max(0, now - lastProgressAt);
  const liveMin = liveMs / 60_000;
  return Math.max(todayMinutes, serverMinutes, liveMin);
}

let passed = 0;
let failed = 0;
function assert(name, cond) {
  if (cond) {
    passed += 1;
    console.log(`PASS ${name}`);
  } else {
    failed += 1;
    console.error(`FAIL ${name}`);
  }
}

const t0 = 1_000_000;
assert("idle clock is 0", getPlayedMs(0, null, false, t0) === 0);
assert("running 5s", getPlayedMs(0, t0, true, t0 + 5000) === 5000);
assert("paused keeps base", getPlayedMs(5000, null, false, t0 + 99999) === 5000);
assert("2x speed still wall 10s", getPlayedMs(0, t0, true, t0 + 10_000) === 10_000);
assert("format 90s", formatClock(90_000) === "1:30");
assert("format 7s", formatClock(7000) === "0:07");

// Frontend max: no double count when server already has minutes
assert(
  "dashboard max no double",
  Math.abs(effectiveToday(5, 5, 5 * 60_000, false, t0, t0) - 5) < 0.001
);
assert(
  "dashboard live ahead of server",
  Math.abs(effectiveToday(2, 2, 150_000, false, t0, t0) - 2.5) < 0.001
);
assert(
  "dashboard extrapolates while playing",
  Math.abs(effectiveToday(0, 0, 60_000, true, t0, t0 + 30_000) - 1.5) < 0.001
);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
