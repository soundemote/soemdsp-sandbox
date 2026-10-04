// Custom transport player for the rendered sample -- replaces the bare
// native <audio controls> row with a phosphor-styled player inspired by the
// Music Player (audioPlayer) module: play/pause, a waveform of the rendered
// sample as the seek surface (min/max column strokes with a green-phosphor
// glow), a moving playhead, and a time readout. The hidden <audio> element
// stays as the playback engine, so every existing pipeline that feeds it
// (syncNodeGraphRenderedAudioElement, ear protection clearing, downloads)
// keeps working untouched.

function nodeGraphRenderedPlayerElements() {
  return {
    audio: document.getElementById("audioPlayer"),
    play: document.getElementById("nodeRenderedPlayerPlay"),
    wave: document.getElementById("nodeRenderedPlayerWave"),
    canvas: document.getElementById("nodeRenderedPlayerCanvas"),
    playhead: document.getElementById("nodeRenderedPlayerPlayhead"),
    time: document.getElementById("nodeRenderedPlayerTime"),
    root: document.getElementById("nodeRenderedPlayer"),
  };
}

function nodeGraphRenderedPlayerFormatTime(seconds) {
  const s = Math.max(0, nodeGraphFiniteNumber(seconds));
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${String(r).padStart(2, "0")}`;
}

// Mono min/max column pairs over the rendered sample -- same reduction the
// Music Player's phosphor waveform performs, sized to the seek surface.
function nodeGraphRenderedPlayerWaveColumns(width) {
  const rendered = nodeGraphMvp?.rendered;
  const left = rendered?.leftSamples || rendered?.samples;
  const right = rendered?.rightSamples || null;
  const frames = Number(rendered?.frames) || (left?.length || 0);
  if (!left?.length || !frames || width < 2) {
    return null;
  }
  const columns = new Array(width);
  for (let x = 0; x < width; x++) {
    const start = Math.floor((x / width) * frames);
    const end = Math.max(start + 1, Math.floor(((x + 1) / width) * frames));
    let min = Infinity;
    let max = -Infinity;
    for (let i = start; i < end && i < frames; i++) {
      const value = right ? (Number(left[i]) + Number(right[i])) * 0.5 : Number(left[i]);
      if (value < min) min = value;
      if (value > max) max = value;
    }
    if (!Number.isFinite(min)) { min = 0; max = 0; }
    columns[x] = [min, max];
  }
  return columns;
}

function drawNodeGraphRenderedPlayerWave() {
  const els = nodeGraphRenderedPlayerElements();
  if (!els.canvas || !els.wave) {
    return;
  }
  const rect = els.wave.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) {
    return;
  }
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const width = Math.round(rect.width * dpr);
  const height = Math.round(rect.height * dpr);
  if (els.canvas.width !== width || els.canvas.height !== height) {
    els.canvas.width = width;
    els.canvas.height = height;
  }
  const ctx = els.canvas.getContext("2d");
  ctx.clearRect(0, 0, width, height);
  const columns = nodeGraphRenderedPlayerWaveColumns(Math.floor(width / dpr));
  els.root?.classList.toggle("has-sample", Boolean(columns));
  if (!columns) {
    return;
  }
  const mid = height / 2;
  const amp = (height / 2) * 0.86;
  // Phosphor pass: soft glow underlay then a crisp core, matching the
  // Music Player's layered look.
  for (const pass of [
    { color: "rgba(57, 230, 163, 0.25)", blur: 6 * dpr, widthPx: 2.5 * dpr },
    { color: "rgba(57, 230, 163, 0.85)", blur: 0, widthPx: Math.max(1, dpr) },
  ]) {
    ctx.save();
    ctx.strokeStyle = pass.color;
    ctx.lineWidth = pass.widthPx;
    ctx.shadowColor = "rgba(57, 230, 163, 0.8)";
    ctx.shadowBlur = pass.blur;
    ctx.beginPath();
    for (let x = 0; x < columns.length; x++) {
      const [min, max] = columns[x];
      const px = x * dpr + 0.5;
      ctx.moveTo(px, mid - max * amp);
      ctx.lineTo(px, mid - min * amp + 1);
    }
    ctx.stroke();
    ctx.restore();
  }
  // Center line.
  ctx.strokeStyle = "rgba(127, 199, 217, 0.18)";
  ctx.lineWidth = Math.max(1, dpr * 0.75);
  ctx.beginPath();
  ctx.moveTo(0, mid + 0.5);
  ctx.lineTo(width, mid + 0.5);
  ctx.stroke();
}

function nodeGraphPaintTransportRecordButton() {
  const recording = nodeGraphMvp?.liveRecording?.active === true || nodeGraphMvp?.liveRecordingPending === true;
  for (const button of document.querySelectorAll('[data-transport-action="record"]')) {
    button.disabled = false;
    button.classList.remove("under-construction");
    button.classList.toggle("is-recording", recording);
    button.setAttribute("aria-pressed", recording ? "true" : "false");
    button.title = recording ? "Stop recording" : "Record main output";
  }
}

function nodeGraphAppendLiveRecordingChunk(left, right) {
  const rec = nodeGraphMvp?.liveRecording;
  if (!rec || (!rec.active && !rec.closing)) {
    return;
  }
  const count = left?.length || 0;
  if (!count) {
    return;
  }
  const need = rec.frames + count;
  if (rec.left.length < need) {
    const cap = Math.max(need, rec.left.length ? rec.left.length * 2 : 44100);
    const nextL = new Float32Array(cap);
    const nextR = new Float32Array(cap);
    nextL.set(rec.left.subarray(0, rec.frames));
    nextR.set(rec.right.subarray(0, rec.frames));
    rec.left = nextL;
    rec.right = nextR;
  }
  rec.left.set(left, rec.frames);
  rec.right.set(right || left, rec.frames);
  rec.frames = need;
  nodeGraphMvp.rendered = {
    channels: 2,
    frames: rec.frames,
    sampleRate: rec.sampleRate,
    leftSamples: rec.left,
    rightSamples: rec.right,
    samples: rec.left,
    durationSeconds: rec.frames / Math.max(1, rec.sampleRate),
  };
  if (rec.paintQueued) {
    return;
  }
  rec.paintQueued = true;
  window.requestAnimationFrame(() => {
    if (nodeGraphMvp?.liveRecording) {
      nodeGraphMvp.liveRecording.paintQueued = false;
    }
    if (typeof drawNodeGraphRenderedPlayerWave === "function") {
      drawNodeGraphRenderedPlayerWave();
    }
    updateNodeGraphRenderedPlayerUi();
  });
}

function nodeGraphHasRecordedSample() {
  if ((nodeGraphMvp?.rendered?.frames || 0) > 0) {
    return true;
  }
  const audio = document.getElementById("audioPlayer");
  return Boolean(audio && (audio.currentSrc || audio.getAttribute("src")));
}

function nodeGraphRecordAndPlay(button) {
  if (nodeGraphMvp?.liveRecording?.active) {
    if (typeof nodeGraphStopLiveRecording === "function") {
      nodeGraphStopLiveRecording();
    }
    return;
  }
  if (nodeGraphMvp?.liveRecordingPending) {
    nodeGraphMvp.liveRecordingPending = false;
    nodeGraphPaintTransportRecordButton();
    return;
  }
  if (nodeGraphHasRecordedSample() && typeof confirmNodeGraphDefaultButtonClick === "function") {
    const target = button || document.querySelector('[data-transport-action="record"]');
    if (!confirmNodeGraphDefaultButtonClick(target, null, { confirmText: "Confirm" })) {
      return;
    }
  }
  const transport = typeof nodeGraphLiveTransportUiState === "function"
    ? nodeGraphLiveTransportUiState()
    : "";
  const port = nodeGraphMvp?.live?.node?.port;
  if (transport === "playing" && port) {
    nodeGraphStartLiveRecording();
    return;
  }
  nodeGraphMvp.liveRecordingPending = true;
  nodeGraphPaintTransportRecordButton();
  if (typeof nodeGraphTransportHandleAction === "function") {
    nodeGraphTransportHandleAction("play");
  }
  const startedAt = performance.now();
  const wait = () => {
    if (!nodeGraphMvp?.liveRecordingPending) {
      return;
    }
    const state = typeof nodeGraphLiveTransportUiState === "function"
      ? nodeGraphLiveTransportUiState()
      : "";
    const livePort = nodeGraphMvp?.live?.node?.port;
    if (state === "playing" && livePort) {
      nodeGraphMvp.liveRecordingPending = false;
      nodeGraphStartLiveRecording();
      return;
    }
    if (performance.now() - startedAt > 8000) {
      nodeGraphMvp.liveRecordingPending = false;
      nodeGraphPaintTransportRecordButton();
      return;
    }
    window.requestAnimationFrame(wait);
  };
  window.requestAnimationFrame(wait);
}

function nodeGraphStartLiveRecording() {
  const transport = typeof nodeGraphLiveTransportUiState === "function"
    ? nodeGraphLiveTransportUiState()
    : "";
  const port = nodeGraphMvp?.live?.node?.port;
  if (transport !== "playing" || !port) {
    return false;
  }
  const sampleRate = nodeGraphMvp.live?.context?.sampleRate
    || nodeGraphMvp.sampleRate
    || 44100;
  if (typeof clearNodeGraphRenderedAudioElement === "function") {
    clearNodeGraphRenderedAudioElement();
  }
  nodeGraphMvp.liveRecording = {
    active: true,
    closing: false,
    sampleRate,
    left: new Float32Array(0),
    right: new Float32Array(0),
    frames: 0,
    paintQueued: false,
  };
  nodeGraphMvp.rendered = {
    channels: 2,
    frames: 0,
    sampleRate,
    leftSamples: nodeGraphMvp.liveRecording.left,
    rightSamples: nodeGraphMvp.liveRecording.right,
    samples: nodeGraphMvp.liveRecording.left,
    durationSeconds: 0,
  };
  port.postMessage({ type: "setRecording", on: true });
  nodeGraphPaintTransportRecordButton();
  if (typeof drawNodeGraphRenderedPlayerWave === "function") {
    drawNodeGraphRenderedPlayerWave();
  }
  updateNodeGraphRenderedPlayerUi();
  return true;
}

function nodeGraphStopLiveRecording() {
  const rec = nodeGraphMvp?.liveRecording;
  if (!rec?.active) {
    return false;
  }
  rec.active = false;
  rec.closing = true;
  nodeGraphMvp?.live?.node?.port?.postMessage({ type: "setRecording", on: false });
  nodeGraphPaintTransportRecordButton();
  return true;
}

function nodeGraphFinishLiveRecording() {
  const rec = nodeGraphMvp?.liveRecording;
  if (nodeGraphMvp?.discardLiveRecording) {
    nodeGraphMvp.discardLiveRecording = false;
    nodeGraphMvp.liveRecording = null;
    nodeGraphPaintTransportRecordButton();
    return;
  }
  if (!rec) {
    return;
  }
  nodeGraphMvp.liveRecording = null;
  const frames = rec.frames || 0;
  const left = rec.left.slice(0, frames);
  const right = rec.right.slice(0, frames);
  const samples = new Float32Array(frames);
  let peak = 0;
  let squareSum = 0;
  for (let i = 0; i < frames; i += 1) {
    const l = left[i] || 0;
    const r = right[i] || 0;
    samples[i] = (l + r) * 0.5;
    peak = Math.max(peak, Math.abs(l), Math.abs(r));
    squareSum += (l * l + r * r) * 0.5;
  }
  nodeGraphMvp.rendered = frames
    ? {
      channels: 2,
      frames,
      sampleRate: rec.sampleRate,
      durationSeconds: frames / Math.max(1, rec.sampleRate),
      leftSamples: left,
      rightSamples: right,
      samples,
      peak,
      rms: Math.sqrt(squareSum / frames),
    }
    : null;
  if (typeof syncNodeGraphRenderedAudioElement === "function") {
    syncNodeGraphRenderedAudioElement();
  } else if (typeof syncNodeGraphRenderedPlayerWave === "function") {
    syncNodeGraphRenderedPlayerWave();
  }
  nodeGraphPaintTransportRecordButton();
}

function updateNodeGraphRenderedPlayerUi() {
  const els = nodeGraphRenderedPlayerElements();
  if (!els.audio || !els.root) {
    return;
  }
  if (nodeGraphMvp?.liveRecording?.active) {
    const frames = nodeGraphMvp.rendered?.frames || 0;
    const rate = nodeGraphMvp.rendered?.sampleRate || 44100;
    const dur = frames / Math.max(1, rate);
    if (els.time) {
      const text = nodeGraphRenderedPlayerFormatTime(dur);
      els.time.textContent = `${text} / ${text}`;
    }
    if (els.playhead) {
      els.playhead.style.left = frames ? "100%" : "0%";
    }
    if (els.play) {
      els.play.disabled = true;
    }
    els.root.classList.add("is-recording");
    els.root.classList.toggle("empty", frames < 1);
    els.root.classList.toggle("has-sample", frames > 0);
    return;
  }
  els.root.classList.remove("is-recording");
  const duration = Number.isFinite(els.audio.duration) ? els.audio.duration : 0;
  const current = Math.min(duration || 0, nodeGraphFiniteNumber(els.audio.currentTime));
  if (els.time) {
    els.time.textContent = `${nodeGraphRenderedPlayerFormatTime(current)} / ${nodeGraphRenderedPlayerFormatTime(duration)}`;
  }
  if (els.playhead) {
    const progress = duration > 0 ? current / duration : 0;
    els.playhead.style.left = `${(progress * 100).toFixed(3)}%`;
  }
  const playing = !els.audio.paused && !els.audio.ended;
  // Paused = has source, not ended, but audio.paused (user hit pause mid-file).
  const paused = Boolean(
    !playing
    && els.audio.paused
    && !els.audio.ended
    && (els.audio.currentSrc || els.audio.getAttribute("src"))
    && (nodeGraphFiniteNumber(els.audio.currentTime)) > 0.02,
  );
  if (els.play) {
    els.play.classList.add("node-transport-play");
    els.play.textContent = playing ? "❚❚" : "▶";
    els.play.setAttribute("aria-label", playing ? "Pause rendered sample" : "Play rendered sample");
    els.play.setAttribute("aria-pressed", playing ? "true" : "false");
    els.play.classList.toggle("is-playing", playing);
    els.play.classList.toggle("is-paused", paused);
    els.play.dataset.transportState = playing ? "playing" : paused ? "paused" : "stopped";
  }
  els.root.classList.toggle("playing", playing);
  const hasSource = Boolean(els.audio.currentSrc || els.audio.getAttribute("src"));
  els.root.classList.toggle("empty", !hasSource);
  if (els.play) {
    els.play.disabled = !hasSource;
  }
}

function nodeGraphRenderedPlayerSeekFromEvent(event) {
  const els = nodeGraphRenderedPlayerElements();
  if (!els.audio || !els.wave) {
    return;
  }
  const duration = Number.isFinite(els.audio.duration) ? els.audio.duration : 0;
  if (duration <= 0) {
    return;
  }
  const rect = els.wave.getBoundingClientRect();
  const progress = Math.max(0, Math.min(1, (event.clientX - rect.left) / Math.max(1, rect.width)));
  els.audio.currentTime = progress * duration;
  updateNodeGraphRenderedPlayerUi();
}

function syncNodeGraphRenderedPlayerWave() {
  drawNodeGraphRenderedPlayerWave();
  updateNodeGraphRenderedPlayerUi();
}

function initializeNodeGraphRenderedPlayer() {
  const els = nodeGraphRenderedPlayerElements();
  if (!els.audio || !els.root || els.root.dataset.bound === "true") {
    return;
  }
  els.root.dataset.bound = "true";
  els.play?.addEventListener("click", () => {
    if (els.audio.paused || els.audio.ended) {
      els.audio.play()?.catch?.(() => {});
    } else {
      els.audio.pause();
    }
  });
  // Playback level for the rendered sample only -- this is the hidden <audio>
  // element's own volume, entirely separate from the live engine's master
  // (nodeLiveOutputVolume), so muting a render never silences the patch.
  if (typeof bindNodeGraphVolumeSlider === "function") {
    bindNodeGraphVolumeSlider(
      "nodeRenderedPlayerVolume",
      "nodeRenderedPlayerVolumeValue",
      (value) => {
        els.audio.volume = value;
      },
      Number.isFinite(els.audio.volume) ? els.audio.volume : 1,
    );
  }
  let seeking = false;
  els.wave?.addEventListener("pointerdown", (event) => {
    if (event.button > 0) return;
    event.preventDefault();
    seeking = true;
    try { els.wave.setPointerCapture(event.pointerId); } catch (_) {}
    nodeGraphRenderedPlayerSeekFromEvent(event);
  });
  els.wave?.addEventListener("pointermove", (event) => {
    if (seeking) nodeGraphRenderedPlayerSeekFromEvent(event);
  });
  const endSeek = () => { seeking = false; };
  els.wave?.addEventListener("pointerup", endSeek);
  els.wave?.addEventListener("lostpointercapture", endSeek);
  for (const type of ["play", "pause", "ended", "timeupdate", "durationchange", "emptied", "loadedmetadata"]) {
    els.audio.addEventListener(type, updateNodeGraphRenderedPlayerUi);
  }
  // Smooth playhead between sparse timeupdate events.
  const tick = () => {
    if (!els.audio.paused && !els.audio.ended) {
      updateNodeGraphRenderedPlayerUi();
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  if (typeof ResizeObserver === "function") {
    new ResizeObserver(() => drawNodeGraphRenderedPlayerWave()).observe(els.wave);
  }
  syncNodeGraphRenderedPlayerWave();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeNodeGraphRenderedPlayer);
} else {
  initializeNodeGraphRenderedPlayer();
}
