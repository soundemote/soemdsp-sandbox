NodeLiveAudioProcessor.prototype.createStepGridState = function createStepGridState() {
    return {
      active: 0,
      gate: 0,
      index: 0,
      lastReset: 0,
      lastTrigger: 0,
    };
  };

NodeLiveAudioProcessor.prototype.stepGridSample = function stepGridSample(state, trigger, reset, params) {
    const safeTrigger = this.safeFilterNumber(trigger, null);
    const safeReset = this.safeFilterNumber(reset, null);
    const threshold = this.safeFilterNumber(params.threshold, null);
    const steps = params.steps.map((value) => (this.safeFilterNumber(value, null) > 0.5 ? 1 : 0));
    const stepCount = steps.length;
    if (state.index >= stepCount) {
      state.index %= stepCount;
    }
    if (state.lastReset <= threshold && safeReset > threshold) {
      state.index = 0;
    }
    if (state.lastTrigger <= threshold && safeTrigger > threshold) {
      state.active = steps[state.index];
      state.index = (state.index + 1) % stepCount;
    }
    state.gate = safeTrigger > threshold && state.active ? 1 : 0;
    state.lastTrigger = safeTrigger;
    state.lastReset = safeReset;
    return {
      Gate: state.gate,
      Step: stepCount > 1 ? state.index / (stepCount - 1) : 0,
    };
  };
