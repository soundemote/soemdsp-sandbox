// Music Player playlist face — "pl" button swaps waveform ↔ playlist page.
// Tracks load into sampleBuffers (RAM); list UI + phase scrubber + RAM debug.

function nodeGraphAudioPlayerPlaylistNormalize(raw = null) {
  const source = raw && typeof raw === "object" ? raw : {};
  const items = Array.isArray(source.items)
    ? source.items
      .map((item, index) => {
        if (!item || typeof item !== "object") {
          return null;
        }
        const sampleId = String(item.sampleId || item.id || "").trim();
        if (!sampleId) {
          return null;
        }
        return {
          id: String(item.id || `pl-${index}-${sampleId}`).slice(0, 80),
          name: String(item.name || sampleId).trim().slice(0, 160) || sampleId,
          sampleId: normalizeNodeGraphSampleId
            ? normalizeNodeGraphSampleId(sampleId)
            : sampleId,
          bytes: Math.max(0, Math.round(Number(item.bytes) || 0)),
          frames: Math.max(0, Math.round(Number(item.frames) || 0)),
          sampleRate: Math.max(0, Math.round(Number(item.sampleRate) || 0)),
          channels: Math.max(0, Math.round(Number(item.channels) || 0)),
        };
      })
      .filter(Boolean)
    : [];
  const index = Math.max(0, Math.min(items.length ? items.length - 1 : 0, Math.round(Number(source.index) || 0)));
  const face = String(source.face || "wave").toLowerCase() === "pl" ? "pl" : "wave";
  const ramOpen = source.ramOpen === true || source.ramOpen === "true" || source.ramOpen === 1;
  return { face, index, items, ramOpen };
}

function nodeGraphAudioPlayerPlaylistForNode(nodeId) {
  const node = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
  if (!node || node.type !== "audioPlayer") {
    return nodeGraphAudioPlayerPlaylistNormalize(null);
  }
  const normalized = nodeGraphAudioPlayerPlaylistNormalize(node.playlist);
  node.playlist = normalized;
  return normalized;
}

function nodeGraphAudioPlayerPlaylistEstimateBytes(sampleId) {
  const id = normalizeNodeGraphSampleId
    ? normalizeNodeGraphSampleId(sampleId)
    : String(sampleId || "").trim();
  const buf = id ? nodeGraphMvp?.sampleBuffers?.get?.(id) : null;
  if (!buf) {
    return { bytes: 0, frames: 0, sampleRate: 0, channels: 0, loaded: false };
  }
  const channelData = buf.channelData || [];
  let frames = Math.max(0, Math.round(Number(buf.frames) || 0));
  let channels = Math.max(0, Math.round(Number(buf.channels) || channelData.length || 0));
  if (!frames && channelData[0]?.length) {
    frames = channelData[0].length;
  }
  if (!channels && buf.samples?.length) {
    channels = 1;
    frames = frames || buf.samples.length;
  }
  if (!channels) {
    channels = channelData.length || 1;
  }
  // Float32 samples in RAM (decoded).
  let samples = 0;
  if (channelData.length) {
    for (const ch of channelData) {
      samples += ch?.length || 0;
    }
  } else {
    samples = frames * channels;
  }
  return {
    bytes: samples * 4,
    frames,
    sampleRate: Math.max(0, Math.round(Number(buf.sampleRate) || 0)),
    channels,
    loaded: true,
  };
}

function nodeGraphAudioPlayerPlaylistFormatBytes(bytes) {
  const n = Math.max(0, Number(bytes) || 0);
  if (n < 1024) {
    return `${n} B`;
  }
  if (n < 1024 * 1024) {
    return `${(n / 1024).toFixed(1)} KB`;
  }
  if (n < 1024 * 1024 * 1024) {
    return `${(n / (1024 * 1024)).toFixed(2)} MB`;
  }
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function nodeGraphAudioPlayerPlaylistDebugVisible() {
  return nodeGraphMvp?.keyboardDebugInfoVisible === true;
}

function nodeGraphAudioPlayerPlaylistRamSummary(nodeId) {
  const pl = nodeGraphAudioPlayerPlaylistForNode(nodeId);
  let bytes = 0;
  let frames = 0;
  let loaded = 0;
  for (const item of pl.items) {
    const est = nodeGraphAudioPlayerPlaylistEstimateBytes(item.sampleId);
    bytes += est.bytes || item.bytes || 0;
    frames += est.frames || item.frames || 0;
    if (est.loaded) {
      loaded += 1;
    }
  }
  return {
    bytes,
    frames,
    tracks: pl.items.length,
    loaded,
    label: `${pl.items.length} track${pl.items.length === 1 ? "" : "s"}`,
    hog: bytes >= 64 * 1024 * 1024,
  };
}

function nodeGraphAudioPlayerPlaylistPersist(nodeId, { status = true } = {}) {
  const node = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
  if (!node || node.type !== "audioPlayer") {
    return;
  }
  node.playlist = nodeGraphAudioPlayerPlaylistNormalize(node.playlist);
  if (status && typeof setNodeGraphSampleStatus === "function") {
    const ram = nodeGraphAudioPlayerPlaylistRamSummary(nodeId);
    setNodeGraphSampleStatus(nodeId, `playlist ${ram.tracks} · ${ram.label}`);
  }
  if (typeof saveNodeGraphWorkingPatchToUserSettings === "function") {
    saveNodeGraphWorkingPatchToUserSettings();
  } else if (typeof markNodeGraphRenderPending === "function") {
    markNodeGraphRenderPending();
  }
}

/** Append a loaded sample to the playlist (dedupe by sampleId). */
function nodeGraphAudioPlayerPlaylistAppendSample(nodeId, sampleRef = {}) {
  const node = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
  if (!node || node.type !== "audioPlayer") {
    return null;
  }
  const sampleId = normalizeNodeGraphSampleId
    ? normalizeNodeGraphSampleId(sampleRef.id || sampleRef.sampleId)
    : String(sampleRef.id || sampleRef.sampleId || "").trim();
  if (!sampleId) {
    return null;
  }
  const pl = nodeGraphAudioPlayerPlaylistForNode(nodeId);
  const existing = pl.items.findIndex((item) => item.sampleId === sampleId);
  const est = nodeGraphAudioPlayerPlaylistEstimateBytes(sampleId);
  const entry = {
    id: existing >= 0 ? pl.items[existing].id : `pl-${Date.now().toString(36)}-${sampleId.slice(-8)}`,
    name: String(sampleRef.name || sampleRef.sourceName || sampleId).trim().slice(0, 160) || sampleId,
    sampleId,
    bytes: est.bytes,
    frames: est.frames,
    sampleRate: est.sampleRate,
    channels: est.channels,
  };
  if (existing >= 0) {
    pl.items[existing] = entry;
    pl.index = existing;
  } else {
    pl.items.push(entry);
    pl.index = pl.items.length - 1;
  }
  node.playlist = pl;
  nodeGraphAudioPlayerPlaylistPersist(nodeId, { status: false });
  nodeGraphAudioPlayerPlaylistRefreshUi(nodeId);
  return entry;
}

function nodeGraphAudioPlayerPlaylistSetFace(nodeId, face) {
  const node = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
  if (!node || node.type !== "audioPlayer") {
    return;
  }
  const pl = nodeGraphAudioPlayerPlaylistForNode(nodeId);
  pl.face = face === "pl" ? "pl" : "wave";
  node.playlist = pl;
  nodeGraphAudioPlayerPlaylistApplyFace(nodeId);
  nodeGraphAudioPlayerPlaylistPersist(nodeId, { status: false });
}

/**
 * Return to the waveform face for the sample currently loaded in the player
 * (re-syncs playlist index if the list selection had drifted).
 */
function nodeGraphAudioPlayerPlaylistGoToWave(nodeId) {
  const node = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
  if (!node || node.type !== "audioPlayer") {
    return;
  }
  const pl = nodeGraphAudioPlayerPlaylistForNode(nodeId);
  const sid = normalizeNodeGraphSampleId
    ? normalizeNodeGraphSampleId(node.sample?.id)
    : String(node.sample?.id || "").trim();
  if (sid) {
    const i = pl.items.findIndex((item) => item.sampleId === sid);
    if (i >= 0) {
      pl.index = i;
    }
  }
  pl.face = "wave";
  node.playlist = pl;
  nodeGraphAudioPlayerPlaylistApplyFace(nodeId);
  nodeGraphAudioPlayerPlaylistPersist(nodeId, { status: false });
}

function nodeGraphAudioPlayerPlaylistSeatWaveform(section, face) {
  const canvas = section?.querySelector?.(".node-phosphor-waveform-canvas");
  const wavePage = section?.querySelector?.("[data-music-player-page='wave']");
  const dock = section?.querySelector?.("[data-music-player-now]");
  if (!canvas) {
    return;
  }
  if (face === "pl" && dock && canvas.parentElement !== dock) {
    dock.append(canvas);
  } else if (face !== "pl" && wavePage && canvas.parentElement !== wavePage) {
    wavePage.append(canvas);
  }
}

function nodeGraphAudioPlayerPlaylistEnsureLayout(section, nodeId) {
  if (!section) {
    return;
  }
  for (const back of section.querySelectorAll("[data-music-player-back]")) {
    back.remove();
  }
  const plPage = section.querySelector("[data-music-player-page='pl']");
  if (!plPage) {
    return;
  }
  let dock = section.querySelector("[data-music-player-now]");
  if (!dock) {
    dock = document.createElement("div");
    dock.className = "node-music-player-pl-now";
    dock.dataset.musicPlayerNow = "true";
    dock.title = "Back to currently playing waveform";
    dock.setAttribute("role", "button");
    dock.setAttribute("aria-label", "Back to currently playing waveform");
    dock.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      nodeGraphAudioPlayerPlaylistGoToWave(nodeId);
    });
    dock.addEventListener("pointerdown", (event) => event.stopPropagation());
    const list = plPage.querySelector("[data-music-player-list]");
    if (list) {
      list.after(dock);
    } else {
      plPage.append(dock);
    }
  }
}

function nodeGraphAudioPlayerPlaylistApplyFace(nodeId) {
  const section = document.querySelector(
    `.node-phosphor-waveform-display[data-node="${CSS.escape(String(nodeId || ""))}"]`,
  );
  if (!section) {
    return;
  }
  nodeGraphAudioPlayerPlaylistEnsureLayout(section, nodeId);
  const pl = nodeGraphAudioPlayerPlaylistForNode(nodeId);
  const isPl = pl.face === "pl";
  section.dataset.musicPlayerFace = isPl ? "pl" : "wave";
  nodeGraphAudioPlayerPlaylistSeatWaveform(section, isPl ? "pl" : "wave");
  const wavePage = section.querySelector("[data-music-player-page='wave']");
  const plPage = section.querySelector("[data-music-player-page='pl']");
  if (wavePage) {
    wavePage.hidden = isPl;
  }
  if (plPage) {
    plPage.hidden = !isPl;
  }
  for (const btn of section.querySelectorAll("[data-music-player-face]")) {
    const on = btn.dataset.musicPlayerFace === (isPl ? "pl" : "wave");
    btn.classList.toggle("is-active", on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  }
  const ramBtn = section.querySelector("[data-music-player-ram]");
  if (ramBtn) {
    ramBtn.setAttribute("aria-pressed", pl.ramOpen ? "true" : "false");
  }
  if (isPl) {
    nodeGraphAudioPlayerPlaylistRefreshUi(nodeId);
    nodeGraphAudioPlayerPlaylistStartScrubLoop(nodeId);
    window.requestAnimationFrame(() => {
      nodeGraphAudioPlayerPlaylistPaintWaves(nodeId);
    });
  } else {
    nodeGraphAudioPlayerPlaylistStopScrubLoop(nodeId);
  }
  if (typeof scheduleNodeGraphPhosphorWaveformFrame === "function") {
    scheduleNodeGraphPhosphorWaveformFrame(section);
  }
}

/** Write phaseOffset (and optional absolute seek) through the same live param path as knobs. */
function nodeGraphAudioPlayerPlaylistWritePhaseOffset(nodeId, phaseOffset, { record = false } = {}) {
  const node = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
  if (!node || node.type !== "audioPlayer") {
    return;
  }
  let next = Number(phaseOffset);
  if (!Number.isFinite(next)) {
    next = 0;
  }
  // Wrap to −1…+1 like the Phase Offset param.
  if (typeof wrapNodeSliderValue === "function") {
    next = wrapNodeSliderValue(next, -1, 1);
  } else {
    next = ((((next + 1) % 2) + 2) % 2) - 1;
  }
  node.params = { ...(node.params || {}), phaseOffset: String(next) };
  const moduleEl = document.querySelector(`.dsp-node[data-node="${CSS.escape(String(nodeId))}"]`);
  const slider = moduleEl?.querySelector?.('input[data-param="phaseOffset"]');
  if (slider) {
    slider.value = String(next);
    if (typeof syncNodeSliderReadout === "function") {
      syncNodeSliderReadout(slider);
    }
  }
  if (typeof scheduleNodeGraphLiveParameterSync === "function") {
    scheduleNodeGraphLiveParameterSync();
  }
  if (record && typeof saveNodeGraphWorkingPatchToUserSettings === "function") {
    saveNodeGraphWorkingPatchToUserSettings();
  }
}

/**
 * Absolute hard seek (track change / commit): fold position into free-running
 * samplePhase, zero phaseOffset, bump samplePhaseSeek for worklet apply.
 */
function nodeGraphAudioPlayerPlaylistSeekAbsolute(nodeId, phase01, { record = false } = {}) {
  const node = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
  if (!node || node.type !== "audioPlayer") {
    return;
  }
  const phase = Math.max(0, Math.min(1, Number(phase01) || 0));
  node.samplePhase = phase;
  node.samplePhaseSeek = (Math.round(Number(node.samplePhaseSeek) || 0) + 1) || 1;
  node.params = { ...(node.params || {}), phaseOffset: "0" };
  if (typeof rememberNodeGraphAudioPlayerSamplePhase === "function") {
    rememberNodeGraphAudioPlayerSamplePhase(nodeId, phase);
  }
  const moduleEl = document.querySelector(`.dsp-node[data-node="${CSS.escape(String(nodeId))}"]`);
  const phaseOffset = moduleEl?.querySelector?.('input[data-param="phaseOffset"]');
  if (phaseOffset) {
    phaseOffset.value = "0";
    if (typeof syncNodeSliderReadout === "function") {
      syncNodeSliderReadout(phaseOffset);
    }
  }
  if (typeof scheduleNodeGraphLiveParameterSync === "function") {
    scheduleNodeGraphLiveParameterSync();
  }
  if (record && typeof saveNodeGraphWorkingPatchToUserSettings === "function") {
    saveNodeGraphWorkingPatchToUserSettings();
  }
}

/**
 * Playlist time scrubber → Phase Offset parameter (same live path as the knob).
 * Computes the relative offset that places the playhead at desired 0…1, so the
 * scrub runs through the real param system (modulation / automation friendly).
 * Value readout uses engine Phase (actual position), like Knob face Bias.
 */
function nodeGraphAudioPlayerPlaylistApplyScrub(nodeId, raw, { record = false, commit = false } = {}) {
  const node = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
  if (!node || node.type !== "audioPlayer") {
    return;
  }
  const desired = Math.max(0, Math.min(1, Number(raw) || 0));
  if (commit) {
    // On release: fold into free-running phase so Phase Offset stays clean.
    nodeGraphAudioPlayerPlaylistSeekAbsolute(nodeId, desired, { record });
    return;
  }
  const actual = typeof nodeGraphSamplePhaseForNode === "function"
    ? nodeGraphSamplePhaseForNode(nodeId)
    : Number(node.samplePhase) || 0;
  const currentOffset = Number(node.params?.phaseOffset) || 0;
  const offset01 = ((currentOffset % 1) + 1) % 1;
  const base = ((actual - offset01) % 1 + 1) % 1;
  let newOffset = desired - base;
  // Prefer shortest wrap in −1…+1.
  if (newOffset > 0.5) {
    newOffset -= 1;
  } else if (newOffset <= -0.5) {
    newOffset += 1;
  }
  nodeGraphAudioPlayerPlaylistWritePhaseOffset(nodeId, newOffset, { record: false });
  // Remember intended absolute position for refresh / display.
  if (typeof rememberNodeGraphAudioPlayerSamplePhase === "function") {
    rememberNodeGraphAudioPlayerSamplePhase(nodeId, desired);
  }
}

function nodeGraphAudioPlayerPlaylistPlayIndex(nodeId, index, { autoplay = true } = {}) {
  const node = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
  if (!node || node.type !== "audioPlayer") {
    return;
  }
  const pl = nodeGraphAudioPlayerPlaylistForNode(nodeId);
  if (!pl.items.length) {
    return;
  }
  const nextIndex = Math.max(0, Math.min(pl.items.length - 1, Math.round(Number(index) || 0)));
  const item = pl.items[nextIndex];
  if (!item) {
    return;
  }
  pl.index = nextIndex;
  node.playlist = pl;

  // Bind module sample to playlist entry.
  const ref = (typeof normalizeNodeGraphPatchSamples === "function"
    ? normalizeNodeGraphPatchSamples(nodeGraphMvp.patch?.samples || [])
    : [])
    .find((sample) => sample.id === item.sampleId);
  node.sample = ref
    ? { id: ref.id, name: ref.name || item.name }
    : { id: item.sampleId, name: item.name };
  node.samplePhase = 0;
  node.samplePhaseSeek = (Math.round(Number(node.samplePhaseSeek) || 0) + 1) || 1;
  if (!node.params || typeof node.params !== "object") {
    node.params = {};
  }
  // Play mode: 4 = Play (once) so auto-advance can fire; user can switch to Loop.
  if (autoplay) {
    node.params.transport = "4";
  }
  node.params.phaseOffset = "0";

  // Mirror transport slider if present.
  const moduleEl = document.querySelector(`.dsp-node[data-node="${CSS.escape(String(nodeId))}"]`);
  const transport = moduleEl?.querySelector?.('input[data-param="transport"]');
  if (transport && autoplay) {
    transport.value = "4";
    if (typeof syncNodeSliderReadout === "function") {
      syncNodeSliderReadout(transport);
    }
  }
  const phaseOffset = moduleEl?.querySelector?.('input[data-param="phaseOffset"]');
  if (phaseOffset) {
    phaseOffset.value = "0";
    if (typeof syncNodeSliderReadout === "function") {
      syncNodeSliderReadout(phaseOffset);
    }
  }

  // Sample swap needs plan rebuild; phase seek rides on the same payload.
  if (typeof scheduleNodeGraphLivePlanSync === "function") {
    scheduleNodeGraphLivePlanSync();
  } else if (typeof scheduleNodeGraphLiveParameterSync === "function") {
    scheduleNodeGraphLiveParameterSync();
  }
  if (typeof setNodeGraphSampleStatus === "function") {
    setNodeGraphSampleStatus(nodeId, `playing ${item.name}`);
  }
  if (typeof syncNodeGraphSampleDisplayForNode === "function") {
    syncNodeGraphSampleDisplayForNode(nodeId);
  }
  nodeGraphAudioPlayerPlaylistAdvanceArmed.set(nodeId, true);
  nodeGraphAudioPlayerPlaylistRefreshUi(nodeId);
  nodeGraphAudioPlayerPlaylistPersist(nodeId, { status: false });
}

function nodeGraphAudioPlayerPlaylistPlayNext(nodeId) {
  const pl = nodeGraphAudioPlayerPlaylistForNode(nodeId);
  if (!pl.items.length) {
    return;
  }
  const node = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
  const sid = typeof normalizeNodeGraphSampleId === "function"
    ? normalizeNodeGraphSampleId(node?.sample?.id)
    : String(node?.sample?.id || "").trim();
  const playing = sid
    ? pl.items.findIndex((item) => item.sampleId === sid)
    : pl.index;
  const from = playing >= 0 ? playing : pl.index;
  const next = from + 1;
  if (next >= pl.items.length) {
    // End of list: stop (transport Stop).
    const node = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
    if (node) {
      node.params = { ...(node.params || {}), transport: "1" };
      if (typeof scheduleNodeGraphLiveParameterSync === "function") {
        scheduleNodeGraphLiveParameterSync();
      }
      if (typeof setNodeGraphSampleStatus === "function") {
        setNodeGraphSampleStatus(nodeId, "playlist finished");
      }
    }
    return;
  }
  nodeGraphAudioPlayerPlaylistPlayIndex(nodeId, next, { autoplay: true });
}

// Debounce auto-advance so a held "complete" reason does not skip tracks.
const nodeGraphAudioPlayerPlaylistAdvanceArmed = new Map();
const nodeGraphAudioPlayerPlaylistScrubLoops = new Map();

function nodeGraphAudioPlayerPlaylistOnRuntimeStatus(nodeId, reason = "") {
  const node = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
  if (!node || node.type !== "audioPlayer") {
    return;
  }
  const pl = nodeGraphAudioPlayerPlaylistForNode(nodeId);
  if (pl.items.length < 2) {
    nodeGraphAudioPlayerPlaylistSyncScrubber(nodeId);
    return;
  }
  const text = String(reason || "").toLowerCase();
  const completed = text.includes("complete") || text.includes("finished");
  if (!completed) {
    nodeGraphAudioPlayerPlaylistAdvanceArmed.set(nodeId, true);
    nodeGraphAudioPlayerPlaylistSyncScrubber(nodeId);
    return;
  }
  if (!nodeGraphAudioPlayerPlaylistAdvanceArmed.get(nodeId)) {
    return;
  }
  // Only auto-advance when transport is Play (once)=4, not Loop=3.
  const transport = Math.round(Number(node.params?.transport) || 0);
  if (transport !== 4) {
    return;
  }
  nodeGraphAudioPlayerPlaylistAdvanceArmed.set(nodeId, false);
  window.setTimeout(() => {
    nodeGraphAudioPlayerPlaylistPlayNext(nodeId);
  }, 40);
}

function nodeGraphAudioPlayerPlaylistSyncScrubber(nodeId) {
  const section = document.querySelector(
    `.node-phosphor-waveform-display[data-node="${CSS.escape(String(nodeId || ""))}"]`,
  );
  if (!section || section.dataset.musicPlayerFace !== "pl") {
    return;
  }
  const scrub = section.querySelector("[data-music-player-phase-scrub]");
  const valueEl = section.querySelector("[data-music-player-phase-value]");
  if (!scrub && !valueEl) {
    return;
  }
  // Live engine phase (actual position after param smoothing / transport).
  // Same idea as Knob face showing scope Bias instead of the raw slider.
  const live = typeof nodeGraphSamplePhaseForNode === "function"
    ? nodeGraphSamplePhaseForNode(nodeId)
    : 0;
  if (scrub && document.activeElement !== scrub && scrub.dataset.scrubbing !== "1") {
    scrub.value = String(live);
  }
  if (valueEl) {
    valueEl.textContent = live.toFixed(4);
  }
  const ramEl = section.querySelector("[data-music-player-ram]");
  if (ramEl) {
    const debugOn = nodeGraphAudioPlayerPlaylistDebugVisible();
    ramEl.hidden = !debugOn;
    if (debugOn) {
      ramEl.textContent = "debug";
      ramEl.classList.toggle("is-hog", nodeGraphAudioPlayerPlaylistRamSummary(nodeId).hog);
    }
  }
  if (typeof nodeGraphAudioPlayerPlaylistPaintWaves === "function") {
    nodeGraphAudioPlayerPlaylistPaintWaves(nodeId, { liveOnly: true });
  }
}

function nodeGraphAudioPlayerPlaylistStartScrubLoop(nodeId) {
  const id = String(nodeId || "");
  if (!id || nodeGraphAudioPlayerPlaylistScrubLoops.has(id)) {
    return;
  }
  const tick = () => {
    const section = document.querySelector(
      `.node-phosphor-waveform-display[data-node="${CSS.escape(id)}"]`,
    );
    if (!section || section.dataset.musicPlayerFace !== "pl") {
      nodeGraphAudioPlayerPlaylistScrubLoops.delete(id);
      return;
    }
    nodeGraphAudioPlayerPlaylistSyncScrubber(id);
    const handle = window.requestAnimationFrame(tick);
    nodeGraphAudioPlayerPlaylistScrubLoops.set(id, handle);
  };
  const handle = window.requestAnimationFrame(tick);
  nodeGraphAudioPlayerPlaylistScrubLoops.set(id, handle);
}

function nodeGraphAudioPlayerPlaylistStopScrubLoop(nodeId) {
  const id = String(nodeId || "");
  const handle = nodeGraphAudioPlayerPlaylistScrubLoops.get(id);
  if (handle) {
    window.cancelAnimationFrame(handle);
    nodeGraphAudioPlayerPlaylistScrubLoops.delete(id);
  }
}

const nodeGraphAudioPlayerPlaylistEnvelopeCache = new Map();
const nodeGraphAudioPlayerPlaylistEnvelopeBins = 512;
const nodeGraphAudioPlayerPlaylistEnvelopeStrideCap = 64;

function nodeGraphAudioPlayerPlaylistSamplesForId(sampleId) {
  const id = normalizeNodeGraphSampleId
    ? normalizeNodeGraphSampleId(sampleId)
    : String(sampleId || "").trim();
  if (!id) {
    return null;
  }
  const buf = nodeGraphMvp?.sampleBuffers?.get?.(id);
  if (!buf) {
    return null;
  }
  if (buf.samples?.length) {
    return buf.samples;
  }
  const channel = buf.channelData?.[0];
  return channel?.length ? channel : null;
}

function nodeGraphAudioPlayerPlaylistEnvelope(sampleId) {
  const samples = nodeGraphAudioPlayerPlaylistSamplesForId(sampleId);
  const length = samples?.length || 0;
  if (!length) {
    return null;
  }
  const cached = nodeGraphAudioPlayerPlaylistEnvelopeCache.get(sampleId);
  if (cached && cached.length === length) {
    return cached;
  }
  const bins = Math.min(nodeGraphAudioPlayerPlaylistEnvelopeBins, length);
  const mins = new Float32Array(bins);
  const maxs = new Float32Array(bins);
  for (let bin = 0; bin < bins; bin += 1) {
    const t0 = Math.floor((bin * length) / bins);
    const t1 = Math.max(t0 + 1, Math.floor(((bin + 1) * length) / bins));
    const stride = Math.max(1, Math.floor((t1 - t0) / nodeGraphAudioPlayerPlaylistEnvelopeStrideCap));
    let minV = 1;
    let maxV = -1;
    for (let frame = t0; frame < t1; frame += stride) {
      const value = samples[frame];
      if (value < minV) minV = value;
      if (value > maxV) maxV = value;
    }
    const last = samples[t1 - 1];
    if (last < minV) minV = last;
    if (last > maxV) maxV = last;
    mins[bin] = minV;
    maxs[bin] = maxV;
  }
  const envelope = { length, bins, mins, maxs };
  nodeGraphAudioPlayerPlaylistEnvelopeCache.set(sampleId, envelope);
  return envelope;
}

function nodeGraphAudioPlayerPlaylistSizeWaveCanvas(canvas) {
  if (!canvas) {
    return null;
  }
  const cssW = Math.max(1, canvas.clientWidth || 0);
  const cssH = Math.max(1, canvas.clientHeight || 0);
  const dpr = Math.max(1, Number(window.devicePixelRatio) || 1);
  const width = Math.max(1, Math.round(cssW * dpr));
  const height = Math.max(1, Math.round(cssH * dpr));
  if (canvas.width !== width) {
    canvas.width = width;
  }
  if (canvas.height !== height) {
    canvas.height = height;
  }
  const context = canvas.getContext("2d");
  if (!context) {
    return null;
  }
  context.setTransform(1, 0, 0, 1, 0, 0);
  return { context, width, height, pixelRatio: dpr };
}

function nodeGraphAudioPlayerPlaylistStrokeEnvelope(context, envelope, viewStart, viewEnd, width, midY, amplitude) {
  if (!envelope || !(width > 1)) {
    return false;
  }
  const span = Math.max(1e-9, viewEnd - viewStart);
  const startBin = Math.max(0, Math.floor((viewStart / envelope.length) * envelope.bins));
  const endBin = Math.min(envelope.bins - 1, Math.ceil((viewEnd / envelope.length) * envelope.bins));
  if (endBin < startBin) {
    return false;
  }
  context.beginPath();
  let started = false;
  for (let bin = startBin; bin <= endBin; bin += 1) {
    const frame = ((bin + 0.5) / envelope.bins) * envelope.length;
    const x = ((frame - viewStart) / span) * width;
    const yMax = midY - envelope.maxs[bin] * amplitude;
    if (!started) {
      context.moveTo(x, yMax);
      started = true;
    } else {
      context.lineTo(x, yMax);
    }
  }
  for (let bin = endBin; bin >= startBin; bin -= 1) {
    const frame = ((bin + 0.5) / envelope.bins) * envelope.length;
    const x = ((frame - viewStart) / span) * width;
    context.lineTo(x, midY - envelope.mins[bin] * amplitude);
  }
  context.closePath();
  return started;
}

function nodeGraphAudioPlayerPlaylistPaintWaveCanvas(canvas, {
  sampleId,
  live = false,
  viewStart = 0,
  viewEnd = 0,
  playheadFrame = null,
  settings = null,
} = {}) {
  const sized = nodeGraphAudioPlayerPlaylistSizeWaveCanvas(canvas);
  if (!sized) {
    return;
  }
  const { context, width, height, pixelRatio } = sized;
  context.fillStyle = live ? "hsl(140, 18%, 5%)" : "#050805";
  context.fillRect(0, 0, width, height);
  const samples = nodeGraphAudioPlayerPlaylistSamplesForId(sampleId);
  const total = samples?.length || 0;
  if (!total) {
    return;
  }
  const start = live ? Number(viewStart) || 0 : 0;
  const end = live && viewEnd > viewStart ? viewEnd : total;
  const midY = height * 0.5;
  const amplitude = midY * 0.9;
  const look = settings;
  const stroke = typeof nodeGraphPhosphorWaveformLineColor === "function" && look
    ? nodeGraphPhosphorWaveformLineColor(look, 82, 0.92)
    : "rgba(120, 220, 180, 0.9)";
  const fill = typeof nodeGraphPhosphorWaveformLineColor === "function" && look
    ? nodeGraphPhosphorWaveformLineColor(look, 75, 0.28)
    : "rgba(80, 180, 140, 0.28)";
  let drew = false;
  if (
    live
    && typeof nodeGraphPhosphorWaveformBuildVectorPath === "function"
    && typeof nodeGraphPhosphorWaveformStrokeVectorPath === "function"
  ) {
    const points = nodeGraphPhosphorWaveformBuildVectorPath(
      samples,
      start,
      end,
      width,
      midY,
      amplitude,
    );
    if (nodeGraphPhosphorWaveformStrokeVectorPath(context, points)) {
      context.strokeStyle = stroke;
      context.lineWidth = Math.max(1, pixelRatio);
      context.lineJoin = "miter";
      context.stroke();
      drew = true;
    }
  }
  if (!drew) {
    const envelope = nodeGraphAudioPlayerPlaylistEnvelope(sampleId);
    if (nodeGraphAudioPlayerPlaylistStrokeEnvelope(context, envelope, start, end, width, midY, amplitude)) {
      context.fillStyle = fill;
      context.fill();
      context.strokeStyle = stroke;
      context.lineWidth = Math.max(1, pixelRatio);
      context.stroke();
    }
  }
  if (live && Number.isFinite(playheadFrame) && playheadFrame >= start && playheadFrame <= end) {
    const x = ((playheadFrame - start) / Math.max(1e-9, end - start)) * width;
    context.strokeStyle = "rgba(255, 255, 255, 0.88)";
    context.lineWidth = Math.max(1, pixelRatio);
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, height);
    context.stroke();
  }
}

function nodeGraphAudioPlayerPlaylistPaintWaves(nodeId, { liveOnly = false } = {}) {
  const section = document.querySelector(
    `.node-phosphor-waveform-display[data-node="${CSS.escape(String(nodeId || ""))}"]`,
  );
  if (!section || section.dataset.musicPlayerFace !== "pl") {
    return;
  }
  const node = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
  const playingId = normalizeNodeGraphSampleId
    ? normalizeNodeGraphSampleId(node?.sample?.id)
    : String(node?.sample?.id || "").trim();
  const settings = typeof nodeGraphPhosphorWaveformSettingsForNode === "function"
    ? nodeGraphPhosphorWaveformSettingsForNode(nodeId)
    : null;
  const playingEntry = typeof nodeGraphPhosphorWaveformSampleEntry === "function"
    ? nodeGraphPhosphorWaveformSampleEntry(nodeId)
    : null;
  const view = playingEntry && typeof nodeGraphPhosphorWaveformViewState === "function"
    ? nodeGraphPhosphorWaveformViewState(nodeId, playingEntry.frames)
    : null;
  const phase = typeof nodeGraphSamplePhaseForNode === "function"
    ? nodeGraphSamplePhaseForNode(nodeId)
    : 0;
  const playheadFrame = playingEntry ? phase * playingEntry.frames : 0;
  if (view && playingEntry && settings && typeof nodeGraphPhosphorWaveformContinuousView === "function") {
    const frames = Math.max(1, playingEntry.frames || 1);
    const rate = Math.max(1, Number(playingEntry.sampleRate) || 44100);
    const windowFrames = settings.timeWindowSeconds <= 0
      ? 1
      : Math.max(1, Math.min(frames, Math.round(settings.timeWindowSeconds * rate)));
    const ratio = typeof nodeGraphPhosphorWaveformScrollLineRatio === "function"
      ? nodeGraphPhosphorWaveformScrollLineRatio(settings)
      : 0.5;
    const next = nodeGraphPhosphorWaveformContinuousView(
      playheadFrame - windowFrames * ratio,
      windowFrames,
      frames,
    );
    view.startFrame = next.viewStart;
    view.endFrame = next.viewEnd;
  }
  for (const row of section.querySelectorAll(".node-music-player-pl-row")) {
    const canvas = row.querySelector(".node-music-player-pl-wave");
    if (!canvas) {
      continue;
    }
    const sampleId = row.dataset.sampleId || "";
    const live = Boolean(playingId && sampleId && sampleId === playingId);
    row.dataset.playing = live ? "true" : "false";
    if (liveOnly && !live) {
      continue;
    }
    nodeGraphAudioPlayerPlaylistPaintWaveCanvas(canvas, {
      sampleId,
      live,
      viewStart: live ? view?.startFrame : 0,
      viewEnd: live ? view?.endFrame : 0,
      playheadFrame: live ? playheadFrame : null,
      settings,
    });
  }
}

function nodeGraphAudioPlayerPlaylistRefreshUi(nodeId) {
  const section = document.querySelector(
    `.node-phosphor-waveform-display[data-node="${CSS.escape(String(nodeId || ""))}"]`,
  );
  if (!section) {
    return;
  }
  const pl = nodeGraphAudioPlayerPlaylistForNode(nodeId);
  const list = section.querySelector("[data-music-player-list]");
  if (list) {
    const signature = pl.items.map((item) => item.sampleId).join("|");
    const reuse = list.dataset.itemSignature === signature
      && list.querySelectorAll(".node-music-player-pl-row").length === pl.items.length;
    if (!reuse) {
      list.dataset.itemSignature = signature;
      list.replaceChildren();
      if (!pl.items.length) {
        const empty = document.createElement("div");
        empty.className = "node-music-player-pl-empty";
        empty.textContent = "Load files (📂 multi-select) to build a playlist.";
        list.append(empty);
      } else {
        pl.items.forEach((item, index) => {
          const row = document.createElement("button");
          row.type = "button";
          row.className = "node-music-player-pl-row";
          row.dataset.playlistIndex = String(index);
          row.dataset.sampleId = item.sampleId;
          row.dataset.active = index === (Number.isInteger(pl.selectedIndex) ? pl.selectedIndex : pl.index) ? "true" : "false";
          row.title = "Double-click to play";
          const num = document.createElement("span");
          num.className = "node-music-player-pl-num";
          num.textContent = String(index + 1).padStart(2, "0");
          const name = document.createElement("span");
          name.className = "node-music-player-pl-name";
          name.textContent = item.name;
          const wave = document.createElement("canvas");
          wave.className = "node-music-player-pl-wave";
          wave.setAttribute("aria-hidden", "true");
          row.append(num, name, wave);
          row.addEventListener("dblclick", (event) => {
            event.preventDefault();
            event.stopPropagation();
            const node = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
            const cur = nodeGraphAudioPlayerPlaylistForNode(nodeId);
            const sid = normalizeNodeGraphSampleId
              ? normalizeNodeGraphSampleId(node?.sample?.id)
              : String(node?.sample?.id || "").trim();
            if (item.sampleId && sid && item.sampleId === sid) {
              nodeGraphAudioPlayerPlaylistGoToWave(nodeId);
              return;
            }
            if (index === cur.index && sid && item.sampleId === sid) {
              nodeGraphAudioPlayerPlaylistGoToWave(nodeId);
              return;
            }
            nodeGraphAudioPlayerPlaylistPlayIndex(nodeId, index, { autoplay: true });
          });
          row.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            const node = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
            if (!node) {
              return;
            }
            const cur = nodeGraphAudioPlayerPlaylistForNode(nodeId);
            cur.selectedIndex = index;
            node.playlist = cur;
            const listEl = section.querySelector("[data-music-player-list]");
            if (listEl) {
              listEl.querySelectorAll(".node-music-player-pl-row").forEach((el) => {
                el.dataset.active = el.dataset.playlistIndex === String(index) ? "true" : "false";
              });
            }
          });
          row.addEventListener("pointerdown", (event) => {
            event.stopPropagation();
          });
          list.append(row);
        });
      }
    } else {
      const selected = Number.isInteger(pl.selectedIndex) ? pl.selectedIndex : pl.index;
      list.querySelectorAll(".node-music-player-pl-row").forEach((row) => {
        const index = Number(row.dataset.playlistIndex);
        row.dataset.active = index === selected ? "true" : "false";
        const item = pl.items[index];
        const name = row.querySelector(".node-music-player-pl-name");
        if (name && item) {
          name.textContent = item.name;
        }
      });
    }
  }
  nodeGraphAudioPlayerPlaylistRefreshRamDebug(nodeId);
  nodeGraphAudioPlayerPlaylistSyncScrubber(nodeId);
  nodeGraphAudioPlayerPlaylistPaintWaves(nodeId);
  window.requestAnimationFrame(() => {
    nodeGraphAudioPlayerPlaylistPaintWaves(nodeId);
  });
}

function nodeGraphAudioPlayerPlaylistRefreshRamDebug(nodeId) {
  const section = document.querySelector(
    `.node-phosphor-waveform-display[data-node="${CSS.escape(String(nodeId || ""))}"]`,
  );
  if (!section) {
    return;
  }
  const pl = nodeGraphAudioPlayerPlaylistForNode(nodeId);
  const ram = nodeGraphAudioPlayerPlaylistRamSummary(nodeId);
  const ramEl = section.querySelector("[data-music-player-ram]");
  if (ramEl) {
    const debugOn = nodeGraphAudioPlayerPlaylistDebugVisible();
    ramEl.hidden = !debugOn;
    ramEl.textContent = "debug";
    ramEl.classList.toggle("is-hog", ram.hog);
    ramEl.setAttribute("aria-pressed", pl.ramOpen ? "true" : "false");
    if (!debugOn) {
      pl.ramOpen = false;
    }
    ramEl.title = pl.ramOpen
      ? `RAM debug open — click again to close (${ram.label})`
      : ram.hog
        ? `RAM hog warning: ${ram.label} decoded Float32 in sampleBuffers — click for debug`
        : "Decoded sample RAM (Float32) — click to toggle debug";
  }
  const panel = section.querySelector("[data-music-player-ram-panel]");
  if (!panel) {
    return;
  }
  panel.hidden = !pl.ramOpen;
  const body = panel.querySelector("[data-music-player-ram-body]");
  if (!body) {
    return;
  }
  body.replaceChildren();
  const summary = document.createElement("div");
  summary.className = "node-music-player-pl-ram-summary";
  summary.innerHTML = `<strong>${ram.label}</strong>`
    + ` · loaded ${ram.loaded}/${ram.tracks}`
    + ` · ${ram.frames.toLocaleString()} frames`
    + (ram.hog ? ` · <span class="is-hog">HOG ≥64MB</span>` : "");
  body.append(summary);

  const table = document.createElement("table");
  table.className = "node-music-player-pl-ram-table";
  table.innerHTML = "<thead><tr><th>#</th><th>Track</th><th>RAM</th><th>Frames</th><th>Ch</th><th>SR</th><th></th></tr></thead>";
  const tbody = document.createElement("tbody");
  if (!pl.items.length) {
    const tr = document.createElement("tr");
    tr.innerHTML = '<td colspan="7" class="node-music-player-pl-ram-empty">No tracks in playlist</td>';
    tbody.append(tr);
  } else {
    pl.items.forEach((item, index) => {
      const est = nodeGraphAudioPlayerPlaylistEstimateBytes(item.sampleId);
      const tr = document.createElement("tr");
      if (index === pl.index) {
        tr.dataset.active = "true";
      }
      if ((est.bytes || item.bytes || 0) >= 32 * 1024 * 1024) {
        tr.classList.add("is-heavy");
      }
      const td = (text, className) => {
        const cell = document.createElement("td");
        if (className) cell.className = className;
        cell.textContent = text;
        return cell;
      };
      tr.append(
        td(String(index + 1).padStart(2, "0")),
        (() => {
          const cell = td(String(item.name || ""), "node-music-player-pl-ram-name");
          cell.title = String(item.name || "");
          return cell;
        })(),
        td(nodeGraphAudioPlayerPlaylistFormatBytes(est.bytes || item.bytes || 0)),
        td((est.frames || item.frames || 0).toLocaleString()),
        td(String(est.channels || item.channels || "—")),
        td(String(est.sampleRate || item.sampleRate || "—")),
        td(est.loaded ? "RAM" : "—"),
      );
      tbody.append(tr);
    });
  }
  table.append(tbody);
  body.append(table);
}

function nodeGraphAudioPlayerPlaylistToggleRamDebug(nodeId) {
  const node = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
  if (!node || node.type !== "audioPlayer") {
    return;
  }
  const pl = nodeGraphAudioPlayerPlaylistForNode(nodeId);
  pl.ramOpen = !pl.ramOpen;
  node.playlist = pl;
  nodeGraphAudioPlayerPlaylistRefreshRamDebug(nodeId);
  nodeGraphAudioPlayerPlaylistPersist(nodeId, { status: false });
}

function nodeGraphAudioPlayerPlaylistBindScrubber(nodeId, scrub) {
  if (!scrub) {
    return;
  }
  const valueEl = () => scrub.closest?.("[data-music-player-page]")
    ?.querySelector?.("[data-music-player-phase-value]");

  scrub.addEventListener("pointerdown", (event) => {
    event.stopPropagation();
    scrub.dataset.scrubbing = "1";
  });
  const endScrub = () => {
    scrub.dataset.scrubbing = "0";
  };
  scrub.addEventListener("pointerup", endScrub);
  scrub.addEventListener("pointercancel", endScrub);
  scrub.addEventListener("blur", endScrub);

  scrub.addEventListener("input", () => {
    const phase = Math.max(0, Math.min(1, Number(scrub.value) || 0));
    // Live drag: drive Phase Offset param so it behaves like any other control.
    nodeGraphAudioPlayerPlaylistApplyScrub(nodeId, phase, { record: false, commit: false });
    // While dragging, show scrub target; rAF loop resumes actual engine Phase after release.
    const el = valueEl();
    if (el) {
      el.textContent = phase.toFixed(4);
    }
  });
  scrub.addEventListener("change", () => {
    const phase = Math.max(0, Math.min(1, Number(scrub.value) || 0));
    // Commit folds offset into free-running samplePhase (clean param = 0).
    nodeGraphAudioPlayerPlaylistApplyScrub(nodeId, phase, { record: true, commit: true });
    scrub.dataset.scrubbing = "0";
  });
}

/**
 * Wrap phosphor waveform section with face bar + playlist page.
 * Called once when the Music Player display is created.
 */
function nodeGraphAudioPlayerPlaylistEnhanceDisplay(section, nodeId) {
  if (!section || section.dataset.musicPlayerEnhanced === "1") {
    return section;
  }
  section.dataset.musicPlayerEnhanced = "1";
  section.dataset.musicPlayerFace = "wave";

  const canvas = section.querySelector("canvas");
  const wavePage = document.createElement("div");
  wavePage.className = "node-music-player-page node-music-player-page-wave";
  wavePage.dataset.musicPlayerPage = "wave";
  if (canvas) {
    wavePage.append(canvas);
  }

  const plPage = document.createElement("div");
  plPage.className = "node-music-player-page node-music-player-page-pl";
  plPage.dataset.musicPlayerPage = "pl";
  plPage.hidden = true;

  const plHead = document.createElement("div");
  plHead.className = "node-music-player-pl-head";
  const ram = document.createElement("button");
  ram.type = "button";
  ram.className = "node-music-player-pl-ram";
  ram.dataset.musicPlayerRam = "true";
  ram.title = "Decoded sample RAM (Float32) — click to toggle debug";
  ram.textContent = "debug";
  ram.setAttribute("aria-label", "Toggle playlist RAM debug");
  ram.setAttribute("aria-pressed", "false");
  ram.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    nodeGraphAudioPlayerPlaylistToggleRamDebug(nodeId);
  });
  ram.addEventListener("pointerdown", (event) => event.stopPropagation());
  ram.hidden = !nodeGraphAudioPlayerPlaylistDebugVisible();
  plHead.append(ram);

  // RAM debug panel (per-track decoded buffer sizes). Closed via the RAM/GB button only.
  const ramPanel = document.createElement("div");
  ramPanel.className = "node-music-player-pl-ram-panel";
  ramPanel.dataset.musicPlayerRamPanel = "true";
  ramPanel.hidden = true;
  const ramHead = document.createElement("div");
  ramHead.className = "node-music-player-pl-ram-head";
  const ramTitle = document.createElement("span");
  ramTitle.textContent = "RAM debug";
  ramHead.append(ramTitle);
  const ramBody = document.createElement("div");
  ramBody.className = "node-music-player-pl-ram-body";
  ramBody.dataset.musicPlayerRamBody = "true";
  ramPanel.append(ramHead, ramBody);

  const list = document.createElement("div");
  list.className = "node-music-player-pl-list";
  list.dataset.musicPlayerList = "true";
  list.setAttribute("role", "listbox");
  list.setAttribute("aria-label", "Playlist tracks");

  const now = document.createElement("div");
  now.className = "node-music-player-pl-now";
  now.dataset.musicPlayerNow = "true";
  now.title = "Back to currently playing waveform";
  now.setAttribute("role", "button");
  now.setAttribute("aria-label", "Back to currently playing waveform");
  now.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    nodeGraphAudioPlayerPlaylistGoToWave(nodeId);
  });
  now.addEventListener("pointerdown", (event) => event.stopPropagation());

  plPage.append(plHead, ramPanel, list, now);

  // PL lives on the waveform face (top-right) so you can open the playlist from
  // the single-track view. Hidden via CSS while playlist page is open.
  const faceBar = document.createElement("div");
  faceBar.className = "node-music-player-face-bar";
  const plBtn = document.createElement("button");
  plBtn.type = "button";
  plBtn.className = "node-music-player-face-btn";
  plBtn.dataset.musicPlayerFace = "pl";
  plBtn.textContent = "PL";
  plBtn.title = "Open playlist";
  plBtn.setAttribute("aria-label", "Open playlist");
  plBtn.setAttribute("aria-pressed", "false");
  plBtn.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    nodeGraphAudioPlayerPlaylistSetFace(nodeId, "pl");
  });
  plBtn.addEventListener("pointerdown", (event) => event.stopPropagation());
  faceBar.append(plBtn);

  section.replaceChildren(faceBar, wavePage, plPage);

  // Restore face from patch.
  const pl = nodeGraphAudioPlayerPlaylistForNode(nodeId);
  if (pl.face === "pl") {
    nodeGraphAudioPlayerPlaylistApplyFace(nodeId);
  } else {
    nodeGraphAudioPlayerPlaylistRefreshUi(nodeId);
  }

  // Ensure current sample is on the playlist once buffers exist.
  window.requestAnimationFrame(() => {
    const node = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
    const sid = node?.sample?.id;
    if (sid) {
      nodeGraphAudioPlayerPlaylistAppendSample(nodeId, {
        id: sid,
        name: node.sample?.name || nodeGraphSampleNameForNode?.(nodeId) || sid,
      });
    }
  });

  return section;
}

// Hook runtime status → auto-advance + scrubber live update.
(function nodeGraphAudioPlayerPlaylistInstallRuntimeHook() {
  if (typeof window === "undefined" || window.__nodeGraphAudioPlayerPlaylistHooked) {
    return;
  }
  window.__nodeGraphAudioPlayerPlaylistHooked = true;
  window.__nodeGraphAudioPlayerPlaylistWrapRuntime = function wrapRuntime() {
    if (typeof syncNodeGraphAudioPlayerRuntimeStatus !== "function") {
      return;
    }
    if (syncNodeGraphAudioPlayerRuntimeStatus.__playlistWrapped) {
      return;
    }
    const original = syncNodeGraphAudioPlayerRuntimeStatus;
    function wrapped(message = {}) {
      original(message);
      const nodeId = String(message.nodeId || (message.nodeIds && message.nodeIds[0]) || "");
      if (nodeId) {
        nodeGraphAudioPlayerPlaylistOnRuntimeStatus(nodeId, message.reason || "");
      }
    }
    wrapped.__playlistWrapped = true;
    // Global function reassignment
    // eslint-disable-next-line no-global-assign
    syncNodeGraphAudioPlayerRuntimeStatus = wrapped;
  };
})();

function nodeGraphAudioPlayerPlaylistMigrateOpenDisplays() {
  document.querySelectorAll(".node-phosphor-waveform-display[data-music-player-enhanced='1']").forEach((section) => {
    const nodeId = section.dataset.node;
    if (nodeId) {
      nodeGraphAudioPlayerPlaylistApplyFace(nodeId);
    }
  });
}
if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", nodeGraphAudioPlayerPlaylistMigrateOpenDisplays, { once: true });
  } else {
    window.requestAnimationFrame(nodeGraphAudioPlayerPlaylistMigrateOpenDisplays);
  }
}
