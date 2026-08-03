// SpeedColorInertia — pure math (main thread + AudioWorklet).
//
// Instantaneous |Δsample| = "speed" (saw/discontinuities spike; sine is low).
// Target saturation falls as speed rises (rich color → white). Inertial
// attack/release smooths saturation via Inertial Filter math when loaded.
//
// Signal outs:
//   Raw     — current sample
//   Speed   — min(|Δ| * gain, 1)
//   Inertia — smoothed saturation 0…1  (1 = full color, 0 = white)

function createNodeGraphSpeedColorInertiaState() {
  return {
    lastSample: 0,
    // Reuse inertial-filter state shape for sat smoother.
    sat: typeof createNodeGraphInertialFilterState === "function"
      ? createNodeGraphInertialFilterState()
      : { initialized: false, out: 1 },
  };
}

/**
 * @returns {{ Raw: number, Speed: number, Inertia: number }}
 */
function nodeGraphSpeedColorInertiaSample(state, currentSample, params = {}) {
  const sample = Number(currentSample) || 0;
  const gain = Math.max(0, Number(params.gain) || 0);
  const attack = Math.max(0, Math.min(1, Number(params.attack)));
  const release = Math.max(0, Math.min(1, Number(params.release)));

  const slopeSpeed = Math.abs(sample - (Number(state.lastSample) || 0));
  state.lastSample = sample;

  const speed01 = Math.min(slopeSpeed * gain, 1);
  const targetSat = 1 - speed01;

  if (!state.sat) {
    state.sat = { initialized: false, out: 1 };
  }
  // Seed sat to full color once (inertia starts rich).
  if (!state.sat.initialized) {
    state.sat.initialized = true;
    state.sat.out = 1;
  }

  let sat;
  if (typeof nodeGraphInertialFilterSample === "function") {
    // Attack = desaturate (toward white / lower sat); release = recover color.
    // When target < current we need "fall" = attack; when target > current "rise" = release.
    // nodeGraphInertialFilterSample uses attack on rise, release on fall — swap for sat:
    // fall (desaturate) should use attack param; rise (recover) use release param.
    sat = nodeGraphInertialFilterSample(state.sat, targetSat, release, attack);
  } else {
    const cur = Number(state.sat.out);
    const c = Number.isFinite(cur) ? cur : 1;
    const delta = targetSat - c;
    const k = delta < 0
      ? (Number.isFinite(attack) ? attack : 1)
      : (Number.isFinite(release) ? release : 0.005);
    sat = c + delta * k;
    if (sat < 0) sat = 0;
    if (sat > 1) sat = 1;
    state.sat.out = sat;
  }
  if (sat < 0) sat = 0;
  if (sat > 1) sat = 1;

  return {
    Raw: sample,
    Speed: speed01,
    Inertia: sat,
  };
}

function nodeGraphSpeedColorInertiaHslCss(inertia01, hueCycle = 240 / 360, lightness01 = 0.5) {
  const h = (((Number(hueCycle) || 0) % 1) + 1) % 1 * 360;
  const s = Math.max(0, Math.min(100, (Number(inertia01) || 0) * 100));
  const l = Math.max(0, Math.min(100, (Number(lightness01) || 0) * 100));
  return `hsl(${h}, ${s}%, ${l}%)`;
}
