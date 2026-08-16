/**
 * Module bypass: when a node is bypassed, keep it in the audio graph and
 * either pass inputs to outputs (effects) or silence outputs (sources).
 *
 * Pure helpers — main thread (plan build / offline eval) and AudioWorklet.
 *
 * Spec shape (JSON-safe on the plan):
 *   { mode: "silence" | "sink" }
 *   { mode: "pass", map: [{ out, in }, ...] }
 *   { mode: "crossover-avg", inputs: [...], outputs: [...] }
 *   { mode: "minmax" }
 *   { mode: "reverb", dryLIn, dryRIn, dryLOut, dryROut, mixLOut, mixROut }
 */

/** Ports treated as audio carriers for mono/stereo passthrough. */
const NODE_GRAPH_BYPASS_AUDIO_IN = new Set([
  "In", "Mono", "Left", "Right", "L", "R",
  "Dry", "Dry L", "Dry R", "Wet L", "Wet R",
  "In L", "In R", "In1", "In2", "In3", "In4", "In 1", "In 2", "In 3", "In 4",
  "X", "Y", "Z", "A", "B",
  "Mid", "Side",
]);

/** Outputs allowed to take a last-resort audio feed when no better map exists. */
const NODE_GRAPH_BYPASS_AUDIO_OUT = new Set([
  "Out", "Mono", "Left", "Right", "L", "R", "Thru", "Delayed", "Mix", "Dry",
  "Left Out", "Right Out", "Dry L", "Dry R", "Mix L", "Mix R", "Wet L", "Wet R",
  "Mod L", "Mod R", "Out X", "Out Y", "Out Z", "X", "Y", "Z",
  "Out1", "Out2", "Out3", "Out4",
  "Mid", "Side", "I", "Q", "MidI", "SideQ", "Gain",
]);

/**
 * Output port → preferred input port aliases (first match wins).
 * Exact same-name input is always preferred first in the builder.
 */
const NODE_GRAPH_BYPASS_OUT_ALIASES = Object.freeze({
  Out: ["In", "Mono"],
  // Displays may thru primary In / In1 / X / A (XY and dual-channel scopes).
  Thru: ["In", "Mono", "In1", "X", "A"],
  Delayed: ["In", "Mono"],
  Mono: ["Mono", "In"],
  Left: ["Left", "L", "In", "Mono"],
  Right: ["Right", "R", "In", "Mono"],
  L: ["L", "Left", "In", "Mono"],
  R: ["R", "Right", "In", "Mono"],
  "Left Out": ["Left", "L", "In", "Mono"],
  "Right Out": ["Right", "R", "In", "Mono"],
  "Dry L": ["Left", "L", "Dry L", "In", "Mono"],
  "Dry R": ["Right", "R", "Dry R", "In", "Mono"],
  // Wet/mix follow dry (bypass = full dry on wet)
  "Mix L": ["Left", "L", "In", "Mono"],
  "Mix R": ["Right", "R", "In", "Mono"],
  "Wet L": ["Left", "L", "In", "Mono"],
  "Wet R": ["Right", "R", "In", "Mono"],
  Mix: ["In", "Mono", "Left", "L"],
  Dry: ["In", "Mono", "Left", "L"],
  "Mod L": ["Left", "L", "In", "Mono"],
  "Mod R": ["Right", "R", "In", "Mono"],
  // XY outs: same-name first, then stereo L/R (Vectorscope Rotation L→X, R→Y).
  X: ["X", "L", "Left", "In", "Mono"],
  Y: ["Y", "R", "Right", "In", "Mono"],
  Z: ["Z", "In"],
  "Out X": ["X", "L", "Left", "In"],
  "Out Y": ["Y", "R", "Right", "In"],
  "Out Z": ["Z", "In"],
  "0.1V/Oct": ["0.1V/Oct"],
  // Mid/Side Encoder + Quadrature + limiter meter
  Mid: ["Mid", "Left", "L", "In", "Mono"],
  Side: ["Side", "Right", "R", "In", "Mono"],
  I: ["In", "Side", "Mid", "Mono"],
  Q: ["In", "Side", "Mid", "Mono"],
  MidI: ["Mid", "In", "Mono"],
  SideQ: ["Side", "In", "Mono"],
  Gain: ["In", "Mono"],
});

/**
 * Explicit per-type override.
 * Values: "pass" | "silence" | "sink" | "crossover-avg" | "minmax" | "reverb"
 */
const NODE_GRAPH_BYPASS_TYPE_OVERRIDES = Object.freeze({
  // Envelopes → 0
  expAdsr: "silence",
  attackDecay: "silence",
  linearEnvelope: "silence",
  pluckEnvelope: "silence",
  vactrolEnvelopeSeries: "silence",
  vactrolEnvelopeCustom: "silence",
  flowerChildEnvelopeFollower: "silence",
  // Generators / sequencers → mute
  osc: "silence",
  polyBlep: "silence",
  blit: "silence",
  sineWavetable: "silence",
  additiveOsc: "silence",
  gpuAdditiveOsc: "silence",
  aliasSine: "silence",
  robinSinusoid: "silence",
  phoneTone: "silence",
  sinepulse: "silence",
  surgeOscillator: "silence",
  softwaveOsc: "silence",
  curveOsc: "silence",
  dsfOscillator: "silence",
  robinSupersaw: "silence",
  hypersaw: "silence",
  softpopOscillator: "silence",
  wavetable2d: "silence",
  wavetable3d: "silence",
  flexGrid: "silence",
  chaosfly: "silence",
  drummer: "silence",
  arp: "silence",
  ePiano: "silence",
  percussion: "silence",
  snowflake: "silence",
  phosphillator: "silence",
  sinc: "silence",
  noiseGenerator: "silence",
  piSpigotNoise: "silence",
  fractalBrownianNoise: "silence",
  samplePlayer: "silence",
  sampleLooper: "silence",
  audioPlayer: "silence",
  audioInput: "silence",
  kickEnvelope: "silence",
  sineKick: "silence",
  electroKick: "silence",
  electroSnare: "silence",
  electroHat: "silence",
  pulseExplosion: "silence",
  clock: "silence",
  randomClock: "silence",
  clockDivider: "silence",
  delayedTrigger: "silence",
  triggerCounter: "silence",
  triggerDivider: "silence",
  stepSequencer: "silence",
  turingMachine: "silence",
  degreeTuring: "silence",
  gravityWalker: "silence",
  degreePhrase: "silence",
  chordSequencer: "silence",
  chordMemory: "silence",
  chordPad: "silence",
  lutCell: "silence",
  t: "silence",
  t1: "silence",
  t2: "silence",
  t3: "silence",
  t4: "silence",
  t5: "silence",
  t6: "silence",
  t7: "silence",
  t8: "silence",
  t9: "silence",
  t10: "silence",
  binaryClock: "silence",
  theremin: "silence",
  keyboardController: "silence",
  // Crossovers: average In/L/R onto every band out
  crossover2: "crossover-avg",
  crossover3: "crossover-avg",
  crossover4: "crossover-avg",
  crossover5: "crossover-avg",
  crossover6: "crossover-avg",
  // Reverb: dry → dry and wet/mix
  reverbEffect: "reverb",
  soemReverb: "reverb",
  // minMax: In 1 → Max, In 2 → Min
  minMax: "minmax",
  // Parallel buses
  mix: "pass",
  gainBiasMix: "pass",
  // Pitch utilities
  noteGlide: "pass",
  noteTranspose: "pass",
  pitchQuantizer: "pass",
  // Analyzer Thru
  spectrogram: "pass",
  vectorRgb: "pass",
  rasterRgb: "pass",
  gradientVectorscope: "pass",
  traceXyz: "pass",
  badvalMonitor: "pass",
  comparator: "pass",
  sampleDelay: "pass",
  output: "pass",
  // Nested graph: silence for now (passthrough later)
  moduleGroup: "silence",
});

function nodeGraphModuleBypassInputsOutputs(type) {
  const def = (typeof nodeGraphModuleDefinitions !== "undefined" && nodeGraphModuleDefinitions)
    ? nodeGraphModuleDefinitions[type]
    : null;
  return {
    inputs: Array.isArray(def?.inputs) ? def.inputs : [],
    outputs: Array.isArray(def?.outputs) ? def.outputs : [],
    declared: def?.bypass || null,
  };
}

/**
 * @returns {"pass"|"silence"|"sink"|"crossover-avg"|"minmax"|"reverb"}
 */
function nodeGraphModuleBypassPolicy(type) {
  if (NODE_GRAPH_BYPASS_TYPE_OVERRIDES[type]) {
    return NODE_GRAPH_BYPASS_TYPE_OVERRIDES[type];
  }
  const { inputs, outputs, declared } = nodeGraphModuleBypassInputsOutputs(type);
  if (
    declared === "pass"
    || declared === "silence"
    || declared === "sink"
    || declared === "crossover-avg"
    || declared === "minmax"
    || declared === "reverb"
  ) {
    return declared;
  }
  if (!outputs.length) {
    return "sink";
  }
  const hasAudioIn = inputs.some((port) => NODE_GRAPH_BYPASS_AUDIO_IN.has(port));
  const hasExactPairs = outputs.some((out) => inputs.includes(out));
  if (hasAudioIn || hasExactPairs) {
    return "pass";
  }
  return "silence";
}

/**
 * @returns {Array<{ out: string, in: string }>}
 */
function nodeGraphModuleBypassPortMap(type) {
  const { inputs, outputs } = nodeGraphModuleBypassInputsOutputs(type);
  if (!outputs.length) {
    return [];
  }
  const inputSet = new Set(inputs);
  const map = [];
  for (const outPort of outputs) {
    let inPort = null;
    if (inputSet.has(outPort)) {
      inPort = outPort;
    } else {
      const aliases = NODE_GRAPH_BYPASS_OUT_ALIASES[outPort];
      if (aliases) {
        for (const candidate of aliases) {
          if (inputSet.has(candidate)) {
            inPort = candidate;
            break;
          }
        }
      }
    }
    if (!inPort) {
      const numbered = String(outPort).match(/^Out\s*(\d+)$/i);
      if (numbered) {
        const cand = `In${numbered[1]}`;
        const candSp = `In ${numbered[1]}`;
        if (inputSet.has(cand)) {
          inPort = cand;
        } else if (inputSet.has(candSp)) {
          inPort = candSp;
        }
      }
    }
    if (
      !inPort
      && (
        NODE_GRAPH_BYPASS_AUDIO_OUT.has(outPort)
        || /^Out\s*\d+$/i.test(outPort)
        || /(?:^| )(?:L|R|left|right|mix|dry|wet)$/i.test(outPort)
        || /left|right|mix|dry|wet/i.test(outPort)
      )
    ) {
      for (const candidate of inputs) {
        if (NODE_GRAPH_BYPASS_AUDIO_IN.has(candidate)) {
          inPort = candidate;
          break;
        }
      }
    }
    if (inPort) {
      map.push({ out: outPort, in: inPort });
    }
  }
  return map;
}

/**
 * Full bypass spec for a module type (stored on plan nodes).
 * @returns {{ mode: string, map?: Array, inputs?: string[], outputs?: string[] }}
 */
function nodeGraphModuleBypassSpec(type) {
  const policy = nodeGraphModuleBypassPolicy(type);
  if (policy === "silence" || policy === "sink") {
    return { mode: policy };
  }
  const { inputs, outputs } = nodeGraphModuleBypassInputsOutputs(type);
  if (policy === "crossover-avg") {
    // Prefer L/R canonical names; fall back to Left/Right if still present.
    const avgInputs = [];
    for (const p of ["In", "L", "R", "Left", "Right", "Mono"]) {
      if (inputs.includes(p) && !avgInputs.includes(p)) {
        avgInputs.push(p);
      }
    }
    if (!avgInputs.length) {
      avgInputs.push("In", "L", "R");
    }
    return {
      mode: "crossover-avg",
      inputs: avgInputs,
      outputs: outputs.slice(),
    };
  }
  if (policy === "minmax") {
    return { mode: "minmax" };
  }
  if (policy === "reverb") {
    // Dry out + wet/mix out both get the dry input (Left/L + Mono/In, etc.).
    return {
      mode: "reverb",
      dryLIn: inputs.includes("Left") ? "Left" : (inputs.includes("L") ? "L" : (inputs.includes("Mono") ? "Mono" : "In")),
      dryRIn: inputs.includes("Right") ? "Right" : (inputs.includes("R") ? "R" : (inputs.includes("Mono") ? "Mono" : "In")),
      monoIn: inputs.includes("Mono") ? "Mono" : (inputs.includes("In") ? "In" : null),
      dryLOut: outputs.includes("Dry L") ? "Dry L" : null,
      dryROut: outputs.includes("Dry R") ? "Dry R" : null,
      mixLOut: outputs.includes("Mix L") ? "Mix L" : (outputs.includes("Wet L") ? "Wet L" : null),
      mixROut: outputs.includes("Mix R") ? "Mix R" : (outputs.includes("Wet R") ? "Wet R" : null),
    };
  }
  // pass
  return { mode: "pass", map: nodeGraphModuleBypassPortMap(type) };
}

/**
 * Evaluate one bypassed frame from a plan-node bypassSpec (or legacy array map).
 * @param {object|Array|null} bypassSpec
 * @param {string} nodeId
 * @param {(nodeId: string, port?: string) => number} mixInput
 * @returns {number | Record<string, number>}
 */
function nodeGraphEvaluateBypassFrame(bypassSpec, nodeId, mixInput) {
  // Legacy: bare port map array
  if (Array.isArray(bypassSpec)) {
    if (!bypassSpec.length) {
      return 0;
    }
    const result = {};
    for (const entry of bypassSpec) {
      if (!entry?.out) {
        continue;
      }
      result[entry.out] = Number(mixInput(nodeId, entry.in || "In")) || 0;
    }
    return result;
  }
  if (!bypassSpec || typeof bypassSpec !== "object") {
    return 0;
  }
  const mode = bypassSpec.mode || "silence";
  if (mode === "silence" || mode === "sink") {
    return 0;
  }
  if (mode === "crossover-avg") {
    const ports = Array.isArray(bypassSpec.inputs) && bypassSpec.inputs.length
      ? bypassSpec.inputs
      : ["In", "L", "R"];
    let sum = 0;
    for (const port of ports) {
      sum += Number(mixInput(nodeId, port)) || 0;
    }
    const avg = sum / ports.length;
    const result = {};
    const outs = Array.isArray(bypassSpec.outputs) ? bypassSpec.outputs : [];
    for (const outPort of outs) {
      result[outPort] = avg;
    }
    return result;
  }
  if (mode === "minmax") {
    return {
      Max: Number(mixInput(nodeId, "In 1")) || 0,
      Min: Number(mixInput(nodeId, "In 2")) || 0,
    };
  }
  if (mode === "reverb") {
    const mono = bypassSpec.monoIn ? (Number(mixInput(nodeId, bypassSpec.monoIn)) || 0) : 0;
    const dryL = (Number(mixInput(nodeId, bypassSpec.dryLIn || "In")) || 0) + mono;
    const dryR = (Number(mixInput(nodeId, bypassSpec.dryRIn || "In")) || 0) + mono;
    const result = {};
    if (bypassSpec.dryLOut) {
      result[bypassSpec.dryLOut] = dryL;
    }
    if (bypassSpec.dryROut) {
      result[bypassSpec.dryROut] = dryR;
    }
    if (bypassSpec.mixLOut) {
      result[bypassSpec.mixLOut] = dryL;
    }
    if (bypassSpec.mixROut) {
      result[bypassSpec.mixROut] = dryR;
    }
    return result;
  }
  // pass
  const map = Array.isArray(bypassSpec.map) ? bypassSpec.map : [];
  if (!map.length) {
    return 0;
  }
  const result = {};
  for (const entry of map) {
    if (!entry?.out) {
      continue;
    }
    result[entry.out] = Number(mixInput(nodeId, entry.in || "In")) || 0;
  }
  return result;
}

// Back-compat alias used by older call sites that only asked for a map.
function nodeGraphModuleBypassPortMapForPlan(type) {
  const spec = nodeGraphModuleBypassSpec(type);
  if (spec.mode === "pass") {
    return spec.map || [];
  }
  return [];
}

if (typeof globalThis !== "undefined") {
  globalThis.nodeGraphModuleBypassPolicy = nodeGraphModuleBypassPolicy;
  globalThis.nodeGraphModuleBypassPortMap = nodeGraphModuleBypassPortMap;
  globalThis.nodeGraphModuleBypassSpec = nodeGraphModuleBypassSpec;
  globalThis.nodeGraphEvaluateBypassFrame = nodeGraphEvaluateBypassFrame;
}
