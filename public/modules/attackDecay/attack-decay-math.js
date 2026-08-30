// Attack Decay — easy gate envelope.
// One-pole exponential approach + power-law Curve (γ).
//
// inputMode: 0 Gate (follow) | 1 Trigger (rising edge starts AD)
// cycle:     0 Off | 1 Loop | 2 LFO (free-run; Gate rising = sync/reset)

function nodeGraphAttackDecayCoefficient(seconds, sampleRate) {
  const time = Number(seconds);
  if (!Number.isFinite(time) || time <= 0) {
    return 1;
  }
  const samples = Math.max(1, time * Math.max(1, Number(sampleRate) || 44100));
  return 1 - Math.exp(-1 / samples);
}

function createNodeGraphAttackDecayState() {
  return {
    raw: 0,
    lastGate: 0,
    // idle | attack | decay — used by Trigger / Loop / LFO (not pure Gate+Off follower)
    phase: "idle",
  };
}

const NODE_GRAPH_ATTACK_DECAY_PEAK = 0.97;
const NODE_GRAPH_ATTACK_DECAY_FLOOR = 0.02;

/**
 * @param {ReturnType<typeof createNodeGraphAttackDecayState>} state
 * @param {number} gate
 * @param {{
 *   attack?: number,
 *   decay?: number,
 *   curve?: number,
 *   amplitude?: number,
 *   inputMode?: number,
 *   cycle?: number,
 * }} params
 * @param {number} sampleRate
 * @returns {number}
 */
function nodeGraphAttackDecaySample(state, gate, params, sampleRate) {
  if (!state || typeof state !== "object") {
    return 0;
  }
  if (state.phase == null) state.phase = "idle";
  if (state.lastGate == null) state.lastGate = 0;

  const rate = Math.max(1, Number(sampleRate) || 44100);
  const attack = Math.max(0, Number(params?.attack) || 0);
  const decay = Math.max(0, Number(params?.decay) || 0);
  const curve = Math.max(0.001, nodeGraphFiniteNumber(params?.curve, 1));
  const amplitude = Number(params?.amplitude);
  const level = Number.isFinite(amplitude) ? amplitude : 1;
  const inputMode = Math.max(0, Math.min(1, Math.round(Number(params?.inputMode) || 0)));
  const cycle = Math.max(0, Math.min(2, Math.round(Number(params?.cycle) || 0)));

  const gateOn = (Number(gate) || 0) > 0.5;
  const rising = gateOn && !(Number(state.lastGate) > 0.5);
  const falling = !gateOn && Number(state.lastGate) > 0.5;
  state.lastGate = gateOn ? 1 : 0;

  // Pure Gate + Off: continuous asymmetric one-pole follower (classic AR).
  const pureFollower = inputMode === 0 && cycle === 0;
  let target = 0;

  if (pureFollower) {
    target = gateOn ? 1 : 0;
  } else {
    // LFO free-run: always cycling; Gate rising hard-syncs to attack.
    if (cycle === 2) {
      if (state.phase === "idle") state.phase = "attack";
      if (rising) {
        state.phase = "attack";
        state.raw = 0;
      }
    } else if (inputMode === 1) {
      // Trigger: rising edge starts attack.
      if (rising) state.phase = "attack";
    } else if (inputMode === 0 && cycle === 1) {
      // Gate + Loop: gate high keeps cycling; gate fall forces decay; gate rise starts attack.
      if (rising) state.phase = "attack";
      if (falling) state.phase = "decay";
      if (!gateOn && state.phase === "idle") {
        // stay idle while ungated
      } else if (gateOn && state.phase === "idle") {
        state.phase = "attack";
      }
    }

    if (state.phase === "attack") {
      target = 1;
      if (state.raw >= NODE_GRAPH_ATTACK_DECAY_PEAK || attack <= 0) {
        if (attack <= 0) state.raw = 1;
        state.phase = "decay";
        target = 0;
      }
    } else if (state.phase === "decay") {
      target = 0;
      if (state.raw <= NODE_GRAPH_ATTACK_DECAY_FLOOR || decay <= 0) {
        if (decay <= 0) state.raw = 0;
        // End of cycle
        if (cycle === 2) {
          // LFO always restarts
          state.phase = "attack";
          target = 1;
        } else if (cycle === 1) {
          // Loop: restart if Trigger mode, or Gate mode while still gated
          if (inputMode === 1 || gateOn) {
            state.phase = "attack";
            target = 1;
          } else {
            state.phase = "idle";
            state.raw = 0;
          }
        } else {
          // Off: one-shot done
          state.phase = "idle";
          state.raw = 0;
        }
      }
    } else {
      // idle
      target = 0;
      state.raw = 0;
    }
  }

  const coef = target > state.raw
    ? nodeGraphAttackDecayCoefficient(attack, rate)
    : nodeGraphAttackDecayCoefficient(decay, rate);
  state.raw += (target - state.raw) * coef;
  if (!Number.isFinite(state.raw)) state.raw = 0;
  if (state.raw < 1e-9) state.raw = 0;
  if (state.raw > 1 - 1e-12 && target >= 1) state.raw = 1;

  const clamped = state.raw < 0 ? 0 : (state.raw > 1 ? 1 : state.raw);
  const shaped = curve === 1 ? clamped : Math.pow(clamped, curve);
  const y = shaped * level;
  return Number.isFinite(y) ? y : 0;
}

/**
 * Face preview: one AD step (gate on then off), with curve applied.
 * For LFO/Loop the drawn shape is still one AD contour (what each cycle looks like).
 */
function nodeGraphAttackDecayPreviewCurve(
  attackSec,
  decaySec,
  curve = 1,
  sampleRate = 1000,
  points = 128,
) {
  const a = Math.max(0, Number(attackSec) || 0);
  const d = Math.max(0, Number(decaySec) || 0);
  const c = Math.max(0.001, Number(curve) || 1);
  const attackHold = Math.max(a * 4, a + 1e-4, 0.001);
  const total = Math.max(attackHold + Math.max(d * 4, d + 1e-4, 0.001), 0.002);
  const rate = Math.max(100, Number(sampleRate) || 1000);
  const n = Math.max(16, Math.round(Number(points) || 128));
  // Pure follower path for a clean A/D silhouette on the face.
  const state = createNodeGraphAttackDecayState();
  const out = [];
  const totalSamples = Math.max(n, Math.ceil(total * rate));
  const step = Math.max(1, Math.floor(totalSamples / n));
  let t = 0;
  for (let i = 0; i < totalSamples; i += 1) {
    const gate = t < attackHold ? 1 : 0;
    const y = nodeGraphAttackDecaySample(
      state,
      gate,
      { attack: a, decay: d, curve: c, amplitude: 1, inputMode: 0, cycle: 0 },
      rate,
    );
    if (i % step === 0 || i === totalSamples - 1) {
      out.push({ t: t / total, y: Math.max(0, Math.min(1, y)) });
    }
    t += 1 / rate;
  }
  if (out.length && out[out.length - 1].t < 1) {
    out.push({ t: 1, y: out[out.length - 1].y });
  }
  return { points: out, attackHold, total, attack: a, decay: d, curve: c };
}
