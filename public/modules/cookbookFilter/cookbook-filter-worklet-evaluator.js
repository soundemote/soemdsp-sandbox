NodeLiveAudioProcessor.prototype.createCookbookFilterState = function createCookbookFilterState() {
    return {
      lastStages: 2,
      x1: [0, 0, 0, 0, 0],
      x2: [0, 0, 0, 0, 0],
      y1: [0, 0, 0, 0, 0],
      y2: [0, 0, 0, 0, 0],
    };
  };

NodeLiveAudioProcessor.prototype.resetCookbookFilterState = function resetCookbookFilterState(state) {
    for (const key of ["x1", "x2", "y1", "y2"]) {
      if (Array.isArray(state?.[key])) {
        state[key].fill(0);
      }
    }
  };

NodeLiveAudioProcessor.prototype.cookbookFilterStageCount = function cookbookFilterStageCount(stages) {
    const value = Math.round(Number(stages));
    return Number.isFinite(value) ? this.clampValue(value, 0, 5) : 2;
  };

NodeLiveAudioProcessor.prototype.cookbookFilterCoefficients = function cookbookFilterCoefficients(mode, frequency, q, gainDb, rate = sampleRate) {
    const safeMode = Math.round(this.clampValue(Number(mode) || 0, 0, 9));
    if (safeMode === 0) {
      return { a1: 0, a2: 0, b0: 1, b1: 0, b2: 0 };
    }
    const safeRate = Math.max(1, Number(rate) || sampleRate || 44100);
    // 0 Hz allowed; only non-negative + Nyquist. No arbitrary 20 Hz floor.
    const rawFreq = Number(frequency);
    const freq = Math.max(0, Math.min(safeRate * 0.49, Number.isFinite(rawFreq) ? rawFreq : 0));
    const safeQ = Math.max(0.0001, Number(q) || 1);
    const omega = 2 * Math.PI * freq / safeRate;
    const sine = Math.sin(omega);
    const cosine = Math.cos(omega);
    const alpha = sine / (2 * safeQ);
    const amplitude = 10 ** (0.025 * (Number(gainDb) || 0));
    const beta = Math.sqrt(amplitude) / safeQ;
    let a0 = 1 + alpha;
    let a1 = -2 * cosine;
    let a2 = 1 - alpha;
    let b0 = 1;
    let b1 = 0;
    let b2 = 0;
    if (safeMode === 1) {
      b1 = 1 - cosine;
      b0 = b1 * 0.5;
      b2 = b0;
    } else if (safeMode === 2) {
      b1 = -(1 + cosine);
      b0 = -b1 * 0.5;
      b2 = b0;
    } else if (safeMode === 3) {
      b0 = safeQ * alpha;
      b2 = -b0;
    } else if (safeMode === 4) {
      b0 = alpha;
      b2 = -alpha;
    } else if (safeMode === 5) {
      b0 = 1;
      b1 = -2 * cosine;
      b2 = 1;
    } else if (safeMode === 6) {
      b0 = 1 - alpha;
      b1 = -2 * cosine;
      b2 = 1 + alpha;
    } else if (safeMode === 7) {
      a0 = 1 + alpha / amplitude;
      a2 = 1 - alpha / amplitude;
      b0 = 1 + alpha * amplitude;
      b1 = -2 * cosine;
      b2 = 1 - alpha * amplitude;
    } else if (safeMode === 8) {
      a0 = (amplitude + 1) + (amplitude - 1) * cosine + beta * sine;
      a1 = -2 * ((amplitude - 1) + (amplitude + 1) * cosine);
      a2 = (amplitude + 1) + (amplitude - 1) * cosine - beta * sine;
      b0 = amplitude * ((amplitude + 1) - (amplitude - 1) * cosine + beta * sine);
      b1 = 2 * amplitude * ((amplitude - 1) - (amplitude + 1) * cosine);
      b2 = amplitude * ((amplitude + 1) - (amplitude - 1) * cosine - beta * sine);
    } else if (safeMode === 9) {
      a0 = (amplitude + 1) - (amplitude - 1) * cosine + beta * sine;
      a1 = 2 * ((amplitude - 1) - (amplitude + 1) * cosine);
      a2 = (amplitude + 1) - (amplitude - 1) * cosine - beta * sine;
      b0 = amplitude * ((amplitude + 1) + (amplitude - 1) * cosine + beta * sine);
      b1 = -2 * amplitude * ((amplitude - 1) + (amplitude + 1) * cosine);
      b2 = amplitude * ((amplitude + 1) + (amplitude - 1) * cosine - beta * sine);
    }
    const scale = a0 !== 0 ? 1 / a0 : 1;
    return {
      a1: a1 * scale,
      a2: a2 * scale,
      b0: b0 * scale,
      b1: b1 * scale,
      b2: b2 * scale,
    };
  };

NodeLiveAudioProcessor.prototype.cookbookFilterSample = function cookbookFilterSample(state, input, mode, frequency, q, gainDb, stages, rate = sampleRate) {
    const stageCount = this.cookbookFilterStageCount(stages);
    if (!state || stageCount <= 0 || Math.round(Number(mode) || 0) === 0) {
      return Number(input) || 0;
    }
    if (state.lastStages !== stageCount) {
      this.resetCookbookFilterState(state);
      state.lastStages = stageCount;
    }
    const coeff = this.cookbookFilterCoefficients(mode, frequency, q, gainDb, rate);
    let value = this.safeFilterNumber(input, state);
    for (let index = 0; index < stageCount; index += 1) {
      const previousInput = value;
      value = coeff.b0 * value + coeff.b1 * state.x1[index] + coeff.b2 * state.x2[index]
        - coeff.a1 * state.y1[index] - coeff.a2 * state.y2[index];
      state.x2[index] = state.x1[index];
      state.x1[index] = previousInput;
      state.y2[index] = state.y1[index];
      state.y1[index] = value;
    }
    return this.safeFilterNumber(value, state);
  };

