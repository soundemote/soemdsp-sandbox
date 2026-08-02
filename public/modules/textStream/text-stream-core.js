// Text Stream — type a string, emit one character at a time on digital outs.
//
// Contract (simple on purpose):
//   Char    = Unicode code point as integer (exact float, e.g. 65 = "A")
//   Trigger = 1 for the sample where a new char is emitted, else 0
//   Index   = character index in the message (integer 0..len-1)
//
// Timing:
//   • Clock rising edge → emit next char (clocked mode when Clock is used)
//   • Free-run: Rate (Hz) advances the cursor without Clock
//   • Reset rising edge → cursor back to 0 (no emit)

const TEXT_STREAM_DEFAULT_MESSAGE = "HELLO MATRIX";

function normalizeNodeGraphTextStream(raw = null) {
  const source = raw && typeof raw === "object" ? raw : {};
  let message = typeof source.message === "string" ? source.message : TEXT_STREAM_DEFAULT_MESSAGE;
  if (message.length > 8192) {
    message = message.slice(0, 8192);
  }
  // Prefer matrix-legal glyphs when sanitizer is loaded (Matrix Display set).
  if (typeof matrixSanitizeMessage === "function") {
    message = matrixSanitizeMessage(message);
  }
  return { message };
}

function createNodeGraphTextStreamState() {
  return {
    index: 0,
    clockWasHigh: false,
    resetWasHigh: false,
    phase: 0,
    lastChar: 32, // space
    lastIndex: 0,
  };
}

function nodeGraphTextStreamSample(state, options = {}) {
  const message = String(options.message ?? TEXT_STREAM_DEFAULT_MESSAGE);
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
    state.lastChar = 32;
    state.lastIndex = 0;
    return {
      Char: 32,
      Trigger: 0,
      Index: 0,
    };
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
        // Hold last char, no more triggers past end.
        const hold = message.charCodeAt(len - 1) || 32;
        state.lastChar = hold;
        state.lastIndex = len - 1;
        return {
          Char: hold,
          Trigger: 0,
          Index: len - 1,
        };
      }
    }
    const i = state.index;
    // Emit sanitized glyph code so Matrix Display Serial always gets a legal bin.
    const rawCh = message.charAt(i);
    const ch = typeof matrixSanitizeChar === "function" ? matrixSanitizeChar(rawCh) : rawCh;
    const safeCode = ch === "\n" ? 10 : (ch.charCodeAt(0) || 32);
    state.lastChar = safeCode;
    state.lastIndex = i;
    state.index = i + 1;
    return {
      Char: safeCode,
      Trigger: 1,
      Index: i,
    };
  }

  return {
    Char: state.lastChar,
    Trigger: 0,
    Index: state.lastIndex,
  };
}
