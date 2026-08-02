// Worklet-side Chord Pad (pure JS — no native dependency).

NodeLiveAudioProcessor.prototype.createChordPadState = function createChordPadState() {
  return {};
};

NodeLiveAudioProcessor.prototype.chordPadRotateLeft12 = function chordPadRotateLeft12(mask, amount) {
  const n = ((amount % 12) + 12) % 12;
  if (n === 0) {
    return mask & 0xFFF;
  }
  return ((mask << n) | (mask >> (12 - n))) & 0xFFF;
};

NodeLiveAudioProcessor.prototype.chordPadSample = function chordPadSample(_state, options = {}) {
  const key = ((Math.round(Number(options.key) || 0) % 12) + 12) % 12;
  const mode = Math.round(Number(options.mode) || 0) === 1 ? 1 : 0;
  let degree = Math.max(0, Math.min(6, Math.round(Number(options.degree) || 0)));
  if (options.hasSelectInput) {
    const v = Number(options.select);
    if (Number.isFinite(v)) {
      if (v >= 0 && v <= 6.5 && Number.isInteger(v)) {
        degree = Math.max(0, Math.min(6, v));
      } else {
        const u = Math.max(0, Math.min(1, v));
        degree = Math.max(0, Math.min(6, Math.floor(u * 6.999)));
      }
    }
  }
  // [offset, quality] major / natural minor
  const major = [[0, 0], [2, 1], [4, 1], [5, 0], [7, 0], [9, 1], [11, 2]];
  const minor = [[0, 1], [2, 2], [3, 0], [5, 1], [7, 1], [8, 0], [10, 0]];
  const table = mode === 1 ? minor : major;
  const [offset, quality] = table[degree] || table[0];
  const rootPc = (key + offset) % 12;
  // quality 0=maj 0x91, 1=min 0x89, 2=dim 0x49
  const base = quality === 1 ? 0x89 : quality === 2 ? 0x49 : 0x91;
  const scale = this.chordPadRotateLeft12(base, rootPc);
  const level = Number(options.level);
  const gate = Number.isFinite(level) ? Math.max(0, Math.min(1, level)) : 1;
  return {
    Scale: scale,
    Root: (60 + rootPc) / 120,
    Gate: gate,
  };
};
