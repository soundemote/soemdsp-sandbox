// Music Player faces — dock: wave / waveplay / playlist / playinfo / XY / LR.
// waveplay is the wave page plus one playlist-row song name (opens playlist).
// playinfo is the decoded-buffer table. List UI + phase scrubber.

function nodeGraphAudioPlayerPlaylistNormalize(raw = null) {
  const source = raw && typeof raw === "object" ? raw : {};
  const items = Array.isArray(source.items)
    ? source.items
      .map((item, index) => {
        if (!item || typeof item !== "object") {
          return null;
        }
        const card = typeof nodeGraphAudioPlayerLibraryNormalizeCard === "function"
          ? nodeGraphAudioPlayerLibraryNormalizeCard(item, index)
          : null;
        if (card) {
          return card;
        }
        const sampleId = String(item.sampleId || item.id || "").trim();
        if (!sampleId) {
          return null;
        }
        return {
          id: String(item.id || `pl-${index}-${sampleId}`).slice(0, 80),
          name: String(item.name || sampleId).trim().slice(0, 160) || sampleId,
          path: String(item.path || "").trim(),
          fileKey: String(item.fileKey || "").trim(),
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
  const selectedIndex = Math.max(
    0,
    Math.min(items.length ? items.length - 1 : 0, Math.round(Number(source.selectedIndex ?? source.index) || 0)),
  );
  const face = nodeGraphAudioPlayerPlaylistNormalizeFace(source.face);
  const shuffle = source.shuffle === true || source.shuffle === "true" || source.shuffle === 1;
  let loopMode = String(source.loopMode || "").trim().toLowerCase();
  if (loopMode !== "off" && loopMode !== "one" && loopMode !== "all") {
    loopMode = "off";
  }
  const folderPath = String(source.folderPath || "").trim();
  const folderDive = source.folderDive === true || source.folderDive === "true" || source.folderDive === 1;
  const used = Array.isArray(source.used)
    ? source.used.map((path) => String(path || "").trim()).filter(Boolean).slice(0, 10000)
    : [];
  return { face, folderDive, folderPath, index, items, selectedIndex, shuffle, loopMode, used };
}

const nodeGraphAudioPlayerPlaylistFaces = Object.freeze(["wave", "waveplay", "pl", "playinfo", "vsxy", "vslr"]);

function nodeGraphAudioPlayerPlaylistNormalizeFace(value) {
  const raw = String(value || "wave").trim().toLowerCase();
  if (raw === "pl" || raw === "playlist") {
    return "pl";
  }
  if (raw === "playinfo" || raw === "play-info" || raw === "info") {
    return "playinfo";
  }
  if (raw === "wavplay" || raw === "waveplay" || raw === "wav-play" || raw === "wave-play") {
    return "waveplay";
  }
  if (raw === "vsxy" || raw === "xy") {
    return "vsxy";
  }
  if (raw === "vslr" || raw === "lr") {
    return "vslr";
  }
  return "wave";
}

function nodeGraphAudioPlayerFaceIsWave(sectionOrFace) {
  const face = typeof sectionOrFace === "string"
    ? sectionOrFace
    : (sectionOrFace?.dataset?.musicPlayerFace || "wave");
  const normalized = nodeGraphAudioPlayerPlaylistNormalizeFace(face);
  return normalized === "wave" || normalized === "waveplay";
}

function nodeGraphAudioPlayerFaceShowsPlaylist(sectionOrFace) {
  const face = typeof sectionOrFace === "string"
    ? sectionOrFace
    : (sectionOrFace?.dataset?.musicPlayerFace || "wave");
  const normalized = nodeGraphAudioPlayerPlaylistNormalizeFace(face);
  return normalized === "pl";
}

function nodeGraphAudioPlayerFaceShowsPlayinfo(sectionOrFace) {
  const face = typeof sectionOrFace === "string"
    ? sectionOrFace
    : (sectionOrFace?.dataset?.musicPlayerFace || "wave");
  return nodeGraphAudioPlayerPlaylistNormalizeFace(face) === "playinfo";
}

function nodeGraphAudioPlayerPlaylistForNode(nodeId) {
  const node = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
  if (!node || node.type !== "audioPlayer") {
    return nodeGraphAudioPlayerPlaylistNormalize(null);
  }
  const normalized = nodeGraphAudioPlayerPlaylistNormalize(node.playlist);
  node.playlist = normalized;
  if (
    typeof nodeGraphAudioPlayerLibraryCatalog === "function"
    && !nodeGraphAudioPlayerLibraryCatalog(node.id).length
    && normalized.items.length
    && !normalized.folderPath
    && typeof nodeGraphAudioPlayerLibrarySetCatalog === "function"
  ) {
    nodeGraphAudioPlayerLibrarySetCatalog(node.id, normalized.items);
  }
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

function nodeGraphAudioPlayerPlaylistPersist(nodeId) {
  const node = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
  if (!node || node.type !== "audioPlayer") {
    return;
  }
  node.playlist = nodeGraphAudioPlayerPlaylistNormalize(node.playlist);
  if (typeof saveNodeGraphWorkingPatchToUserSettings === "function") {
    saveNodeGraphWorkingPatchToUserSettings();
  } else if (typeof markNodeGraphRenderPending === "function") {
    markNodeGraphRenderPending();
  }
}

/** Playmode base 0…5. Writes the param (modulation still stacks on top). */
function nodeGraphAudioPlayerWriteTransport(nodeId, mode, { record = false } = {}) {
  const node = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
  if (!node || node.type !== "audioPlayer") {
    return;
  }
  const next = Math.max(0, Math.min(5, Math.round(Number(mode) || 0)));
  node.params = { ...(node.params || {}), transport: String(next) };
  const slider = document.querySelector(
    `.dsp-node[data-node="${CSS.escape(String(nodeId))}"] input[data-param="transport"]`,
  );
  if (slider) {
    if (typeof setNodeSliderValue === "function") {
      setNodeSliderValue(slider, next, { interaction: "program" });
    } else {
      slider.value = String(next);
      if (typeof syncNodeSliderReadout === "function") {
        syncNodeSliderReadout(slider);
      }
    }
  }
  if (typeof scheduleNodeGraphLiveParameterSync === "function") {
    scheduleNodeGraphLiveParameterSync();
  }
  if (record && typeof saveNodeGraphWorkingPatchToUserSettings === "function") {
    saveNodeGraphWorkingPatchToUserSettings();
  }
  nodeGraphAudioPlayerPlaylistSyncTransport(nodeId);
}

function nodeGraphAudioPlayerTransportBase(nodeId) {
  const node = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
  const n = Math.round(Number(node?.params?.transport));
  return Number.isFinite(n) ? Math.max(0, Math.min(5, n)) : 4;
}

function nodeGraphAudioPlayerPlaylistPlayModeForLoop(loopMode) {
  if (loopMode === "one") {
    return 3;
  }
  if (loopMode === "all") {
    return 5;
  }
  return 4;
}

function nodeGraphAudioPlayerPlaylistUnbindCurrentSample(nodeId) {
  const node = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
  if (!node || node.type !== "audioPlayer") {
    return;
  }
  delete node.sample;
  node.samplePhase = 0;
  nodeGraphMvp?.sampleLoadErrors?.delete?.(nodeId);
  nodeGraphMvp?.sampleRuntimeStatus?.delete?.(nodeId);
  nodeGraphMvp?.audioPlayerActualSpeeds?.delete?.(nodeId);
  if (typeof nodeGraphAudioPlayerWriteTransport === "function") {
    nodeGraphAudioPlayerWriteTransport(nodeId, 0);
  }
  if (typeof syncNodeGraphSampleDisplayForNode === "function") {
    syncNodeGraphSampleDisplayForNode(nodeId);
  }
  if (typeof renderNodeGraphMissingSampleAssetsDialog === "function") {
    renderNodeGraphMissingSampleAssetsDialog(nodeGraphMvp?.patch);
  }
  if (typeof scheduleNodeGraphLivePlanSync === "function") {
    scheduleNodeGraphLivePlanSync("plan");
  }
}

function nodeGraphAudioPlayerPlaylistClear(nodeId) {
  const node = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
  if (!node || node.type !== "audioPlayer") {
    return;
  }
  const pl = nodeGraphAudioPlayerPlaylistForNode(nodeId);
  pl.items = [];
  pl.index = 0;
  pl.selectedIndex = 0;
  pl.used = [];
  pl.folderPath = "";
  node.playlist = pl;
  if (typeof nodeGraphAudioPlayerLibraryCatalogs === "function") {
    nodeGraphAudioPlayerLibraryCatalogs().delete(String(nodeId));
  }
  nodeGraphAudioPlayerPlaylistUnbindCurrentSample(nodeId);
  nodeGraphAudioPlayerPlaylistRefreshUi(nodeId);
  nodeGraphAudioPlayerPlaylistPersist(nodeId);
}

function nodeGraphAudioPlayerPlaylistRemoveSelected(nodeId) {
  const node = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
  if (!node || node.type !== "audioPlayer") {
    return;
  }
  const pl = nodeGraphAudioPlayerPlaylistForNode(nodeId);
  if (!pl.items.length) {
    return;
  }
  const selected = Number.isInteger(pl.selectedIndex) ? pl.selectedIndex : pl.index;
  const i = Math.max(0, Math.min(pl.items.length - 1, selected));
  const removed = pl.items[i];
  pl.items.splice(i, 1);
  pl.index = Math.max(0, Math.min(pl.items.length ? pl.items.length - 1 : 0, i));
  pl.selectedIndex = pl.index;
  node.playlist = pl;
  const sid = typeof normalizeNodeGraphSampleId === "function"
    ? normalizeNodeGraphSampleId(node.sample?.id)
    : String(node.sample?.id || "").trim();
  if (!pl.items.length) {
    nodeGraphAudioPlayerPlaylistUnbindCurrentSample(nodeId);
  } else if (removed && sid && removed.sampleId === sid) {
    nodeGraphAudioPlayerPlaylistPlayIndex(nodeId, pl.index, { autoplay: false });
  }
  nodeGraphAudioPlayerPlaylistRefreshUi(nodeId);
  nodeGraphAudioPlayerPlaylistPersist(nodeId);
}

function nodeGraphAudioPlayerPlaylistToggleShuffle(nodeId) {
  const pl = nodeGraphAudioPlayerPlaylistForNode(nodeId);
  pl.shuffle = !pl.shuffle;
  const node = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
  if (node) {
    node.playlist = pl;
  }
  nodeGraphAudioPlayerPlaylistPersist(nodeId);
  nodeGraphAudioPlayerPlaylistSyncTransport(nodeId);
}

function nodeGraphAudioPlayerPlaylistCycleLoop(nodeId) {
  const pl = nodeGraphAudioPlayerPlaylistForNode(nodeId);
  const order = ["off", "one", "all"];
  const i = order.indexOf(pl.loopMode);
  pl.loopMode = order[(i + 1) % order.length];
  const node = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
  if (node) {
    node.playlist = pl;
  }
  nodeGraphAudioPlayerPlaylistPersist(nodeId);
  const transport = nodeGraphAudioPlayerTransportBase(nodeId);
  if (transport >= 3) {
    nodeGraphAudioPlayerWriteTransport(nodeId, nodeGraphAudioPlayerPlaylistPlayModeForLoop(pl.loopMode));
    return;
  }
  nodeGraphAudioPlayerPlaylistSyncTransport(nodeId);
}

function nodeGraphAudioPlayerPlaylistPlay(nodeId) {
  const pl = nodeGraphAudioPlayerPlaylistForNode(nodeId);
  const item = pl.items[pl.index] || pl.items[0];
  if (item && typeof nodeGraphAudioPlayerLibraryItemLoaded === "function" && !nodeGraphAudioPlayerLibraryItemLoaded(item)) {
    nodeGraphAudioPlayerPlaylistPlayIndex(nodeId, pl.items[pl.index] ? pl.index : 0, { autoplay: true });
    return;
  }
  const transport = nodeGraphAudioPlayerTransportBase(nodeId);
  if (transport >= 3) {
    return;
  }
  nodeGraphAudioPlayerWriteTransport(nodeId, nodeGraphAudioPlayerPlaylistPlayModeForLoop(pl.loopMode));
}

function nodeGraphAudioPlayerPlaylistPause(nodeId) {
  const transport = nodeGraphAudioPlayerTransportBase(nodeId);
  if (transport < 3) {
    return;
  }
  nodeGraphAudioPlayerWriteTransport(nodeId, 2);
}

function nodeGraphAudioPlayerPlaylistTogglePlayPause(nodeId) {
  const transport = nodeGraphAudioPlayerTransportBase(nodeId);
  if (transport >= 3) {
    nodeGraphAudioPlayerPlaylistPause(nodeId);
    return;
  }
  nodeGraphAudioPlayerPlaylistPlay(nodeId);
}

function nodeGraphAudioPlayerPlaylistPickNeighbor(pl, from, dir) {
  const n = pl.items.length;
  if (n <= 0) {
    return -1;
  }
  return from + dir;
}

function nodeGraphAudioPlayerPlaylistCurrentSampleRef(node) {
  const sampleId = typeof normalizeNodeGraphSampleId === "function"
    ? normalizeNodeGraphSampleId(node?.sample?.id)
    : String(node?.sample?.id || "").trim();
  if (!sampleId) {
    return null;
  }
  const samples = Array.isArray(nodeGraphMvp?.patch?.samples) ? nodeGraphMvp.patch.samples : [];
  const stored = samples.find((entry) => {
    const id = typeof normalizeNodeGraphSampleId === "function"
      ? normalizeNodeGraphSampleId(entry?.id)
      : String(entry?.id || "").trim();
    return id === sampleId;
  });
  const name = String(
    stored?.name
    || stored?.sourceName
    || node?.sample?.name
    || (typeof nodeGraphSampleNameForNode === "function" ? nodeGraphSampleNameForNode(node.id) : "")
    || sampleId,
  ).trim();
  return { id: sampleId, name: name || sampleId };
}

/** If the module is playing / holding a sample, that track belongs on the playlist. */
function nodeGraphAudioPlayerPlaylistEnsureCurrentSample(nodeId, options = {}) {
  const node = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
  if (!node || node.type !== "audioPlayer") {
    return null;
  }
  const ref = nodeGraphAudioPlayerPlaylistCurrentSampleRef(node);
  if (!ref) {
    return null;
  }
  const pl = nodeGraphAudioPlayerPlaylistForNode(nodeId);
  const existing = pl.items.find((item) => item.sampleId === ref.id);
  if (existing) {
    return existing;
  }
  const byName = pl.items.find((item) => !item.sampleId && item.name === ref.name);
  if (byName) {
    byName.sampleId = ref.id;
    return byName;
  }
  if (pl.folderPath || pl.items.length) {
    return null;
  }
  return nodeGraphAudioPlayerPlaylistAppendSample(nodeId, ref, options);
}

/** Append a loaded sample to the playlist (dedupe by sampleId). */
function nodeGraphAudioPlayerPlaylistAppendSample(nodeId, sampleRef = {}, options = {}) {
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
  if (options.persist !== false) {
    nodeGraphAudioPlayerPlaylistPersist(nodeId);
  }
  if (options.refresh !== false) {
    nodeGraphAudioPlayerPlaylistRefreshUi(nodeId);
  }
  return entry;
}

function nodeGraphAudioPlayerPlaylistSetFace(nodeId, face) {
  const node = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
  if (!node || node.type !== "audioPlayer") {
    return;
  }
  const pl = nodeGraphAudioPlayerPlaylistForNode(nodeId);
  pl.face = nodeGraphAudioPlayerPlaylistNormalizeFace(face);
  node.playlist = pl;
  nodeGraphAudioPlayerPlaylistApplyFace(nodeId);
  nodeGraphAudioPlayerPlaylistPersist(nodeId);
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
  nodeGraphAudioPlayerPlaylistPersist(nodeId);
}

function nodeGraphAudioPlayerPlaylistCreateTransport(nodeId) {
  const bar = document.createElement("div");
  bar.className = "node-music-player-pl-transport";
  bar.dataset.musicPlayerTransport = "true";
  bar.setAttribute("role", "toolbar");
  bar.setAttribute("aria-label", "Playlist transport");
  const specs = [
    ["prev", "◁", "Previous"],
    ["next", "▷", "Next"],
    ["stop", "⏹️", "Stop"],
    ["play", "▶️", "Play"],
    ["pause", "⏸️", "Pause"],
    ["loop", "↪️", "Loop"],
    ["shuffle", "🔀", "Shuffle next 100"],
    ["dive", "📂+", "Folder dive"],
  ];
  for (const [action, label, title] of specs) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "node-music-player-pl-transport-btn";
    btn.dataset.musicPlayerTransport = action;
    btn.textContent = label;
    btn.title = title;
    btn.setAttribute("aria-label", title);
    btn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      nodeGraphAudioPlayerPlaylistTransportAction(nodeId, action);
    });
    btn.addEventListener("pointerdown", (event) => event.stopPropagation());
    bar.append(btn);
  }
  return bar;
}

function nodeGraphAudioPlayerPlaylistTransportAction(nodeId, action) {
  if (action === "prev") {
    nodeGraphAudioPlayerPlaylistPlayPrev(nodeId);
    return;
  }
  if (action === "next") {
    nodeGraphAudioPlayerPlaylistPlayNext(nodeId);
    return;
  }
  if (action === "stop") {
    nodeGraphAudioPlayerWriteTransport(nodeId, 1);
    return;
  }
  if (action === "play") {
    nodeGraphAudioPlayerPlaylistPlay(nodeId);
    return;
  }
  if (action === "pause") {
    nodeGraphAudioPlayerPlaylistPause(nodeId);
    return;
  }
  if (action === "loop") {
    nodeGraphAudioPlayerPlaylistCycleLoop(nodeId);
    return;
  }
  if (action === "shuffle") {
    nodeGraphAudioPlayerPlaylistToggleShuffle(nodeId);
    return;
  }
  if (action === "dive") {
    if (typeof nodeGraphAudioPlayerLibraryToggleDive === "function") {
      nodeGraphAudioPlayerLibraryToggleDive(nodeId);
    }
  }
}

function nodeGraphAudioPlayerPlaylistSyncTransport(nodeId) {
  const section = document.querySelector(
    `.node-phosphor-waveform-display[data-node="${CSS.escape(String(nodeId || ""))}"]`,
  );
  const bar = section?.querySelector?.("[data-music-player-transport]");
  if (!bar) {
    return;
  }
  const pl = nodeGraphAudioPlayerPlaylistForNode(nodeId);
  const transport = nodeGraphAudioPlayerTransportBase(nodeId);
  const loopBtn = bar.querySelector("[data-music-player-transport='loop']");
  if (loopBtn) {
    const loop = transport === 3 ? "one" : transport === 5 ? "all" : pl.loopMode;
    loopBtn.textContent = loop === "one" ? "🔂" : loop === "all" ? "🔁" : "↪️";
    loopBtn.title = loop === "one" ? "Loop single" : loop === "all" ? "Loop all" : "Loop off";
    loopBtn.setAttribute("aria-label", loopBtn.title);
    loopBtn.classList.toggle("is-active", loop !== "off");
  }
  const prevBtn = bar.querySelector("[data-music-player-transport='prev']");
  if (prevBtn) {
    prevBtn.textContent = "◁";
  }
  const nextBtn = bar.querySelector("[data-music-player-transport='next']");
  if (nextBtn) {
    nextBtn.textContent = "▷";
  }
  const playBtn = bar.querySelector("[data-music-player-transport='play']");
  if (playBtn) {
    playBtn.textContent = "▶️";
    playBtn.title = "Play";
    playBtn.setAttribute("aria-label", "Play");
    playBtn.classList.toggle("is-active", transport >= 3);
  }
  const pauseBtn = bar.querySelector("[data-music-player-transport='pause']");
  if (pauseBtn) {
    pauseBtn.textContent = "⏸️";
    pauseBtn.title = "Pause";
    pauseBtn.setAttribute("aria-label", "Pause");
    pauseBtn.classList.toggle("is-active", transport === 2);
  }
  const stopBtn = bar.querySelector("[data-music-player-transport='stop']");
  if (stopBtn) {
    stopBtn.classList.toggle("is-active", transport === 1);
  }
  const shuffleBtn = bar.querySelector("[data-music-player-transport='shuffle']");
  if (shuffleBtn) {
    shuffleBtn.classList.toggle("is-active", Boolean(pl.shuffle));
    shuffleBtn.setAttribute("aria-pressed", pl.shuffle ? "true" : "false");
  }
  const diveBtn = bar.querySelector("[data-music-player-transport='dive']");
  if (diveBtn) {
    diveBtn.classList.toggle("is-active", Boolean(pl.folderDive));
    diveBtn.setAttribute("aria-pressed", pl.folderDive ? "true" : "false");
    diveBtn.title = pl.folderDive ? "Folder dive on — next 100 can come from subfolders" : "Folder dive off — this folder only";
  }
}

function nodeGraphAudioPlayerPlaylistEnsureFaceBar(section, nodeId) {
  if (!section) {
    return;
  }
  let bar = section.querySelector(":scope > .node-music-player-face-bar");
  if (bar) {
    return bar;
  }
  bar = document.createElement("div");
  bar.className = "node-music-player-face-bar";
  const plBtn = document.createElement("button");
  plBtn.type = "button";
  plBtn.className = "node-music-player-face-btn";
  plBtn.dataset.musicPlayerFace = "pl";
  plBtn.textContent = "playlist";
  plBtn.title = "Open playlist";
  plBtn.setAttribute("aria-label", "Open playlist");
  plBtn.setAttribute("aria-pressed", "false");
  plBtn.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    nodeGraphAudioPlayerPlaylistSetFace(nodeId, "pl");
  });
  plBtn.addEventListener("pointerdown", (event) => event.stopPropagation());
  bar.append(plBtn);
  section.append(bar);
  return bar;
}

const nodeGraphAudioPlayerPlaylistDockFaces = Object.freeze([
  ["wave", "wave", "Wave"],
  ["waveplay", "waveplay", "Waveplay"],
  ["pl", "playlist", "Playlist"],
  ["playinfo", "playinfo", "Playinfo"],
  ["vsxy", "XY", "XY"],
  ["vslr", "LR", "LR"],
]);

function nodeGraphAudioPlayerPlaylistEnsurePlayinfoPage(section) {
  if (!section) {
    return null;
  }
  let page = section.querySelector("[data-music-player-page='playinfo']");
  if (!page) {
    page = document.createElement("div");
    page.className = "node-music-player-page node-music-player-page-playinfo";
    page.dataset.musicPlayerPage = "playinfo";
    page.hidden = true;
    const dock = section.querySelector(":scope > .node-music-player-dock");
    if (dock) {
      section.insertBefore(page, dock);
    } else {
      section.append(page);
    }
  }
  if (!page.querySelector("[data-music-player-ram-panel]")) {
    let panel = section.querySelector("[data-music-player-ram-panel]");
    if (!panel) {
      panel = document.createElement("div");
      panel.className = "node-music-player-pl-ram-panel";
      panel.dataset.musicPlayerRamPanel = "true";
      const body = document.createElement("div");
      body.className = "node-music-player-pl-ram-body";
      body.dataset.musicPlayerRamBody = "true";
      panel.append(body);
    }
    page.append(panel);
  }
  return page;
}

function nodeGraphAudioPlayerPlaylistEnsureWaveplayPage(section) {
  if (!section) {
    return null;
  }
  let page = section.querySelector("[data-music-player-page='waveplay']")
    || section.querySelector("[data-music-player-page='wavplay']");
  if (page) {
    page.className = "node-music-player-page node-music-player-page-waveplay";
    page.dataset.musicPlayerPage = "waveplay";
    if (!page.querySelector("[data-music-player-wave-host]")) {
      const host = document.createElement("div");
      host.className = "node-music-player-waveplay-wave";
      host.dataset.musicPlayerWaveHost = "true";
      page.prepend(host);
    }
    let nowSong = page.querySelector("[data-music-player-now-song]");
    if (!nowSong?.querySelector?.("[data-music-player-transport='prev']")) {
      nowSong?.replaceWith?.(nodeGraphAudioPlayerPlaylistCreateNowSong(section.dataset?.node || ""));
      if (!page.querySelector("[data-music-player-now-song]")) {
        page.append(nodeGraphAudioPlayerPlaylistCreateNowSong(section.dataset?.node || ""));
      }
    }
    return page;
  }
  page = document.createElement("div");
  page.className = "node-music-player-page node-music-player-page-waveplay";
  page.dataset.musicPlayerPage = "waveplay";
  page.hidden = true;
  const host = document.createElement("div");
  host.className = "node-music-player-waveplay-wave";
  host.dataset.musicPlayerWaveHost = "true";
  page.append(host);
  page.append(nodeGraphAudioPlayerPlaylistCreateNowSong(section.dataset?.node || ""));
  const dock = section.querySelector(":scope > .node-music-player-dock");
  if (dock) {
    section.insertBefore(page, dock);
  } else {
    section.append(page);
  }
  return page;
}

function nodeGraphAudioPlayerPlaylistEnsureWavplayPage(section) {
  return nodeGraphAudioPlayerPlaylistEnsureWaveplayPage(section);
}

function nodeGraphAudioPlayerPlaylistCreateNowSong(nodeId) {
  const row = document.createElement("div");
  row.className = "node-music-player-waveplay-song";
  row.dataset.musicPlayerNowSong = "true";
  const makeSkip = (action, glyph, title) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "node-music-player-waveplay-skip";
    btn.dataset.musicPlayerTransport = action;
    btn.textContent = glyph;
    btn.title = title;
    btn.setAttribute("aria-label", title);
    btn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const id = String(nodeId || row.closest?.("[data-node]")?.dataset?.node || "");
      if (id) {
        nodeGraphAudioPlayerPlaylistTransportAction(id, action);
      }
    });
    btn.addEventListener("pointerdown", (event) => event.stopPropagation());
    return btn;
  };
  const name = document.createElement("button");
  name.type = "button";
  name.className = "node-music-player-pl-name";
  name.dataset.musicPlayerNowSongName = "true";
  name.textContent = "No sample loaded";
  name.title = "Open playlist";
  name.setAttribute("aria-label", "Open playlist");
  name.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const id = String(nodeId || row.closest?.("[data-node]")?.dataset?.node || "");
    if (id) {
      nodeGraphAudioPlayerPlaylistSetFace(id, "pl");
    }
  });
  name.addEventListener("pointerdown", (event) => event.stopPropagation());
  row.append(
    makeSkip("prev", "◁", "Previous track"),
    name,
    makeSkip("next", "▷", "Next track"),
  );
  return row;
}

function nodeGraphAudioPlayerPlaylistSyncNowSong(nodeId) {
  const section = document.querySelector(
    `.node-phosphor-waveform-display[data-node="${CSS.escape(String(nodeId || ""))}"]`,
  );
  const label = section?.querySelector?.("[data-music-player-now-song-name]");
  if (!label) {
    return;
  }
  const ref = nodeGraphAudioPlayerPlaylistCurrentSampleRef(
    typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null,
  );
  const text = String(ref?.name || "No sample loaded");
  if (label.textContent !== text) {
    label.textContent = text;
  }
}

function nodeGraphAudioPlayerPlaylistEnsureDock(section, nodeId) {
  if (!section) {
    return null;
  }
  let dock = section.querySelector(":scope > .node-music-player-dock");
  if (!dock) {
    dock = document.createElement("div");
    dock.className = "node-music-player-dock";
    dock.setAttribute("role", "tablist");
    dock.setAttribute("aria-label", "Music player views");
    section.append(dock);
  }
  const existing = [...dock.querySelectorAll("[data-music-player-face]")]
    .map((btn) => `${btn.dataset.musicPlayerFace}:${btn.textContent}`)
    .join(",");
  const wanted = nodeGraphAudioPlayerPlaylistDockFaces
    .map((entry) => `${entry[0]}:${entry[1]}`)
    .join(",");
  if (existing === wanted) {
    return dock;
  }
  dock.replaceChildren();
  for (const [face, label, title] of nodeGraphAudioPlayerPlaylistDockFaces) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "node-music-player-dock-btn";
    btn.dataset.musicPlayerFace = face;
    btn.textContent = label;
    btn.title = title;
    btn.setAttribute("aria-label", title);
    btn.setAttribute("aria-pressed", "false");
    btn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      nodeGraphAudioPlayerPlaylistSetFace(nodeId, face);
    });
    btn.addEventListener("pointerdown", (event) => event.stopPropagation());
    dock.append(btn);
  }
  return dock;
}

function nodeGraphAudioPlayerPlaylistPlaceShared(section, nodeId, face) {
  if (!section) {
    return;
  }
  const waveplayPage = nodeGraphAudioPlayerPlaylistEnsureWaveplayPage(section);
  const playinfoPage = nodeGraphAudioPlayerPlaylistEnsurePlayinfoPage(section);
  const wavePage = section.querySelector("[data-music-player-page='wave']");
  const plPage = section.querySelector("[data-music-player-page='pl']");
  const waveHost = waveplayPage?.querySelector("[data-music-player-wave-host]");
  const canvas = section.querySelector(".node-phosphor-waveform-canvas");
  const ramPanel = section.querySelector("[data-music-player-ram-panel]");
  const list = section.querySelector("[data-music-player-list]");
  let transport = section.querySelector("[data-music-player-transport]");
  if (!transport && nodeId) {
    transport = nodeGraphAudioPlayerPlaylistCreateTransport(nodeId);
  }
  if (canvas) {
    if (face === "waveplay" && waveHost && canvas.parentElement !== waveHost) {
      waveHost.append(canvas);
    } else if (face !== "waveplay" && wavePage && canvas.parentElement !== wavePage) {
      wavePage.append(canvas);
    }
  }
  if (ramPanel && playinfoPage && ramPanel.parentElement !== playinfoPage) {
    playinfoPage.append(ramPanel);
  }
  if (list && plPage && list.parentElement !== plPage) {
    plPage.append(list);
    if (nodeId) {
      nodeGraphAudioPlayerPlaylistBindListResize(list, nodeId);
    }
  }
  if (transport && plPage && transport.parentElement !== plPage) {
    plPage.append(transport);
  }
}

function nodeGraphAudioPlayerPlaylistEnsureLayout(section, nodeId) {
  if (!section) {
    return;
  }
  for (const back of section.querySelectorAll("[data-music-player-back]")) {
    if (back.classList.contains("node-music-player-pl-row")) {
      continue;
    }
    back.remove();
  }
  for (const leftover of section.querySelectorAll("[data-music-player-now]")) {
    leftover.remove();
  }
  for (const leftover of section.querySelectorAll("[data-music-player-ram]")) {
    leftover.remove();
  }
  for (const head of section.querySelectorAll(".node-music-player-pl-head")) {
    if (!head.querySelector(":scope > :not([hidden])")) {
      head.remove();
    }
  }
  nodeGraphAudioPlayerPlaylistEnsureWaveplayPage(section);
  nodeGraphAudioPlayerPlaylistEnsurePlayinfoPage(section);
  nodeGraphAudioPlayerPlaylistEnsureDock(section, nodeId);
  const list = section.querySelector("[data-music-player-list]");
  if (list && nodeId) {
    nodeGraphAudioPlayerPlaylistBindListResize(list, nodeId);
  }
  if (nodeId) {
    const existing = section.querySelector("[data-music-player-transport]");
    if (existing && !existing.querySelector("[data-music-player-transport='pause']")) {
      existing.remove();
    }
    if (!section.querySelector("[data-music-player-transport]")) {
      const plPage = section.querySelector("[data-music-player-page='pl']");
      if (plPage) {
        plPage.append(nodeGraphAudioPlayerPlaylistCreateTransport(nodeId));
      }
    }
  }
  nodeGraphAudioPlayerPlaylistEnsureFaceBar(section, nodeId);
  if (typeof nodeGraphPhosphorWaveformEnsureZoomControl === "function") {
    nodeGraphPhosphorWaveformEnsureZoomControl(section);
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
  const face = nodeGraphAudioPlayerPlaylistNormalizeFace(pl.face);
  pl.face = face;
  section.dataset.musicPlayerFace = face;
  nodeGraphAudioPlayerPlaylistPlaceShared(section, nodeId, face);
  for (const page of section.querySelectorAll("[data-music-player-page]")) {
    page.hidden = page.dataset.musicPlayerPage !== face;
  }
  for (const btn of section.querySelectorAll("[data-music-player-face]")) {
    const on = btn.dataset.musicPlayerFace === face;
    btn.classList.toggle("is-active", on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  }
  nodeGraphAudioPlayerPlaylistSyncNowSong(nodeId);
  if (nodeGraphAudioPlayerFaceShowsPlaylist(face)) {
    nodeGraphAudioPlayerPlaylistRefreshUi(nodeId);
    nodeGraphAudioPlayerPlaylistStartScrubLoop(nodeId);
    window.requestAnimationFrame(() => {
      nodeGraphAudioPlayerPlaylistPaintWaves(nodeId);
    });
  } else if (nodeGraphAudioPlayerFaceShowsPlayinfo(face)) {
    nodeGraphAudioPlayerPlaylistStopScrubLoop(nodeId);
    nodeGraphAudioPlayerPlaylistRefreshRamDebug(nodeId);
  } else {
    nodeGraphAudioPlayerPlaylistStopScrubLoop(nodeId);
  }
  if (typeof scheduleNodeGraphPhosphorWaveformFrame === "function") {
    scheduleNodeGraphPhosphorWaveformFrame(section);
  }
}

/** Write playlist scrub offset (hidden param). Does not touch ◀◀ ▶▶ / Scratch. */
function nodeGraphAudioPlayerPlaylistWritePhaseOffset(nodeId, phaseOffset, { record = false } = {}) {
  const node = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
  if (!node || node.type !== "audioPlayer") {
    return;
  }
  let next = Number(phaseOffset);
  if (!Number.isFinite(next)) {
    next = 0;
  }
  if (typeof wrapNodeSliderValue === "function") {
    next = wrapNodeSliderValue(next, -1, 1);
  } else {
    next = ((((next + 1) % 2) + 2) % 2) - 1;
  }
  node.params = { ...(node.params || {}), playlistScrub: String(next) };
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
  node.params = { ...(node.params || {}), playlistScrub: "0" };
  if (typeof rememberNodeGraphAudioPlayerSamplePhase === "function") {
    rememberNodeGraphAudioPlayerSamplePhase(nodeId, phase);
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
  const currentOffset = Number(node.params?.playlistScrub) || 0;
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

function nodeGraphAudioPlayerPlaylistPlayIndex(nodeId, index, options = {}) {
  if (typeof nodeGraphAudioPlayerLibraryPlayIndex === "function") {
    return nodeGraphAudioPlayerLibraryPlayIndex(nodeId, index, options);
  }
}

function nodeGraphAudioPlayerPlaylistPlayingFrom(nodeId, pl) {
  const node = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
  const sid = typeof normalizeNodeGraphSampleId === "function"
    ? normalizeNodeGraphSampleId(node?.sample?.id)
    : String(node?.sample?.id || "").trim();
  const playing = sid
    ? pl.items.findIndex((item) => item.sampleId === sid)
    : pl.index;
  return playing >= 0 ? playing : pl.index;
}

function nodeGraphAudioPlayerPlaylistPlayNext(nodeId) {
  if (typeof nodeGraphAudioPlayerLibraryPlayNext === "function") {
    nodeGraphAudioPlayerLibraryPlayNext(nodeId);
  }
}

function nodeGraphAudioPlayerPlaylistPlayPrev(nodeId) {
  if (typeof nodeGraphAudioPlayerLibraryPlayPrev === "function") {
    nodeGraphAudioPlayerLibraryPlayPrev(nodeId);
  }
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
  const catalogCount = typeof nodeGraphAudioPlayerLibraryCatalog === "function"
    ? nodeGraphAudioPlayerLibraryCatalog(nodeId).length
    : 0;
  if (pl.items.length < 2 && catalogCount <= pl.items.length) {
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
  // Auto-advance on Play (4) and Loop All (5), not Loop single (3).
  const transport = Math.round(Number(node.params?.transport) || 0);
  if (transport !== 4 && transport !== 5) {
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
  if (!section || !nodeGraphAudioPlayerFaceShowsPlaylist(section)) {
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
    if (!section || !nodeGraphAudioPlayerFaceShowsPlaylist(section)) {
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
  if (!section || !nodeGraphAudioPlayerFaceShowsPlaylist(section)) {
    return;
  }
  if (typeof applyNodeGraphPhosphorWaveformHudVars === "function") {
    applyNodeGraphPhosphorWaveformHudVars(
      section,
      typeof nodeGraphPhosphorWaveformSettingsForNode === "function"
        ? nodeGraphPhosphorWaveformSettingsForNode(nodeId)
        : null,
    );
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
    ? nodeGraphPhosphorWaveformViewState(nodeId, playingEntry.frames, section)
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
    const sampleId = row.dataset.sampleId || "";
    const live = Boolean(playingId && sampleId && sampleId === playingId);
    row.dataset.playing = live ? "true" : "false";
  }
  nodeGraphAudioPlayerPlaylistApplyRowFade(section, nodeId, playingId);
}

function nodeGraphAudioPlayerPlaylistSmoothstep(t) {
  const x = Math.max(0, Math.min(1, Number(t) || 0));
  return x * x * (3 - 2 * x);
}

function nodeGraphAudioPlayerPlaylistPlayingIndex(nodeId, playingId = "") {
  const pl = nodeGraphAudioPlayerPlaylistForNode(nodeId);
  const sid = normalizeNodeGraphSampleId
    ? normalizeNodeGraphSampleId(playingId)
    : String(playingId || "").trim();
  if (sid) {
    const found = pl.items.findIndex((item) => item.sampleId === sid);
    if (found >= 0) {
      return found;
    }
  }
  return Math.max(0, Math.round(Number(pl.index) || 0));
}

/** Fade only downward from the playing row. Rows above stay full. */
function nodeGraphAudioPlayerPlaylistRowFade(index, playingIndex, itemCount, playlistFade = 1) {
  const n = Math.max(1, Number(itemCount) || 1);
  const fade = Math.max(0, Math.min(1, Number(playlistFade)));
  const span = Math.max(1, 1 + (n - 1) * fade);
  const i = Math.round(Number(index) || 0);
  const p = Math.max(0, Math.round(Number(playingIndex) || 0));
  if (i <= p) {
    return 1;
  }
  return 1 - nodeGraphAudioPlayerPlaylistSmoothstep((i - p) / span);
}

function nodeGraphAudioPlayerPlaylistApplyRowFade(section, nodeId, playingId = "") {
  const list = section?.querySelector?.("[data-music-player-list]");
  if (!list) {
    return;
  }
  const pl = nodeGraphAudioPlayerPlaylistForNode(nodeId);
  const rows = list.querySelectorAll(".node-music-player-pl-row");
  const itemCount = pl.items.length || Math.max(1, rows.length);
  const playingIndex = nodeGraphAudioPlayerPlaylistPlayingIndex(nodeId, playingId);
  const settings = typeof nodeGraphPhosphorWaveformSettingsForNode === "function"
    ? nodeGraphPhosphorWaveformSettingsForNode(nodeId)
    : null;
  const playlistFade = settings?.playlistFade;
  rows.forEach((row) => {
    const index = Number(row.dataset.playlistIndex);
    const fade = nodeGraphAudioPlayerPlaylistRowFade(index, playingIndex, itemCount, playlistFade);
    row.style.setProperty("--node-music-player-pl-fade", String(fade));
  });
}

function nodeGraphAudioPlayerPlaylistRowHeightPx(list) {
  const sample = list?.querySelector?.(".node-music-player-pl-row");
  if (sample && sample.offsetHeight > 0) {
    return sample.offsetHeight;
  }
  const raw = list ? getComputedStyle(list).getPropertyValue("--node-music-player-pl-row-height") : "";
  const parsed = Number.parseFloat(raw);
  if (Number.isFinite(parsed) && parsed > 0) {
    const fontSize = Number.parseFloat(list ? getComputedStyle(list).fontSize : "") || 16;
    return raw.trim().endsWith("rem") ? parsed * fontSize : parsed;
  }
  return 18;
}

function nodeGraphAudioPlayerPlaylistVisibleSlotCount(list) {
  const height = Math.max(0, list?.clientHeight || 0);
  const rowH = Math.max(14, nodeGraphAudioPlayerPlaylistRowHeightPx(list));
  return Math.max(1, Math.floor(height / rowH) || 1);
}

function nodeGraphAudioPlayerPlaylistBindListResize(list, nodeId) {
  if (!list || list.dataset.slotResizeBound === "1" || typeof ResizeObserver === "undefined") {
    return;
  }
  list.dataset.slotResizeBound = "1";
  const observer = new ResizeObserver(() => {
    nodeGraphAudioPlayerPlaylistRefreshUi(nodeId);
  });
  observer.observe(list);
}

function nodeGraphAudioPlayerPlaylistMakeRowShell(index, { empty = false } = {}) {
  const row = document.createElement("button");
  row.type = "button";
  row.className = "node-music-player-pl-row";
  row.dataset.playlistIndex = String(index);
  if (empty) {
    row.classList.add("is-empty");
    row.dataset.slot = "empty";
    row.tabIndex = -1;
    row.setAttribute("aria-hidden", "true");
  }
  const num = document.createElement("span");
  num.className = "node-music-player-pl-num";
  num.textContent = String(index + 1).padStart(2, "0");
  const name = document.createElement("span");
  name.className = "node-music-player-pl-name";
  row.append(num, name);
  return row;
}

function nodeGraphAudioPlayerPlaylistBindTrackRow(row, nodeId, item, index) {
  row.dataset.sampleId = item.sampleId;
  row.title = "Double-click to play";
  row.addEventListener("dblclick", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const node = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
    const sid = normalizeNodeGraphSampleId
      ? normalizeNodeGraphSampleId(node?.sample?.id)
      : String(node?.sample?.id || "").trim();
    const already = Boolean(item.sampleId && sid && item.sampleId === sid);
    const transport = Number(node?.params?.transport);
    const playing = Number.isFinite(transport) ? transport >= 3 : false;
    if (already && playing) {
      nodeGraphAudioPlayerPlaylistSetFace(nodeId, "waveplay");
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
    const sid = normalizeNodeGraphSampleId
      ? normalizeNodeGraphSampleId(node?.sample?.id)
      : String(node?.sample?.id || "").trim();
    if (item.sampleId && sid && item.sampleId === sid) {
      nodeGraphAudioPlayerPlaylistSetFace(nodeId, "waveplay");
      return;
    }
    const cur = nodeGraphAudioPlayerPlaylistForNode(nodeId);
    cur.selectedIndex = index;
    node.playlist = cur;
    const listEl = row.closest("[data-music-player-list]");
    if (listEl) {
      listEl.querySelectorAll(".node-music-player-pl-row").forEach((el) => {
        el.dataset.active = el.dataset.playlistIndex === String(index) ? "true" : "false";
      });
    }
  });
  row.addEventListener("pointerdown", (event) => {
    event.stopPropagation();
  });
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
    nodeGraphAudioPlayerPlaylistBindListResize(list, nodeId);
    const visibleSlots = nodeGraphAudioPlayerPlaylistVisibleSlotCount(list);
    const rowCount = Math.max(pl.items.length, visibleSlots);
    const signature = `${pl.items.map((item) => item.sampleId).join("|")}#${rowCount}`;
    const reuse = list.dataset.itemSignature === signature
      && list.querySelectorAll(".node-music-player-pl-row").length === rowCount;
    if (!reuse) {
      list.dataset.itemSignature = signature;
      list.replaceChildren();
      const selected = Number.isInteger(pl.selectedIndex) ? pl.selectedIndex : pl.index;
      const playingId = normalizeNodeGraphSampleId
        ? normalizeNodeGraphSampleId(nodeGraphPatchNode(nodeId)?.sample?.id)
        : String(nodeGraphPatchNode(nodeId)?.sample?.id || "").trim();
      for (let index = 0; index < rowCount; index += 1) {
        const item = pl.items[index];
        if (item) {
          const row = nodeGraphAudioPlayerPlaylistMakeRowShell(index);
          const name = row.querySelector(".node-music-player-pl-name");
          if (name) {
            name.textContent = item.name;
          }
          row.dataset.active = index === selected ? "true" : "false";
          row.dataset.playing = playingId && item.sampleId === playingId ? "true" : "false";
          nodeGraphAudioPlayerPlaylistBindTrackRow(row, nodeId, item, index);
          list.append(row);
          continue;
        }
        list.append(nodeGraphAudioPlayerPlaylistMakeRowShell(index, { empty: true }));
      }
      nodeGraphAudioPlayerPlaylistApplyRowFade(section, nodeId);
    } else {
      const selected = Number.isInteger(pl.selectedIndex) ? pl.selectedIndex : pl.index;
      const playingId = normalizeNodeGraphSampleId
        ? normalizeNodeGraphSampleId(nodeGraphPatchNode(nodeId)?.sample?.id)
        : String(nodeGraphPatchNode(nodeId)?.sample?.id || "").trim();
      list.querySelectorAll(".node-music-player-pl-row").forEach((row) => {
        if (row.dataset.slot === "empty") {
          return;
        }
        const index = Number(row.dataset.playlistIndex);
        const item = pl.items[index];
        row.dataset.active = index === selected ? "true" : "false";
        row.dataset.playing = playingId && item?.sampleId === playingId ? "true" : "false";
        const name = row.querySelector(".node-music-player-pl-name");
        if (name && item) {
          name.textContent = item.name;
        }
      });
      nodeGraphAudioPlayerPlaylistApplyRowFade(section, nodeId);
    }
  }
  nodeGraphAudioPlayerPlaylistSyncNowSong(nodeId);
  nodeGraphAudioPlayerPlaylistRefreshRamDebug(nodeId);
  nodeGraphAudioPlayerPlaylistSyncTransport(nodeId);
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
  const panel = section.querySelector("[data-music-player-ram-panel]");
  if (!panel) {
    return;
  }
  panel.hidden = false;
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
    const playingId = normalizeNodeGraphSampleId
      ? normalizeNodeGraphSampleId(nodeGraphPatchNode(nodeId)?.sample?.id)
      : String(nodeGraphPatchNode(nodeId)?.sample?.id || "").trim();
    pl.items.forEach((item, index) => {
      const est = nodeGraphAudioPlayerPlaylistEstimateBytes(item.sampleId);
      const tr = document.createElement("tr");
      if (index === pl.index) {
        tr.dataset.active = "true";
      }
      if (playingId && item.sampleId === playingId) {
        tr.dataset.playing = "true";
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

  const list = document.createElement("div");
  list.className = "node-music-player-pl-list";
  list.dataset.musicPlayerList = "true";
  list.setAttribute("role", "listbox");
  list.setAttribute("aria-label", "Playlist tracks");

  plPage.append(list);

  const playinfoPage = document.createElement("div");
  playinfoPage.className = "node-music-player-page node-music-player-page-playinfo";
  playinfoPage.dataset.musicPlayerPage = "playinfo";
  playinfoPage.hidden = true;
  const ramPanel = document.createElement("div");
  ramPanel.className = "node-music-player-pl-ram-panel";
  ramPanel.dataset.musicPlayerRamPanel = "true";
  const ramBody = document.createElement("div");
  ramBody.className = "node-music-player-pl-ram-body";
  ramBody.dataset.musicPlayerRamBody = "true";
  ramPanel.append(ramBody);
  playinfoPage.append(ramPanel);

  const vsxyPage = document.createElement("div");
  vsxyPage.className = "node-music-player-page node-music-player-page-vs";
  vsxyPage.dataset.musicPlayerPage = "vsxy";
  vsxyPage.hidden = true;
  const vsxyCanvas = document.createElement("canvas");
  vsxyCanvas.className = "node-music-player-vs-canvas";
  vsxyCanvas.dataset.musicPlayerVs = "xy";
  vsxyPage.append(vsxyCanvas);

  const vslrPage = document.createElement("div");
  vslrPage.className = "node-music-player-page node-music-player-page-vs";
  vslrPage.dataset.musicPlayerPage = "vslr";
  vslrPage.hidden = true;
  const vslrCanvas = document.createElement("canvas");
  vslrCanvas.className = "node-music-player-vs-canvas";
  vslrCanvas.dataset.musicPlayerVs = "lr";
  vslrPage.append(vslrCanvas);

  const waveplayPage = document.createElement("div");
  waveplayPage.className = "node-music-player-page node-music-player-page-waveplay";
  waveplayPage.dataset.musicPlayerPage = "waveplay";
  waveplayPage.hidden = true;
  const waveplayWave = document.createElement("div");
  waveplayWave.className = "node-music-player-waveplay-wave";
  waveplayWave.dataset.musicPlayerWaveHost = "true";
  waveplayPage.append(waveplayWave);
  waveplayPage.append(nodeGraphAudioPlayerPlaylistCreateNowSong(nodeId));

  plPage.append(nodeGraphAudioPlayerPlaylistCreateTransport(nodeId));

  section.replaceChildren(wavePage, waveplayPage, plPage, playinfoPage, vsxyPage, vslrPage);
  nodeGraphAudioPlayerPlaylistEnsureLayout(section, nodeId);

  nodeGraphAudioPlayerPlaylistApplyFace(nodeId);

  window.requestAnimationFrame(() => {
    nodeGraphAudioPlayerPlaylistEnsureCurrentSample(nodeId);
  });

  return section;
}

function nodeGraphAudioPlayerVideoscopeChannels(nodeId) {
  const node = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
  const sampleId = node?.sample?.id;
  const entry = sampleId ? nodeGraphMvp?.sampleBuffers?.get?.(sampleId) : null;
  const left = entry?.channelData?.[0] || entry?.samples;
  if (!left?.length) {
    return null;
  }
  return {
    left,
    right: entry?.channelData?.[1] || left,
    frames: Math.max(1, Number(entry.frames) || left.length),
    sampleRate: Math.max(1, Number(entry.sampleRate) || 44100),
  };
}

function nodeGraphAudioPlayerVideoscopeWindow(nodeId, frames, sampleRate) {
  const settings = typeof nodeGraphPhosphorWaveformSettingsForNode === "function"
    ? nodeGraphPhosphorWaveformSettingsForNode(nodeId)
    : null;
  const rate = Math.max(1, Number(sampleRate) || 44100);
  const seconds = Number(settings?.timeWindowSeconds);
  const want = Number.isFinite(seconds) && seconds > 0
    ? Math.round(seconds * rate)
    : 2048;
  const span = Math.max(64, Math.min(frames, want, 8192));
  const phase = typeof nodeGraphSamplePhaseForNode === "function"
    ? nodeGraphSamplePhaseForNode(nodeId)
    : 0;
  const playhead = Math.max(0, Math.min(frames, phase * frames));
  let start = Math.round(playhead - span * 0.5);
  if (start < 0) {
    start = 0;
  }
  if (start + span > frames) {
    start = Math.max(0, frames - span);
  }
  return { start, end: Math.min(frames, start + span), playhead, span };
}

function nodeGraphAudioPlayerVideoscopePaint(section) {
  const face = section?.dataset?.musicPlayerFace;
  if (face !== "vsxy" && face !== "vslr") {
    return;
  }
  const canvas = section.querySelector(`[data-music-player-page="${face}"] canvas`);
  if (!canvas) {
    return;
  }
  const nodeId = section.dataset.node || "";
  const settings = typeof nodeGraphPhosphorWaveformSettingsForNode === "function"
    ? nodeGraphPhosphorWaveformSettingsForNode(nodeId)
    : null;
  const metrics = typeof nodeGraphMusicPlayerFaceMetrics === "function"
    ? nodeGraphMusicPlayerFaceMetrics(section, canvas, face)
    : null;
  const context = metrics?.context || canvas.getContext("2d");
  if (!context) {
    return;
  }
  const width = Math.max(1, metrics?.width || canvas.width);
  const height = Math.max(1, metrics?.height || canvas.height);
  const pixelRatio = metrics?.pixelRatio || Math.max(1, window.devicePixelRatio || 1);
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, width, height);
  const bg = typeof nodeGraphPhosphorWaveformBackgroundColor === "function"
    ? nodeGraphPhosphorWaveformBackgroundColor(settings)
    : "#050805";
  context.fillStyle = bg;
  context.fillRect(0, 0, width, height);
  const channels = nodeGraphAudioPlayerVideoscopeChannels(nodeId);
  if (!channels) {
    if (typeof drawNodeGraphPhosphorWaveformPlaceholder === "function") {
      drawNodeGraphPhosphorWaveformPlaceholder(
        context,
        width,
        height,
        "No sample loaded",
        pixelRatio,
        settings,
      );
    }
    return;
  }
  const win = nodeGraphAudioPlayerVideoscopeWindow(nodeId, channels.frames, channels.sampleRate);
  if (face === "vsxy") {
    nodeGraphAudioPlayerVideoscopePaintXy(context, width, height, channels, win, settings);
  } else {
    nodeGraphAudioPlayerVideoscopePaintLr(context, width, height, channels, win, settings);
  }
}

function nodeGraphAudioPlayerVideoscopePaintXy(context, width, height, channels, win, settings) {
  const axis = typeof nodeGraphPhosphorWaveformLineColor === "function"
    ? nodeGraphPhosphorWaveformLineColor(settings, 57, 0.28)
    : "rgba(80, 160, 130, 0.28)";
  const ink = typeof nodeGraphPhosphorWaveformLineColor === "function"
    ? nodeGraphPhosphorWaveformLineColor(settings, 82, 0.9)
    : "rgba(180, 230, 200, 0.9)";
  context.strokeStyle = axis;
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(width * 0.5, 0);
  context.lineTo(width * 0.5, height);
  context.moveTo(0, height * 0.5);
  context.lineTo(width, height * 0.5);
  context.stroke();
  const count = Math.max(1, win.end - win.start);
  const step = Math.max(1, Math.floor(count / Math.max(width, 256)));
  context.strokeStyle = ink;
  context.lineWidth = Math.max(1, Math.round((Number(settings?.traceWidth) || 1.5)));
  context.beginPath();
  let started = false;
  for (let i = win.start; i < win.end; i += step) {
    const x = ((Number(channels.left[i]) || 0) * 0.5 + 0.5) * (width - 1);
    const y = (0.5 - (Number(channels.right[i]) || 0) * 0.5) * (height - 1);
    if (!started) {
      context.moveTo(x, y);
      started = true;
    } else {
      context.lineTo(x, y);
    }
  }
  if (started) {
    context.stroke();
  }
  const play = Math.max(win.start, Math.min(win.end - 1, Math.round(win.playhead)));
  const hx = ((Number(channels.left[play]) || 0) * 0.5 + 0.5) * (width - 1);
  const hy = (0.5 - (Number(channels.right[play]) || 0) * 0.5) * (height - 1);
  context.strokeStyle = "rgba(255, 255, 255, 0.9)";
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(hx - 4, hy);
  context.lineTo(hx + 4, hy);
  context.moveTo(hx, hy - 4);
  context.lineTo(hx, hy + 4);
  context.stroke();
}

function nodeGraphAudioPlayerVideoscopePaintLr(context, width, height, channels, win, settings) {
  const mid = Math.round(height * 0.5);
  const line = typeof nodeGraphPhosphorWaveformLineColor === "function"
    ? nodeGraphPhosphorWaveformLineColor(settings, 57, 0.28)
    : "rgba(80, 160, 130, 0.28)";
  context.fillStyle = line;
  context.fillRect(0, mid, width, 1);
  const paintPane = (channel, top, paneH, color) => {
    const center = top + paneH * 0.5;
    const amp = paneH * 0.42;
    const count = Math.max(1, win.end - win.start);
    context.strokeStyle = color;
    context.lineWidth = Math.max(1, Math.round(width / 400));
    context.beginPath();
    for (let x = 0; x < width; x += 1) {
      const i0 = win.start + Math.floor((x / width) * count);
      const i1 = win.start + Math.floor(((x + 1) / width) * count);
      let min = 1;
      let max = -1;
      for (let i = i0; i < Math.max(i0 + 1, i1); i += 1) {
        const s = Number(channel[i]) || 0;
        if (s < min) min = s;
        if (s > max) max = s;
      }
      const y0 = center - max * amp;
      const y1 = center - min * amp;
      context.moveTo(x + 0.5, y0);
      context.lineTo(x + 0.5, y1);
    }
    context.stroke();
  };
  paintPane(channels.left, 0, mid, "rgba(220, 70, 70, 0.92)");
  paintPane(channels.right, mid, height - mid, "rgba(70, 140, 230, 0.92)");
  const playX = win.span > 0
    ? Math.round(((win.playhead - win.start) / win.span) * width)
    : 0;
  context.fillStyle = "rgba(255, 255, 255, 0.85)";
  context.fillRect(playX, 0, 1, height);
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
