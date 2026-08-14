// Realtime worklet evaluator for xyPad.
// Phase/mouse params are instant UI targets (mirrored with X/Y Phase).
// Out X/Y (and phosphor) use the same path (see xy-pad-dsp.js):
//   sig = bipolar(Phase) + Input CV
//   → Filter Order: Papoulis ↔ lattice (native Papoulis only)
//   → Out
(() => {
  const buildBase = NodeLiveAudioProcessor.prototype.buildLiveModuleEvaluators;
  NodeLiveAudioProcessor.prototype.buildLiveModuleEvaluators = function buildLiveModuleEvaluatorsWithXyPad() {
    const evaluators = buildBase.call(this);
    evaluators.xyPad = (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
      const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
      if (!(this.xyPadFilterStates instanceof Map)) {
        this.xyPadFilterStates = new Map();
      }
      let pair = this.xyPadFilterStates.get(nodeId);
      if (!pair) {
        const create = typeof this.createPapoulisFilterState === "function"
          ? () => this.createPapoulisFilterState()
          : () => ({ nativeHandle: 0 });
        pair = { x: create(), y: create() };
        this.xyPadFilterStates.set(nodeId, pair);
      }

      const states = this.impulseButtonStates instanceof Map
        ? this.impulseButtonStates
        : new Map();
      this.impulseButtonStates = states;
      const state = states.get(nodeId) || (
        typeof this.createImpulseButtonState === "function"
          ? this.createImpulseButtonState()
          : { amplitude: 1, pulseSamples: 0 }
      );
      states.set(nodeId, state);
      const pulseSamples = Math.max(0, Number(state.pulseSamples) || 0);
      state.pulseSamples = Math.max(0, pulseSamples - 1);

      const gate = read("gate", 0) > 0.5 ? 1 : 0;
      const pauseOnLift = read("pauseOnLift", 0) > 0.5;
      if (pauseOnLift && gate < 1 && pair.held && Number.isFinite(pair.held.X) && Number.isFinite(pair.held.Y)) {
        return {
          X: pair.held.X,
          Y: pair.held.Y,
          Gate: 0,
          Spike: pulseSamples > 0 ? (Number(state.amplitude) || 1) : 0,
        };
      }

      const rawMouseX = Number(read("x", read("xPhase", 0.5)));
      const rawMouseY = Number(read("y", read("yPhase", 0.5)));
      // Do not use `n || 0.5` — that maps legitimate edge 0 to center.
      const mouseX = Math.max(0, Math.min(1, Number.isFinite(rawMouseX) ? rawMouseX : 0.5));
      const mouseY = Math.max(0, Math.min(1, Number.isFinite(rawMouseY) ? rawMouseY : 0.5));
      const sigX = nodeGraphXyPadDspUnitToBipolar(mouseX) + (Number(mixInput(nodeId, "X")) || 0);
      const sigY = nodeGraphXyPadDspUnitToBipolar(mouseY) + (Number(mixInput(nodeId, "Y")) || 0);

      const cutoff = nodeGraphXyPadDspPapoulisCutoffHz(read("papoulis", 0.35));
      const order = Math.max(0, Math.min(1, Math.round(Number(read("filterOrder", 0)) || 0)));
      const qX = read("xQuantize", 0);
      const qY = read("yQuantize", 0);
      const rate = Number(safeRate) || sampleRate;
      // Native papoulis_filter.wasm only — no JS Papoulis.
      const canFilter = cutoff > 0
        && this.nativePapoulisFilterReady
        && typeof this.papoulisFilterSample === "function";

      const out = {
        X: nodeGraphXyPadDspProcessAxis(sigX, {
          cutoff,
          order,
          quantizeAmt: qX,
          filterSample: canFilter
            ? (s) => this.papoulisFilterSample(pair.x, s, cutoff, rate)
            : null,
        }),
        Y: nodeGraphXyPadDspProcessAxis(sigY, {
          cutoff,
          order,
          quantizeAmt: qY,
          filterSample: canFilter
            ? (s) => this.papoulisFilterSample(pair.y, s, cutoff, rate)
            : null,
        }),
        Gate: gate,
        Spike: pulseSamples > 0 ? (Number(state.amplitude) || 1) : 0,
      };
      pair.held = { X: out.X, Y: out.Y };
      return out;
    };
    return evaluators;
  };
})();
