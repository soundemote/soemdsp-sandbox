// Worklet peel for Passive Filter. Math: passive-filter-math.js (same Blob).
// JS cascade (native 1 HP + 1 LP is not enough for Slope 12–24).

NodeLiveAudioProcessor.prototype.sweepFrequencyHz = function sweepFrequencyHz(hz, semitones) {
    if (typeof nodeGraphSweepFrequencyHz === "function") {
      return nodeGraphSweepFrequencyHz(hz, semitones);
    }
    const f = Number(hz);
    if (!Number.isFinite(f) || f <= 0) {
      return 0;
    }
    const st = Number(semitones);
    if (!Number.isFinite(st) || st === 0) {
      return f;
    }
    const out = f * (2 ** (st / 12));
    return Number.isFinite(out) && out > 0 ? out : 0;
  };

NodeLiveAudioProcessor.prototype.createPassiveFilterState = function createPassiveFilterState() {
    return typeof createNodeGraphPassiveFilterState === "function"
      ? createNodeGraphPassiveFilterState()
      : { hp: [], lp: [] };
  };

NodeLiveAudioProcessor.prototype.passiveFilterSample = function passiveFilterSample(
    state,
    input,
    mode,
    lowFrequency,
    highFrequency,
    rate,
    slope,
    stagger,
    gainCompensation,
  ) {
    const safeIn = this.safeFilterNumber(input, state);
    if (typeof nodeGraphPassiveFilterSample !== "function") {
      return 0;
    }
    return this.safeFilterNumber(
      nodeGraphPassiveFilterSample(
        state,
        safeIn,
        mode,
        lowFrequency,
        highFrequency,
        rate,
        null,
        "",
        slope,
        stagger,
        gainCompensation,
      ),
      state,
    );
  };
