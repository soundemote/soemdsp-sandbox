/** Pitch Manager — MIDI offsets → one Pitch→Hz, Inc = Hz/sr, pitch thru. */
nodeGraphLiveModuleEvaluators.pitchManager = ({
  runtime, node, nodeId, frame, frames, frameValues, mixInput, hasInput, sampleRate,
}) => {
  void runtime;
  void frames;
  const read = (key, fallback) => {
    if (typeof readNodeGraphLiveEffectiveParam === "function") {
      return readNodeGraphLiveEffectiveParam(runtime, node, key, fallback, frame, frames, frameValues);
    }
    const raw = node?.params?.[key];
    const n = Number(raw);
    return Number.isFinite(n) ? n : fallback;
  };
  const tuningRaw = read("tuning", 440);
  const planck = typeof nodeGraphPlanck === "function" ? nodeGraphPlanck() : 1e-7;
  if (!(tuningRaw > planck)) {
    return { Inc: 0, f: 0, pitch: 0 };
  }
  const tuning = tuningRaw;
  const octave = read("octave", 0);
  const semitones = read("semitones", 0);
  const cents = read("cents", 0);
  const multiply = read("multiply", 1);
  const add = read("add", 0);

  let midiIn = 0;
  if (typeof hasInput === "function" && typeof mixInput === "function") {
    if (hasInput(nodeId, "pitch") || hasInput(nodeId, "0.1V/Oct") || hasInput(nodeId, "In")) {
      midiIn = (typeof nodeGraphFiniteNumber === "function"
        ? nodeGraphFiniteNumber(mixInput(nodeId, "pitch")
          ?? mixInput(nodeId, "0.1V/Oct")
          ?? mixInput(nodeId, "In")
          ?? mixInput(nodeId, "Mono"))
        : Number(mixInput(nodeId, "pitch") || 0)) || 0;
    }
  }
  const midi = midiIn + octave * 12 + semitones + cents / 100;
  let hz = tuning * (2 ** ((midi - 69) / 12));
  hz = hz * (Number.isFinite(multiply) ? multiply : 1) + (Number.isFinite(add) ? add : 0);
  if (!(hz === hz)) hz = 0;
  const sr = Number(sampleRate) > 1 ? Number(sampleRate) : 44100;
  return { Inc: hz / sr, f: hz, pitch: midi };
};
