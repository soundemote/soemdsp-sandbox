// Text Stream worklet — mirrors text-stream-core.js (pure JS).

NodeLiveAudioProcessor.prototype.createTextStreamState = function createTextStreamState() {
  return {
    index: 0,
    clockWasHigh: false,
    resetWasHigh: false,
    phase: 0,
    lastChar: 32,
    lastIndex: 0,
  };
};

NodeLiveAudioProcessor.prototype.textStreamSample = function textStreamSample(state, options = {}) {
  const message = String(options.message ?? "HELLO MATRIX");
  const len = message.length;
  const loop = Boolean(options.loop);
  const rate = Math.max(0, Number(options.rate) || 0);
  const sampleRate = Math.max(1, Number(options.sampleRate) || 44100);
  const clock = Number(options.clock) || 0;
  const reset = Number(options.reset) || 0;
  const clocked = Boolean(options.clockConnected);

  const resetHigh = reset > 0.5;
  if (resetHigh && !state.resetWasHigh) {
    state.index = 0;
    state.phase = 0;
  }
  state.resetWasHigh = resetHigh;

  let emit = false;
  if (len <= 0) {
    return { Char: 32, Trigger: 0, Index: 0 };
  }

  if (clocked) {
    const clockHigh = clock > 0.5;
    if (clockHigh && !state.clockWasHigh) {
      emit = true;
    }
    state.clockWasHigh = clockHigh;
  } else if (rate > 0) {
    state.phase += rate / sampleRate;
    if (state.phase >= 1) {
      state.phase -= Math.floor(state.phase);
      emit = true;
    }
  }

  if (emit) {
    if (state.index >= len) {
      if (loop) {
        state.index = 0;
      } else {
        const hold = message.charCodeAt(len - 1) || 32;
        state.lastChar = hold;
        state.lastIndex = len - 1;
        return { Char: hold, Trigger: 0, Index: len - 1 };
      }
    }
    const i = state.index;
    const rawCh = message.charAt(i);
    const ch = typeof matrixSanitizeChar === "function" ? matrixSanitizeChar(rawCh) : rawCh;
    state.lastChar = ch === "\n" ? 10 : (ch.charCodeAt(0) || 32);
    state.lastIndex = i;
    state.index = i + 1;
    return { Char: state.lastChar, Trigger: 1, Index: i };
  }

  return {
    Char: state.lastChar,
    Trigger: 0,
    Index: state.lastIndex,
  };
};
