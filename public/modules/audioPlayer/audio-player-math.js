// Music Player range helpers. Shared by host render and the worklet.
// Digital Start Time / End Time are seconds; they become 0…1 phase via
// time / (frames / sampleRate). Unconnected jacks keep the start/end sliders.

function nodeGraphAudioPlayerTimeSecondsToPhase(timeSeconds, frames, sampleRate) {
  const frameCount = Math.max(0, Number(frames) || 0);
  const rate = Math.max(1, Number(sampleRate) || 44100);
  if (!(frameCount > 1)) {
    return 0;
  }
  const duration = frameCount / rate;
  if (!(duration > 0)) {
    return 0;
  }
  const time = Number(timeSeconds);
  if (!Number.isFinite(time)) {
    return 0;
  }
  const phase = time / duration;
  if (phase <= 0) {
    return 0;
  }
  if (phase >= 1) {
    return 1;
  }
  return phase;
}

function nodeGraphAudioPlayerResolvedPhaseRange(options = {}) {
  const frames = Math.max(0, Number(options.frames) || 0);
  const rate = Math.max(1, Number(options.sampleRate) || 44100);
  const hasInput = typeof options.hasInput === "function" ? options.hasInput : () => false;
  const readInput = typeof options.readInput === "function" ? options.readInput : () => 0;
  const readParam = typeof options.readParam === "function" ? options.readParam : (_key, fallback) => fallback;
  const clamp = typeof options.clamp === "function"
    ? options.clamp
    : (value, lo, hi) => {
      const number = Number(value);
      const n = Number.isFinite(number) ? number : 0;
      return n < lo ? lo : n > hi ? hi : n;
    };
  const start = hasInput("Start Time")
    ? nodeGraphAudioPlayerTimeSecondsToPhase(readInput("Start Time"), frames, rate)
    : clamp(readParam("start", 0), 0, 1);
  const end = hasInput("End Time")
    ? nodeGraphAudioPlayerTimeSecondsToPhase(readInput("End Time"), frames, rate)
    : clamp(readParam("end", 1), 0, 1);
  const collapsedRange = Math.abs(end - start) <= 0.000001;
  const startPhase = collapsedRange ? 0 : Math.min(start, end);
  const endPhase = collapsedRange ? 1 : Math.max(start, end);
  return {
    start,
    end,
    startPhase,
    endPhase,
    span: Math.max(0.000001, endPhase - startPhase),
  };
}
