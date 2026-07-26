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
  const s = Math.max(0, Number(seconds) || 0);
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${String(r).padStart(2, "0")}`;
}

// Mono min/max column pairs over the rendered sample -- same reduction the
// Music Player's phosphor waveform performs, sized to the seek surface.
function nodeGraphRenderedPlayerWaveColumns(width) {
  const rendered = nodeGraphMvp.rendered;
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
      ctx.moveTo(px, mid - Math.max(-1, Math.min(1, max)) * amp);
      ctx.lineTo(px, mid - Math.max(-1, Math.min(1, min)) * amp + 1);
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

function updateNodeGraphRenderedPlayerUi() {
  const els = nodeGraphRenderedPlayerElements();
  if (!els.audio || !els.root) {
    return;
  }
  const duration = Number.isFinite(els.audio.duration) ? els.audio.duration : 0;
  const current = Math.min(duration || 0, Number(els.audio.currentTime) || 0);
  if (els.time) {
    els.time.textContent = `${nodeGraphRenderedPlayerFormatTime(current)} / ${nodeGraphRenderedPlayerFormatTime(duration)}`;
  }
  if (els.playhead) {
    const progress = duration > 0 ? current / duration : 0;
    els.playhead.style.left = `${(progress * 100).toFixed(3)}%`;
  }
  const playing = !els.audio.paused && !els.audio.ended;
  if (els.play) {
    els.play.textContent = playing ? "❚❚" : "▶";
    els.play.setAttribute("aria-label", playing ? "Pause rendered sample" : "Play rendered sample");
    els.play.setAttribute("aria-pressed", playing ? "true" : "false");
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
