// Moved from node-graph-live-frame-evaluator.js: this module's own
// offline/render-time algorithm, now living next to the rest of its
// per-module code instead of the shared file.

function nodeGraphShootingStarExplosionEventSample(runtime, lowRange, highRange) {
  const event = runtime?.shootingStarExplosionEvent;
  if (!event || typeof event !== "object") {
    return { Pulse: 0 };
  }
  const pulseSamples = Math.max(0, Number(event.pulseSamples) || 0);
  const speed = Number(event.speed);
  const low = Number(lowRange) || 0;
  const high = Number(highRange) || 0;
  const lo = Math.min(low, high);
  const hi = Math.max(low, high);
  // speed is expected 0-1 (the site's trigger intensity), interpolated
  // linearly into [lowRange, highRange] to get the actual pulse amplitude.
  // No speed data (not finite) keeps the pulse at max amplitude.
  let power = hi;
  if (Number.isFinite(speed)) {
    const normalizedSpeed = Math.max(0, Math.min(1, speed));
    power = lo + normalizedSpeed * (hi - lo);
  }
  event.pulseSamples = Math.max(0, pulseSamples - 1);
  return { Pulse: pulseSamples > 0 ? power : 0 };
}


// Registers the offline/render-time dispatch handler for shootingStarExplosion
// into nodeGraphLiveModuleEvaluators (declared in node-graph-live-frame-evaluator.js).
// Extracted from the inline if/else-if branch that used to live in that file.
nodeGraphLiveModuleEvaluators.shootingStarExplosion = ({ runtime, node, frame, frames, frameValues }) => nodeGraphShootingStarExplosionEventSample(
  runtime,
  readNodeGraphLiveEffectiveParam(runtime, node, "lowRange", 0, frame, frames, frameValues),
  readNodeGraphLiveEffectiveParam(runtime, node, "highRange", 1, frame, frames, frameValues),
);
