// SpeedColorInertia — pure math (main thread + AudioWorklet).
//
// Instantaneous |Δsample| = "speed" (saw/discontinuities spike; sine is low).
// Target saturation falls as speed rises (rich color → white). Inertial
// attack/release smooths saturation (Inertia out).
//
// Signal outs (unit-ish, modular-friendly — not CSS strings):
//   Raw     — current sample
//   Speed   — min(|Δ| * gain, 1)   high on edges
//   Inertia — smoothed saturation 0…1  (1 = full color, 0 = white)

function createNodeGraphSpeedColorInertiaState() {
  return {
    lastSample: 0,
    saturation: 1,
  };
}

/**
 * @param {{ lastSample: number, saturation: number }} state
 * @param {number} currentSample
 * @param {{ gain?: number, attack?: number, release?: number }} params
 * @returns {{ Raw: number, Speed: number, Inertia: number }}
 */
function nodeGraphSpeedColorInertiaSample(state, currentSample, params = {}) {
  const sample = Number(currentSample) || 0;
  const gain = Math.max(0, Number(params.gain) || 0);
  const attack = Math.max(0, Math.min(1, Number(params.attack)));
  const release = Math.max(0, Math.min(1, Number(params.release)));

  const slopeSpeed = Math.abs(sample - (Number(state.lastSample) || 0));
  state.lastSample = sample;

  // gain maps slope → 0…1 "how white"
  const speed01 = Math.min(slopeSpeed * gain, 1);
  const targetSat = 1 - speed01;

  let sat = Number(state.saturation);
  if (!Number.isFinite(sat)) {
    sat = 1;
  }
  // Attack when desaturating (speed up → white); release when recovering color.
  if (targetSat < sat) {
    const a = Number.isFinite(attack) ? attack : 1;
    sat += (targetSat - sat) * a;
  } else {
    const r = Number.isFinite(release) ? release : 0.005;
    sat += (targetSat - sat) * r;
  }
  if (sat < 0) sat = 0;
  if (sat > 1) sat = 1;
  state.saturation = sat;

  return {
    Raw: sample,
    Speed: speed01,
    Inertia: sat,
  };
}

/**
 * Optional CSS helper for faces/debug (not a graph output).
 * hueCycle 0…1 → degrees; lightness 0…1 → %.
 */
function nodeGraphSpeedColorInertiaHslCss(inertia01, hueCycle = 240 / 360, lightness01 = 0.5) {
  const h = (((Number(hueCycle) || 0) % 1) + 1) % 1 * 360;
  const s = Math.max(0, Math.min(100, (Number(inertia01) || 0) * 100));
  const l = Math.max(0, Math.min(100, (Number(lightness01) || 0) * 100));
  return `hsl(${h}, ${s}%, ${l}%)`;
}
