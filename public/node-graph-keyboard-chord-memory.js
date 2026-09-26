// Chord Memory mode for Keyboard + Grid Keyboard.
// Slots are MIDI 0..127 → list of MIDI notes (full 128-key note-mask world).
// Not the DSP module `chordMemory` (Latch/Pitch CV).

const NODE_GRAPH_CHORD_MEMORY_PORT = "Chord Memory";

/** Main thread uses nodeGraphMvp; the worklet has no mvp — keep a durable host. */
function nodeGraphChordMemoryHost() {
  if (typeof nodeGraphMvp === "object" && nodeGraphMvp) return nodeGraphMvp;
  if (typeof globalThis === "undefined") return {};
  if (!globalThis.__soemChordMemoryHost) {
    globalThis.__soemChordMemoryHost = {
      chordMemoryActiveSlots: new Map(),
      chordMemoryLatchedSlots: new Map(),
      chordMemoryPlayMaskByNode: new Map(),
      chordMemoryOutLatchByNode: new Map(),
      chordMemoryPlayMask: null,
      chordMemoryPlayVelocity: 100,
      chordMemoryPlayPointerId: null,
      chordMemoryPlayPointerSlot: null,
      chordMemoryPlayPointerNodeId: null,
      chordMemoryEditNodeId: null,
      chordMemoryEditSlot: null,
    };
  }
  return globalThis.__soemChordMemoryHost;
}

function nodeGraphChordMemoryNormalizeSlots(raw) {
  const out = {};
  if (!raw || typeof raw !== "object") return out;
  const src = raw.slots && typeof raw.slots === "object" ? raw.slots : raw;
  for (const [key, value] of Object.entries(src)) {
    const slot = Math.round(Number(key));
    if (slot < 0 || slot > 127) continue;
    const notes = [];
    if (Array.isArray(value)) {
      for (const n of value) {
        const midi = Math.round(Number(n));
        if (midi >= 0 && midi <= 127 && !notes.includes(midi)) notes.push(midi);
      }
    } else if (value instanceof Uint8Array && typeof noteMaskEnsure === "function") {
      const mask = noteMaskEnsure(value);
      for (let i = 0; i < 128; i += 1) {
        if (mask[i]) notes.push(i);
      }
    }
    notes.sort((a, b) => a - b);
    if (notes.length) out[String(slot)] = notes;
  }
  return out;
}

function nodeGraphChordMemoryEnsureNode(node) {
  if (!node || typeof node !== "object") return { slots: {} };
  if (!node.chordMemory || typeof node.chordMemory !== "object") {
    node.chordMemory = { slots: {} };
  }
  if (!node.chordMemory.slots || typeof node.chordMemory.slots !== "object") {
    node.chordMemory.slots = {};
  }
  node.chordMemory.slots = nodeGraphChordMemoryNormalizeSlots(node.chordMemory);
  return node.chordMemory;
}

function nodeGraphChordMemorySlotsForNodeId(nodeId) {
  const id = String(nodeId || "").trim();
  if (!id || typeof nodeGraphPatchNode !== "function") return {};
  const node = nodeGraphPatchNode(id);
  if (!node) return {};
  return nodeGraphChordMemoryEnsureNode(node).slots;
}

function nodeGraphChordMemoryHasSlot(nodeId, midi) {
  const slot = Math.round(Number(midi));
  if (slot < 0 || slot > 127) return false;
  const notes = nodeGraphChordMemorySlotsForNodeId(nodeId)[String(slot)];
  return Array.isArray(notes) && notes.length > 0;
}

function nodeGraphChordMemoryNotesForSlot(nodeId, midi, nodesMap = null) {
  const slot = Math.round(Number(midi));
  if (slot < 0 || slot > 127) return [];
  const notes = nodeGraphChordMemorySlotsLookup(nodeId, nodesMap)[String(slot)];
  return Array.isArray(notes) ? notes.slice() : [];
}

/** Capture current gold Arp Keys (128 mask) into slot. Empty gold → clear slot. */
function nodeGraphChordMemorySaveFromArpMask(nodeId, midi) {
  const slot = Math.round(Number(midi));
  if (slot < 0 || slot > 127) return false;
  const node = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
  if (!node) return false;
  const mem = nodeGraphChordMemoryEnsureNode(node);
  const mask = typeof nodeGraphMidiKeyboardEnsureArpMask === "function"
    ? nodeGraphMidiKeyboardEnsureArpMask()
    : (nodeGraphMvp?.midiKeyboardArpMask || null);
  const notes = [];
  if (mask instanceof Uint8Array) {
    for (let i = 0; i < 128; i += 1) {
      if (mask[i]) notes.push(i);
    }
  }
  if (!notes.length) {
    delete mem.slots[String(slot)];
  } else {
    mem.slots[String(slot)] = notes;
  }
  if (typeof nodeGraphMvp === "object" && nodeGraphMvp) {
    nodeGraphMvp.patchDirtyState = "dirty";
  }
  return true;
}

function nodeGraphChordMemoryEditIs(nodeId, midi) {
  const host = nodeGraphChordMemoryHost();
  return String(host.chordMemoryEditNodeId || "") === String(nodeId || "").trim()
    && Number(host.chordMemoryEditSlot) === Math.round(Number(midi));
}

function nodeGraphChordMemoryEditClear() {
  const host = nodeGraphChordMemoryHost();
  host.chordMemoryEditNodeId = null;
  host.chordMemoryEditSlot = null;
}

/** Ctrl+click previews: unlatch every slot so leaving Chord Memory does not leave notes stuck. */
function nodeGraphChordMemoryClearLatchedPreviews() {
  const map = nodeGraphChordMemoryEnsureLatchedMap();
  for (const [nodeId, set] of [...map.entries()]) {
    const slots = set instanceof Set ? [...set] : [];
    for (const slot of slots) {
      if (set instanceof Set) set.delete(slot);
      nodeGraphChordMemoryActivateSlot(nodeId, slot, false);
    }
    map.delete(nodeId);
  }
  nodeGraphChordMemoryEditClear();
  if (typeof nodeGraphChordMemoryPaintKeys === "function") {
    nodeGraphChordMemoryPaintKeys();
  }
}

function nodeGraphChordMemoryEditSet(nodeId, midi) {
  const host = nodeGraphChordMemoryHost();
  host.chordMemoryEditNodeId = String(nodeId || "").trim();
  host.chordMemoryEditSlot = Math.round(Number(midi));
}

/** Ctrl+click a blank key in Chord Memory mode: edit an empty chord. Gold is untouched. */
function nodeGraphChordMemoryBeginBlankEdit(nodeId, midi) {
  const slot = Math.round(Number(midi));
  if (slot < 0 || slot > 127) return false;
  const node = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
  if (!node) return false;
  const mem = nodeGraphChordMemoryEnsureNode(node);
  delete mem.slots[String(slot)];
  nodeGraphChordMemoryUnlatchOthers(nodeId, null);
  nodeGraphChordMemoryEditSet(nodeId, slot);
  if (typeof nodeGraphMvp === "object" && nodeGraphMvp) {
    nodeGraphMvp.patchDirtyState = "dirty";
    nodeGraphMvp.midiKeyboardStatus = `editing blank chord @ ${slot}`;
  }
  nodeGraphChordMemoryPaintKeys();
  if (typeof renderNodeGraphMidiKeyboardSignal === "function") {
    renderNodeGraphMidiKeyboardSignal(nodeGraphMvp?.keyboardModuleSignal || null);
  }
  return true;
}

/** Red/edit notes currently being edited, else live sounding chord tones. Never gold. */
function nodeGraphChordMemoryCurrentEditNotes(nodeId) {
  const host = nodeGraphChordMemoryHost();
  if (nodeGraphChordMemoryEditIs(nodeId, host.chordMemoryEditSlot)) {
    return nodeGraphChordMemoryNotesForSlot(nodeId, host.chordMemoryEditSlot);
  }
  return nodeGraphChordMemorySoundingOfMask(nodeGraphChordMemoryLiveMaskForNode(nodeId));
}

/** Alt+click in Chord Memory mode: stamp current red/edit chord onto this key and edit it. */
function nodeGraphChordMemorySaveCurrentEdit(nodeId, midi, velocity127) {
  const slot = Math.round(Number(midi));
  if (slot < 0 || slot > 127) return false;
  const node = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
  if (!node) return false;
  const mem = nodeGraphChordMemoryEnsureNode(node);
  const notes = [];
  const seen = new Set();
  const raw = nodeGraphChordMemoryCurrentEditNotes(nodeId);
  for (let i = 0; i < raw.length; i += 1) {
    const n = Math.round(Number(raw[i]));
    if (n < 0 || n > 127 || seen.has(n)) continue;
    seen.add(n);
    notes.push(n);
  }
  notes.sort((a, b) => a - b);
  if (!notes.length) delete mem.slots[String(slot)];
  else mem.slots[String(slot)] = notes;
  if (typeof nodeGraphMvp === "object" && nodeGraphMvp) {
    nodeGraphMvp.patchDirtyState = "dirty";
    nodeGraphMvp.midiKeyboardStatus = notes.length
      ? `chord saved @ ${slot}`
      : `editing blank chord @ ${slot}`;
  }
  nodeGraphChordMemoryUnlatchOthers(nodeId, slot);
  const latched = nodeGraphChordMemoryLatchedSetFor(nodeId);
  latched.clear();
  nodeGraphChordMemoryEditSet(nodeId, slot);
  if (notes.length) {
    latched.add(slot);
    nodeGraphChordMemoryActivateSlot(nodeId, slot, true, velocity127);
  } else {
    nodeGraphChordMemoryActivateSlot(nodeId, slot, false);
  }
  if (typeof nodeGraphChordMemoryPaintKeys === "function") {
    nodeGraphChordMemoryPaintKeys();
  }
  if (typeof renderNodeGraphMidiKeyboardSignal === "function") {
    renderNodeGraphMidiKeyboardSignal(nodeGraphMvp?.keyboardModuleSignal || null);
  }
  return true;
}

/** Delete the chord stored on this key (green slot). */
function nodeGraphChordMemoryClearSlot(nodeId, midi) {
  const slot = Math.round(Number(midi));
  if (slot < 0 || slot > 127) return false;
  const node = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
  if (!node) return false;
  const mem = nodeGraphChordMemoryEnsureNode(node);
  if (!mem.slots[String(slot)]) return false;
  delete mem.slots[String(slot)];
  nodeGraphChordMemoryLatchedSetFor(nodeId).delete(slot);
  if (nodeGraphChordMemoryActiveSetFor(nodeId).has(slot)) {
    nodeGraphChordMemoryActivateSlot(nodeId, slot, false);
  }
  if (nodeGraphChordMemoryEditIs(nodeId, slot)) nodeGraphChordMemoryEditClear();
  if (typeof nodeGraphMvp === "object" && nodeGraphMvp) {
    nodeGraphMvp.patchDirtyState = "dirty";
    nodeGraphMvp.midiKeyboardStatus = `chord cleared @ ${slot}`;
  }
  nodeGraphChordMemoryPaintKeys();
  if (typeof renderNodeGraphMidiKeyboardSignal === "function") {
    renderNodeGraphMidiKeyboardSignal(nodeGraphMvp?.keyboardModuleSignal || null);
  }
  return true;
}

/** Replace gold Arp Keys with chord at slot. */
function nodeGraphChordMemoryRecallToArp(nodeId, midi) {
  const notes = nodeGraphChordMemoryNotesForSlot(nodeId, midi);
  if (!notes.length) return false;
  const mask = typeof noteMaskCreate === "function" ? noteMaskCreate() : new Uint8Array(128);
  for (const n of notes) {
    if (typeof noteMaskSet === "function") noteMaskSet(mask, n, true);
    else if (n >= 0 && n < 128) mask[n] = 1;
  }
  if (typeof nodeGraphMvp === "object" && nodeGraphMvp) {
    nodeGraphMvp.midiKeyboardArpMask = mask;
  }
  if (typeof nodeGraphMidiKeyboardEnsureHeldKeyVelocities === "function") {
    const vels = nodeGraphMidiKeyboardEnsureHeldKeyVelocities();
    vels.fill(0);
    for (const n of notes) {
      const i = Math.round(Number(n));
      if (i >= 0 && i < vels.length) vels[i] = 100;
    }
  }
  if (typeof nodeGraphMidiKeyboardSyncBitmaskFieldsFromArpMask === "function") {
    nodeGraphMidiKeyboardSyncBitmaskFieldsFromArpMask();
  }
  if (typeof renderNodeGraphMidiKeyboardHeldKeys === "function") {
    renderNodeGraphMidiKeyboardHeldKeys();
  }
  if (typeof saveNodeGraphMidiKeyboardMemory === "function") {
    saveNodeGraphMidiKeyboardMemory();
  }
  if (typeof sendNodeGraphLiveMidiKeyboardHeldKeysBitmask === "function") {
    sendNodeGraphLiveMidiKeyboardHeldKeysBitmask();
  }
  if (typeof syncNodeGraphKeyboardPolyphonyFromHeldNotes === "function") {
    syncNodeGraphKeyboardPolyphonyFromHeldNotes();
  }
  return true;
}

function nodeGraphChordMemoryEnsureActiveMap() {
  const host = nodeGraphChordMemoryHost();
  if (!(host.chordMemoryActiveSlots instanceof Map)) {
    host.chordMemoryActiveSlots = new Map();
  }
  return host.chordMemoryActiveSlots;
}

function nodeGraphChordMemoryActiveSetFor(nodeId) {
  const map = nodeGraphChordMemoryEnsureActiveMap();
  const id = String(nodeId || "").trim() || "__global__";
  if (!(map.get(id) instanceof Set)) map.set(id, new Set());
  return map.get(id);
}

function nodeGraphChordMemoryEnsureLatchedMap() {
  const host = nodeGraphChordMemoryHost();
  if (!(host.chordMemoryLatchedSlots instanceof Map)) {
    host.chordMemoryLatchedSlots = new Map();
  }
  return host.chordMemoryLatchedSlots;
}

function nodeGraphChordMemoryLatchedSetFor(nodeId) {
  const map = nodeGraphChordMemoryEnsureLatchedMap();
  const id = String(nodeId || "").trim() || "__global__";
  if (!(map.get(id) instanceof Set)) map.set(id, new Set());
  return map.get(id);
}

/** Main → worklet: user Alt/Ctrl latch must drive Chord Memory OUT on the audio thread. */
function nodeGraphChordMemorySyncLiveAudio() {
  if (typeof sendNodeGraphLiveChordMemoryLatch !== "function") return;
  if (typeof nodeGraphMvp !== "object" || !nodeGraphMvp) return;
  const host = nodeGraphChordMemoryHost();
  const slotsByNode = {};
  const map = host.chordMemoryLatchedSlots;
  if (map instanceof Map) {
    for (const [id, set] of map) {
      slotsByNode[String(id)] = set instanceof Set ? [...set] : [];
    }
  }
  const playMaskByNode = {};
  const byNode = host.chordMemoryPlayMaskByNode;
  if (byNode instanceof Map) {
    for (const [id, mask] of byNode) {
      if (mask instanceof Uint8Array) playMaskByNode[String(id)] = new Uint8Array(mask);
    }
  }
  const mom = host.chordMemoryMomentaryPlayMask instanceof Uint8Array
    ? new Uint8Array(host.chordMemoryMomentaryPlayMask)
    : null;
  sendNodeGraphLiveChordMemoryLatch(slotsByNode, playMaskByNode, mom);
}

/** Worklet: apply latched slots + live play mask posted from main. */
function nodeGraphChordMemoryApplyLiveLatch(slotsByNode, playMaskByNode, momentaryMask) {
  const host = nodeGraphChordMemoryHost();
  const slotsSrc = slotsByNode && typeof slotsByNode === "object" ? slotsByNode : {};
  const maskSrc = playMaskByNode && typeof playMaskByNode === "object" ? playMaskByNode : {};
  if (momentaryMask instanceof Uint8Array) {
    host.chordMemoryMomentaryPlayMask = Uint8Array.from(momentaryMask);
    host.chordMemoryMomentary = nodeGraphChordMemoryMaskHasNotes(host.chordMemoryMomentaryPlayMask);
  } else if (momentaryMask === null) {
    host.chordMemoryMomentary = false;
    host.chordMemoryMomentaryPlayMask = typeof noteMaskCreate === "function"
      ? noteMaskCreate()
      : new Uint8Array(128);
  }
  const ids = new Set([...Object.keys(slotsSrc), ...Object.keys(maskSrc)]);
  for (const id of ids) {
    const latched = nodeGraphChordMemoryLatchedSetFor(id);
    latched.clear();
    const slots = Array.isArray(slotsSrc[id]) ? slotsSrc[id] : [];
    for (let i = 0; i < slots.length; i += 1) {
      const slot = Math.round(Number(slots[i]));
      if (slot >= 0 && slot <= 127) latched.add(slot);
    }
    const incoming = maskSrc[id];
    const mask = incoming instanceof Uint8Array
      ? Uint8Array.from(incoming)
      : (typeof noteMaskCreate === "function" ? noteMaskCreate() : new Uint8Array(128));
    if (!(host.chordMemoryPlayMaskByNode instanceof Map)) {
      host.chordMemoryPlayMaskByNode = new Map();
    }
    host.chordMemoryPlayMaskByNode.set(id, mask);
  }
  const all = typeof noteMaskCreate === "function" ? noteMaskCreate() : new Uint8Array(128);
  if (host.chordMemoryPlayMaskByNode instanceof Map) {
    for (const m of host.chordMemoryPlayMaskByNode.values()) {
      if (!(m instanceof Uint8Array)) continue;
      for (let i = 0; i < 128; i += 1) {
        if (m[i]) all[i] = 1;
      }
    }
  }
  host.chordMemoryPlayMask = all;
}

/** At most one latched chord per keyboard — that slot is also the edit target. */
function nodeGraphChordMemoryUnlatchOthers(nodeId, exceptSlot) {
  const keep = exceptSlot == null ? NaN : Math.round(Number(exceptSlot));
  const latched = nodeGraphChordMemoryLatchedSetFor(nodeId);
  for (const slot of [...latched]) {
    if (slot === keep) continue;
    latched.delete(slot);
    nodeGraphChordMemoryActivateSlot(nodeId, slot, false);
  }
}

/** Toggle a stored chord on/off. Survives mode changes. One slot at a time. */
function nodeGraphChordMemoryToggleLatch(nodeId, midi, velocity127) {
  const slot = Math.round(Number(midi));
  if (slot < 0 || slot > 127) return false;
  if (!nodeGraphChordMemoryHasSlot(nodeId, slot)) return false;
  const latched = nodeGraphChordMemoryLatchedSetFor(nodeId);
  if (latched.has(slot)) {
    latched.delete(slot);
    nodeGraphChordMemoryActivateSlot(nodeId, slot, false);
    nodeGraphChordMemoryEditClear();
    if (typeof nodeGraphMvp === "object" && nodeGraphMvp) {
      nodeGraphMvp.midiKeyboardStatus = `chord off @ ${slot}`;
    }
    if (typeof nodeGraphChordMemoryPaintKeys === "function") {
      nodeGraphChordMemoryPaintKeys();
    }
    return true;
  }
  nodeGraphChordMemoryUnlatchOthers(nodeId, slot);
  latched.clear();
  latched.add(slot);
  nodeGraphChordMemoryActivateSlot(nodeId, slot, true, velocity127);
  nodeGraphChordMemoryEditSet(nodeId, slot);
  if (typeof nodeGraphMvp === "object" && nodeGraphMvp) {
    nodeGraphMvp.midiKeyboardStatus = `chord on @ ${slot}`;
  }
  if (typeof nodeGraphChordMemoryPaintKeys === "function") {
    nodeGraphChordMemoryPaintKeys();
  }
  return true;
}

/** Chord Memory mode: click a key to add/remove it from the exclusive edit slot. */
function nodeGraphChordMemoryToggleEditNote(nodeId, midi, velocity127) {
  const m = Math.round(Number(midi));
  if (m < 0 || m > 127) return false;
  const host = nodeGraphChordMemoryHost();
  if (!nodeGraphChordMemoryEditIs(nodeId, host.chordMemoryEditSlot)) return false;
  const slot = Math.round(Number(host.chordMemoryEditSlot));
  const node = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
  if (!node) return false;
  const mem = nodeGraphChordMemoryEnsureNode(node);
  const key = String(slot);
  const notes = Array.isArray(mem.slots[key]) ? mem.slots[key].map((n) => Math.round(Number(n))) : [];
  const idx = notes.indexOf(m);
  if (idx >= 0) notes.splice(idx, 1);
  else notes.push(m);
  notes.sort((a, b) => a - b);
  if (!notes.length) delete mem.slots[key];
  else mem.slots[key] = notes;
  if (typeof nodeGraphMvp === "object" && nodeGraphMvp) {
    nodeGraphMvp.patchDirtyState = "dirty";
  }
  const latched = nodeGraphChordMemoryLatchedSetFor(nodeId);
  if (notes.length) {
    if (!latched.has(slot)) {
      nodeGraphChordMemoryUnlatchOthers(nodeId, slot);
      latched.add(slot);
    }
    nodeGraphChordMemoryActivateSlot(nodeId, slot, true, velocity127);
  } else {
    latched.delete(slot);
    nodeGraphChordMemoryActivateSlot(nodeId, slot, false);
  }
  if (typeof nodeGraphChordMemoryPaintKeys === "function") {
    nodeGraphChordMemoryPaintKeys();
  }
  return true;
}

function nodeGraphChordMemoryNoteIsEdit(nodeId, midi) {
  const m = Math.round(Number(midi));
  if (m < 0 || m > 127) return false;
  const host = nodeGraphChordMemoryHost();
  if (!nodeGraphChordMemoryEditIs(nodeId, host.chordMemoryEditSlot)) return false;
  const notes = nodeGraphChordMemoryNotesForSlot(nodeId, host.chordMemoryEditSlot);
  return notes.includes(m);
}

function nodeGraphChordMemoryMomentaryPlayTransmit(phase) {
  const host = nodeGraphChordMemoryHost();
  const mask = host.chordMemoryMomentaryPlayMask;
  if (typeof noteMaskTransmit === "function" && mask instanceof Uint8Array) {
    return noteMaskTransmit(mask, phase);
  }
  return 0;
}

function nodeGraphChordMemoryStartMomentaryPlay(nodeId, midi, pointerId, velocity127) {
  const notes = nodeGraphChordMemoryNotesForSlot(nodeId, midi);
  if (!notes.length) return false;
  const host = nodeGraphChordMemoryHost();
  const mask = typeof noteMaskCreate === "function" ? noteMaskCreate() : new Uint8Array(128);
  for (const n of notes) {
    if (typeof noteMaskSet === "function") noteMaskSet(mask, n, true);
    else if (n >= 0 && n < 128) mask[n] = 1;
  }
  host.chordMemoryMomentary = true;
  host.chordMemoryPlayPointerId = pointerId;
  host.chordMemoryPlayPointerSlot = Math.round(Number(midi));
  host.chordMemoryPlayPointerNodeId = nodeId;
  host.chordMemoryMomentaryPlayMask = mask;
  if (typeof nodeGraphMvp === "object" && nodeGraphMvp?.keyboardModuleSignal) {
    nodeGraphMvp.keyboardModuleSignal = {
      ...nodeGraphMvp.keyboardModuleSignal,
      gate: 0,
      gatePulse: 0,
    };
    if (typeof sendNodeGraphLiveKeyboardModuleSignal === "function") {
      sendNodeGraphLiveKeyboardModuleSignal(nodeGraphMvp.keyboardModuleSignal);
    }
  }
  if (typeof syncNodeGraphKeyboardPolyphonyFromHeldNotes === "function") {
    syncNodeGraphKeyboardPolyphonyFromHeldNotes();
  }
  nodeGraphChordMemorySyncLiveAudio();
  if (typeof renderNodeGraphMidiKeyboardHeldKeys === "function") {
    renderNodeGraphMidiKeyboardHeldKeys();
  }
  if (typeof renderNodeGraphMidiKeyboardActiveKeys === "function") {
    renderNodeGraphMidiKeyboardActiveKeys();
  }
  return true;
}

/** Rebuild contribution mask from all active slots (pointer + inlet). */
function nodeGraphChordMemoryRebuildPlayMask(nodeId) {
  const mask = typeof noteMaskCreate === "function" ? noteMaskCreate() : new Uint8Array(128);
  const active = nodeGraphChordMemoryActiveSetFor(nodeId);
  for (const slot of active) {
    const notes = nodeGraphChordMemoryNotesForSlot(nodeId, slot);
    for (const n of notes) {
      if (typeof noteMaskSet === "function") noteMaskSet(mask, n, true);
      else if (n >= 0 && n < 128) mask[n] = 1;
    }
  }
  const host = nodeGraphChordMemoryHost();
  if (!(host.chordMemoryPlayMaskByNode instanceof Map)) {
    host.chordMemoryPlayMaskByNode = new Map();
  }
  host.chordMemoryPlayMaskByNode.set(String(nodeId || "").trim() || "__global__", mask);
  const all = typeof noteMaskCreate === "function" ? noteMaskCreate() : new Uint8Array(128);
  for (const m of host.chordMemoryPlayMaskByNode.values()) {
    if (!(m instanceof Uint8Array)) continue;
    for (let i = 0; i < 128; i += 1) {
      if (m[i]) all[i] = 1;
    }
  }
  host.chordMemoryPlayMask = all;
  nodeGraphChordMemorySyncLiveAudio();
  return mask;
}

function nodeGraphChordMemorySoundingOfMask(mask) {
  const out = [];
  if (!(mask instanceof Uint8Array)) return out;
  for (let midi = 0; midi < 128; midi += 1) {
    if (mask[midi]) out.push(midi);
  }
  return out;
}

function nodeGraphChordMemoryStrikeVelocity127(event, surface) {
  let v01 = 1;
  if (typeof nodeGraphMidiKeyboardPointerXY === "function" && event && surface) {
    const xy = nodeGraphMidiKeyboardPointerXY(event, surface);
    if (Number.isFinite(Number(xy?.velocity))) v01 = Number(xy.velocity);
  }
  if (typeof nodeGraphMidiKeyboardMapStrikeVelocity01 === "function") {
    v01 = nodeGraphMidiKeyboardMapStrikeVelocity01(v01);
  }
  if (typeof nodeGraphMidiKeyboardClamp01 === "function") {
    v01 = nodeGraphMidiKeyboardClamp01(v01);
  } else {
    v01 = Math.max(0, Math.min(1, Number(v01) || 0));
  }
  let vel = Math.round(v01 * 127);
  if (!(vel > 0)) vel = 1;
  if (vel > 127) vel = 127;
  return vel;
}

/**
 * Chord latch/unlatch is applied on the worklet via Chord Memory OUT → Voices.
 * Do not also poke VoiceManager from the UI thread — that raced with the
 * want-set (Gate off then on for notes that were already gone).
 */
function nodeGraphChordMemoryVoiceDelta(_prevPlayMask, _prevTable) {
}

function nodeGraphChordMemoryActivateSlot(nodeId, midi, on, velocity127) {
  const slot = Math.round(Number(midi));
  if (slot < 0 || slot > 127) return false;
  if (on && !nodeGraphChordMemoryHasSlot(nodeId, slot)) return false;
  const host = nodeGraphChordMemoryHost();
  const prevPlay = host.chordMemoryPlayMask instanceof Uint8Array
    ? new Uint8Array(host.chordMemoryPlayMask)
    : (typeof noteMaskCreate === "function" ? noteMaskCreate() : new Uint8Array(128));
  const prevTable = (typeof nodeGraphMvp === "object" && nodeGraphMvp?.keyboardPolyphonyVelocities instanceof Uint8Array)
    ? new Uint8Array(nodeGraphMvp.keyboardPolyphonyVelocities)
    : null;
  if (on) {
    let vel = Math.round(Number(velocity127));
    if (!(vel > 0)) vel = 100;
    if (vel > 127) vel = 127;
    host.chordMemoryPlayVelocity = vel;
  }
  const active = nodeGraphChordMemoryActiveSetFor(nodeId);
  if (on) active.add(slot);
  else active.delete(slot);
  nodeGraphChordMemoryRebuildPlayMask(nodeId);
  // Blue Play Keys path: polyphony table only — never gold Arp latch.
  if (typeof syncNodeGraphKeyboardPolyphonyFromHeldNotes === "function") {
    syncNodeGraphKeyboardPolyphonyFromHeldNotes();
  }
  nodeGraphChordMemoryVoiceDelta(prevPlay, prevTable);
  if (typeof renderNodeGraphMidiKeyboardHeldKeys === "function") {
    renderNodeGraphMidiKeyboardHeldKeys();
  }
  if (typeof renderNodeGraphMidiKeyboardActiveKeys === "function") {
    renderNodeGraphMidiKeyboardActiveKeys();
  }
  if (typeof renderNodeGraphGridKeyboardPads === "function") {
    renderNodeGraphGridKeyboardPads();
  }
  nodeGraphChordMemorySyncLiveAudio();
  return true;
}

function nodeGraphChordMemoryClearPointerIds() {
  const host = nodeGraphChordMemoryHost();
  host.chordMemoryPlayPointerId = null;
  host.chordMemoryPlayPointerSlot = null;
  host.chordMemoryPlayPointerNodeId = null;
}

/** Mouse/key up: momentary Play Keys off; latched chords stay. */
function nodeGraphChordMemoryReleasePointerPlay() {
  const host = nodeGraphChordMemoryHost();
  const had = host.chordMemoryPlayPointerId != null || host.chordMemoryPlayPointerSlot != null;
  const slot = Number(host.chordMemoryPlayPointerSlot);
  const nodeId = host.chordMemoryPlayPointerNodeId;
  const pointerId = host.chordMemoryPlayPointerId;
  const momentary = Boolean(host.chordMemoryMomentary);
  host.chordMemoryMomentary = false;
  host.chordMemoryMomentaryPlayMask = typeof noteMaskCreate === "function"
    ? noteMaskCreate()
    : new Uint8Array(128);
  nodeGraphChordMemoryClearPointerIds();
  if (momentary) {
    if (typeof syncNodeGraphKeyboardPolyphonyFromHeldNotes === "function") {
      syncNodeGraphKeyboardPolyphonyFromHeldNotes();
    }
    if (typeof renderNodeGraphMidiKeyboardHeldKeys === "function") {
      renderNodeGraphMidiKeyboardHeldKeys();
    }
    if (typeof renderNodeGraphMidiKeyboardActiveKeys === "function") {
      renderNodeGraphMidiKeyboardActiveKeys();
    }
    nodeGraphChordMemorySyncLiveAudio();
  } else if (had && Number.isFinite(slot) && slot >= 0 && slot <= 127) {
    const latched = nodeGraphChordMemoryLatchedSetFor(nodeId);
    if (!latched.has(slot)) {
      nodeGraphChordMemoryActivateSlot(nodeId, slot, false);
    }
  }
  if (pointerId != null && typeof document !== "undefined") {
    try {
      document.querySelectorAll(".node-midi-keyboard-surface, .node-grid-keyboard-surface")
        .forEach((el) => {
          try { el.releasePointerCapture?.(pointerId); } catch (_e) { /* ignore */ }
        });
    } catch (_e) { /* ignore */ }
  }
}

function nodeGraphChordMemoryEnsurePointerReleaseBound() {
  const host = nodeGraphChordMemoryHost();
  if (host._chordPointerReleaseBound) return;
  if (typeof window === "undefined" || typeof window.addEventListener !== "function") return;
  host._chordPointerReleaseBound = true;
  const end = (event) => {
    if (host.chordMemoryPlayPointerId == null) return;
    if (event && Number.isFinite(Number(event.pointerId))
      && event.pointerId !== host.chordMemoryPlayPointerId) return;
    nodeGraphChordMemoryReleasePointerPlay();
  };
  window.addEventListener("pointerup", end, true);
  window.addEventListener("pointercancel", end, true);
  window.addEventListener("lostpointercapture", end, true);
  window.addEventListener("blur", () => {
    if (host.chordMemoryPlayPointerId != null) nodeGraphChordMemoryReleasePointerPlay();
  });
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", () => {
      if (document.hidden && host.chordMemoryPlayPointerId != null) {
        nodeGraphChordMemoryReleasePointerPlay();
      }
    });
  }
}

/**
 * Key-down belongs to this keyboard. Drop its chord play / inlet latch and
 * VoiceManager notes that came from those ghost keys.
 */
function nodeGraphChordMemoryReleaseNode(nodeId) {
  const id = String(nodeId || "").trim();
  const host = nodeGraphChordMemoryHost();
  if (id && String(host.chordMemoryPlayPointerNodeId || "") === id) {
    nodeGraphChordMemoryReleasePointerPlay();
  }
  const prevPlay = host.chordMemoryPlayMask instanceof Uint8Array
    ? new Uint8Array(host.chordMemoryPlayMask)
    : (typeof noteMaskCreate === "function" ? noteMaskCreate() : new Uint8Array(128));
  const prevTable = (typeof nodeGraphMvp === "object" && nodeGraphMvp?.keyboardPolyphonyVelocities instanceof Uint8Array)
    ? new Uint8Array(nodeGraphMvp.keyboardPolyphonyVelocities)
    : null;
  const map = nodeGraphChordMemoryEnsureActiveMap();
  if (id) {
    map.delete(id);
    const latchedMap = nodeGraphChordMemoryEnsureLatchedMap();
    latchedMap.delete(id);
    if (host.chordMemoryPlayMaskByNode instanceof Map) host.chordMemoryPlayMaskByNode.delete(id);
    nodeGraphChordMemoryClearOutLatch(id);
    if (nodeGraphChordMemoryEditIs(id, host.chordMemoryEditSlot)) nodeGraphChordMemoryEditClear();
  } else {
    map.clear();
    nodeGraphChordMemoryEnsureLatchedMap().clear();
    if (host.chordMemoryPlayMaskByNode instanceof Map) host.chordMemoryPlayMaskByNode.clear();
    nodeGraphChordMemoryClearOutLatch("");
    nodeGraphChordMemoryEditClear();
    nodeGraphChordMemoryClearPointerIds();
  }
  const all = typeof noteMaskCreate === "function" ? noteMaskCreate() : new Uint8Array(128);
  if (host.chordMemoryPlayMaskByNode instanceof Map) {
    for (const m of host.chordMemoryPlayMaskByNode.values()) {
      if (!(m instanceof Uint8Array)) continue;
      for (let i = 0; i < 128; i += 1) {
        if (m[i]) all[i] = 1;
      }
    }
  }
  host.chordMemoryPlayMask = all;
  if (typeof syncNodeGraphKeyboardPolyphonyFromHeldNotes === "function") {
    syncNodeGraphKeyboardPolyphonyFromHeldNotes();
  }
  nodeGraphChordMemoryVoiceDelta(prevPlay, prevTable);
  if (typeof renderNodeGraphMidiKeyboardHeldKeys === "function") {
    renderNodeGraphMidiKeyboardHeldKeys();
  }
  if (typeof renderNodeGraphMidiKeyboardActiveKeys === "function") {
    renderNodeGraphMidiKeyboardActiveKeys();
  }
  if (typeof renderNodeGraphGridKeyboardPads === "function") {
    renderNodeGraphGridKeyboardPads();
  }
  nodeGraphChordMemorySyncLiveAudio();
}

function nodeGraphChordMemoryPlayTransmit(phase) {
  const mask = nodeGraphChordMemoryHost().chordMemoryPlayMask;
  if (typeof noteMaskTransmit === "function" && mask instanceof Uint8Array) {
    return noteMaskTransmit(mask, phase);
  }
  return 0;
}

function nodeGraphChordMemoryPlayTransmitForNode(nodeId, phase) {
  const mask = nodeGraphChordMemoryLiveMaskForNode(nodeId);
  if (typeof noteMaskTransmit === "function" && mask instanceof Uint8Array) {
    return noteMaskTransmit(mask, phase);
  }
  return 0;
}

function nodeGraphChordMemoryMaskHasNotes(mask) {
  if (!(mask instanceof Uint8Array)) return false;
  for (let i = 0; i < 128; i += 1) {
    if (mask[i]) return true;
  }
  return false;
}

function nodeGraphChordMemoryLiveMaskForNode(nodeId) {
  const host = nodeGraphChordMemoryHost();
  const id = String(nodeId || "").trim() || "__global__";
  const byNode = host.chordMemoryPlayMaskByNode;
  if (byNode instanceof Map && byNode.get(id) instanceof Uint8Array) return byNode.get(id);
  return host.chordMemoryPlayMask;
}

/**
 * Chord Memory OUT: live latched/inlet chord while it has notes.
 * Sequencer-rest latch only when live is empty, so arp keeps walking rests
 * without swallowing a user Alt/Ctrl latch.
 */
function nodeGraphChordMemoryOutMaskForNode(nodeId) {
  const live = nodeGraphChordMemoryLiveMaskForNode(nodeId);
  if (nodeGraphChordMemoryMaskHasNotes(live)) return live;
  const host = nodeGraphChordMemoryHost();
  const id = String(nodeId || "").trim() || "__global__";
  if (!(host.chordMemoryOutLatchByNode instanceof Map)) {
    host.chordMemoryOutLatchByNode = new Map();
  }
  const latch = host.chordMemoryOutLatchByNode.get(id);
  if (latch instanceof Uint8Array && nodeGraphChordMemoryMaskHasNotes(latch)) return latch;
  return live;
}

function nodeGraphChordMemoryOutTransmitForNode(nodeId, phase) {
  const mask = nodeGraphChordMemoryOutMaskForNode(nodeId);
  if (typeof noteMaskTransmit === "function" && mask instanceof Uint8Array) {
    return noteMaskTransmit(mask, phase);
  }
  return 0;
}

function nodeGraphChordMemoryClearOutLatch(nodeId) {
  const host = nodeGraphChordMemoryHost();
  if (!(host.chordMemoryOutLatchByNode instanceof Map)) return;
  const id = String(nodeId || "").trim();
  if (id) host.chordMemoryOutLatchByNode.delete(id);
  else host.chordMemoryOutLatchByNode.clear();
}

function nodeGraphChordMemorySlotBitsByNode() {
  const host = nodeGraphChordMemoryHost();
  const out = {};
  const map = host.chordMemoryActiveSlots;
  if (!(map instanceof Map)) return out;
  for (const [id, set] of map) {
    if (!(set instanceof Set) || !set.size) continue;
    out[String(id)] = [...set];
  }
  return out;
}

function nodeGraphChordMemorySoundingBitsByNode() {
  const host = nodeGraphChordMemoryHost();
  const out = {};
  const ids = new Set();
  const byNode = host.chordMemoryPlayMaskByNode;
  if (byNode instanceof Map) {
    for (const id of byNode.keys()) ids.add(String(id));
  }
  const active = host.chordMemoryActiveSlots;
  if (active instanceof Map) {
    for (const id of active.keys()) ids.add(String(id));
  }
  for (const id of ids) {
    const notes = nodeGraphChordMemorySoundingOfMask(nodeGraphChordMemoryLiveMaskForNode(id));
    if (notes.length) out[id] = notes;
  }
  return out;
}

function nodeGraphChordMemoryNoteIsSounding(nodeId, midi) {
  const m = Math.round(Number(midi));
  if (m < 0 || m > 127) return false;
  const id = String(nodeId || "").trim();
  if (id && typeof noteMaskGet === "function") {
    const mask = nodeGraphChordMemoryLiveMaskForNode(id);
    if (mask instanceof Uint8Array && noteMaskGet(mask, m)) return true;
  }
  const posted = typeof nodeGraphMvp === "object" ? nodeGraphMvp?._chordMemorySoundingByNode : null;
  if (posted && typeof posted === "object") {
    const list = (id && posted[id]) || posted.__global__;
    if (Array.isArray(list) && list.includes(m)) return true;
  }
  const all = nodeGraphChordMemoryHost().chordMemoryPlayMask;
  if (all instanceof Uint8Array && typeof noteMaskGet === "function") {
    return Boolean(noteMaskGet(all, m));
  }
  return false;
}

function nodeGraphChordMemorySlotIsOn(nodeId, midi) {
  const slot = Math.round(Number(midi));
  if (slot < 0 || slot > 127) return false;
  const id = String(nodeId || "").trim();
  if (id && nodeGraphChordMemoryActiveSetFor(id).has(slot)) return true;
  const posted = typeof nodeGraphMvp === "object" ? nodeGraphMvp?._chordMemorySlotBitsByNode : null;
  if (!posted || typeof posted !== "object") return false;
  const list = posted[id] || posted.__global__;
  return Array.isArray(list) && list.includes(slot);
}

/** Module faces stamp `data-node` (not data-node-id). Shells may use either. */
function nodeGraphChordMemoryNodeIdFromElement(el) {
  if (!el || typeof el.closest !== "function") return "";
  const root = el.closest("[data-node-id], [data-node], .dsp-node");
  if (!root) return "";
  return String(
    root.dataset?.nodeId
    || root.dataset?.node
    || root.getAttribute?.("data-node-id")
    || root.getAttribute?.("data-node")
    || "",
  ).trim();
}

function nodeGraphChordMemoryPaintKeys() {
  if (typeof document === "undefined" || typeof document.querySelectorAll !== "function") return;
  const cmMode = typeof nodeGraphMidiKeyboardMode === "function"
    && nodeGraphMidiKeyboardMode() === "chordMemory";
  document.querySelectorAll(".node-midi-keyboard-module [data-midi]").forEach((key) => {
    const nodeId = nodeGraphChordMemoryNodeIdFromElement(key);
    const midi = Number(key.dataset.midi);
    const editNote = cmMode && nodeGraphChordMemoryNoteIsEdit(nodeId, midi);
    key.classList.toggle("chord-memory", nodeGraphChordMemoryHasSlot(nodeId, midi));
    key.classList.toggle("slot-on", nodeGraphChordMemorySlotIsOn(nodeId, midi));
    key.classList.toggle("slot-edit", cmMode && nodeGraphChordMemoryEditIs(nodeId, midi));
    key.classList.toggle("chord-edit-note", editNote);
    key.classList.toggle("ghost-chord", !editNote && nodeGraphChordMemoryNoteIsSounding(nodeId, midi));
  });
  document.querySelectorAll(".node-grid-keyboard-pad[data-grid-midi]").forEach((pad) => {
    const nodeId = nodeGraphChordMemoryNodeIdFromElement(pad);
    const midi = Number(pad.dataset.gridMidi);
    const editNote = cmMode && nodeGraphChordMemoryNoteIsEdit(nodeId, midi);
    pad.classList.toggle("chord-memory", nodeGraphChordMemoryHasSlot(nodeId, midi));
    pad.classList.toggle("slot-on", nodeGraphChordMemorySlotIsOn(nodeId, midi));
    pad.classList.toggle("slot-edit", cmMode && nodeGraphChordMemoryEditIs(nodeId, midi));
    pad.classList.toggle("chord-edit-note", editNote);
    pad.classList.toggle("ghost-chord", !editNote && nodeGraphChordMemoryNoteIsSounding(nodeId, midi));
  });
}

/** Resolve keyboard/grid module id from a surface element. */
function nodeGraphChordMemoryNodeIdFromSurface(surface) {
  return nodeGraphChordMemoryNodeIdFromElement(surface);
}

/**
 * Shared pointer branch for Chord Memory gestures.
 * Returns true if the event was handled (caller should return).
 */
function nodeGraphChordMemoryHandlePointer(event, surface, midi, options = {}) {
  const nodeId = options.nodeId || nodeGraphChordMemoryNodeIdFromSurface(surface);
  const pointerId = event.pointerId;
  const host = nodeGraphChordMemoryHost();

  // Exclusive capture for momentary chord play (blue, unlatched).
  // Must run before the midi-finite check — pointerup can land off-key.
  // Window-level pointerup/cancel also call ReleasePointerPlay if this DOM
  // is rebuilt before the up event (that was the forever-stuck ghost keys).
  if (host.chordMemoryPlayPointerId != null) {
    if (event.type === "pointerdown" && host.chordMemoryPlayPointerId !== pointerId) {
      nodeGraphChordMemoryReleasePointerPlay();
    } else if (host.chordMemoryPlayPointerId === pointerId) {
      if (
        event.type === "pointerup"
        || event.type === "pointercancel"
        || event.type === "lostpointercapture"
      ) {
        nodeGraphChordMemoryReleasePointerPlay();
        event.preventDefault();
        return true;
      }
      event.preventDefault();
      return true;
    }
  }

  if (!nodeId || !Number.isFinite(Number(midi))) return false;
  const mode = typeof nodeGraphMidiKeyboardMode === "function"
    ? nodeGraphMidiKeyboardMode()
    : "slide";
  const slotMidi = Math.round(Number(midi));
  const hasChord = nodeGraphChordMemoryHasSlot(nodeId, slotMidi);

  if (event.type !== "pointerdown") return false;

  const altDown = Boolean(event.altKey || event.getModifierState?.("Alt"));

  // Chord Memory mode + Ctrl+Alt: delete that slot.
  if (event.ctrlKey && altDown && !event.shiftKey && mode === "chordMemory") {
    nodeGraphChordMemoryClearSlot(nodeId, slotMidi);
    event.preventDefault();
    return true;
  }

  const vel127 = nodeGraphChordMemoryStrikeVelocity127(event, surface);
  const noMods = !event.ctrlKey && !event.shiftKey && !altDown;

  if (mode === "chordMemory") {
    // Ctrl+click a stored chord: activate for red-key edit / deactivate.
    if (event.ctrlKey && !event.shiftKey && !altDown && hasChord) {
      nodeGraphChordMemoryToggleLatch(nodeId, slotMidi, vel127);
      event.preventDefault();
      return true;
    }
    // Ctrl+click a blank key: start/stop an empty edit chord. Gold is untouched.
    if (event.ctrlKey && !event.shiftKey && !altDown) {
      if (nodeGraphChordMemoryEditIs(nodeId, slotMidi)) {
        nodeGraphChordMemoryEditClear();
        if (typeof nodeGraphMvp === "object" && nodeGraphMvp) {
          nodeGraphMvp.midiKeyboardStatus = `chord edit off`;
        }
      } else {
        nodeGraphChordMemoryBeginBlankEdit(nodeId, slotMidi);
      }
      nodeGraphChordMemoryPaintKeys();
      if (typeof renderNodeGraphMidiKeyboardSignal === "function") {
        renderNodeGraphMidiKeyboardSignal(nodeGraphMvp?.keyboardModuleSignal || null);
      }
      event.preventDefault();
      return true;
    }
    // Alt+click: save current red/edit chord onto this key (never gold).
    if (altDown && !event.ctrlKey && !event.shiftKey) {
      nodeGraphChordMemorySaveCurrentEdit(nodeId, slotMidi, vel127);
      event.preventDefault();
      return true;
    }
    // Plain click: red edit tones when a chord is active for editing.
    // No edit target: green slot → momentary Play Keys chord; else single play key.
    if (noMods) {
      if (nodeGraphChordMemoryEditIs(nodeId, nodeGraphChordMemoryHost().chordMemoryEditSlot)) {
        nodeGraphChordMemoryToggleEditNote(nodeId, slotMidi, vel127);
        event.preventDefault();
        return true;
      }
      if (hasChord) {
        nodeGraphChordMemoryEnsurePointerReleaseBound();
        nodeGraphChordMemoryStartMomentaryPlay(nodeId, slotMidi, pointerId, vel127);
        try { surface.setPointerCapture?.(pointerId); } catch (_e) { /* ignore */ }
        event.preventDefault();
        return true;
      }
      return false;
    }
    event.preventDefault();
    return true;
  }

  // Non-Chord-Memory: Alt+click a stored chord latches Chord Memory OUT.
  if (altDown && !event.ctrlKey && !event.shiftKey && hasChord) {
    nodeGraphChordMemoryToggleLatch(nodeId, slotMidi, vel127);
    event.preventDefault();
    return true;
  }
  // Ctrl+click a stored chord: replace gold Arp Keys.
  if (event.ctrlKey && !event.shiftKey && !altDown && hasChord) {
    nodeGraphChordMemoryRecallToArp(nodeId, slotMidi);
    event.preventDefault();
    return true;
  }
  // Shift+click a stored chord: momentary Play Keys. Mouse up releases.
  if (event.shiftKey && !event.ctrlKey && !altDown && hasChord) {
    nodeGraphChordMemoryEnsurePointerReleaseBound();
    nodeGraphChordMemoryStartMomentaryPlay(nodeId, slotMidi, pointerId, vel127);
    try { surface.setPointerCapture?.(pointerId); } catch (_e) { /* ignore */ }
    event.preventDefault();
    return true;
  }

  return false;
}

/** Resolve slot map for a node id (main thread patch or worklet nodes Map). */
function nodeGraphChordMemorySlotsLookup(nodeId, nodesMap = null) {
  const id = String(nodeId || "").trim();
  if (!id) return {};
  if (nodesMap && typeof nodesMap.get === "function") {
    const node = nodesMap.get(id);
    if (node) return nodeGraphChordMemoryNormalizeSlots(node.chordMemory || {});
  }
  return nodeGraphChordMemorySlotsForNodeId(id);
}

/**
 * Worklet/main: apply Chord Memory IN mask.
 * `mask` = Uint8Array(128) of requested slots; activate while high.
 * Pass `nodesMap` from the worklet (`this.nodes`) so slots resolve off-main.
 */
function nodeGraphChordMemoryApplyInletMask(nodeId, mask, nodesMap = null) {
  const id = String(nodeId || "").trim();
  if (!id) return [];
  const next = mask instanceof Uint8Array ? mask : (typeof noteMaskCreate === "function" ? noteMaskCreate() : new Uint8Array(128));
  const slots = nodeGraphChordMemorySlotsLookup(id, nodesMap);
  const active = nodeGraphChordMemoryActiveSetFor(id);
  const prevActive = new Set(active);
  // Drop slots no longer held by inlet. Keep user-latched chords and the
  // pointer-held slot — those must survive mode changes and empty IN.
  const host = nodeGraphChordMemoryHost();
  const latched = nodeGraphChordMemoryLatchedSetFor(id);
  const pointerSlot = host.chordMemoryPlayPointerId != null
    ? Number(host.chordMemoryPlayPointerSlot)
    : NaN;
  // Sequencer Play Keys can overlap two notes; stacking both slots then
  // note-offing the first steals voices out from under the new chord.
  // Inlet drives at most the highest slot. User latches still merge.
  let inletSlot = -1;
  for (let i = 0; i < 128; i += 1) {
    if (next[i] > 0) inletSlot = i;
  }
  for (const slot of [...active]) {
    if (latched.has(slot)) continue;
    if (Number.isFinite(pointerSlot) && slot === pointerSlot) continue;
    if (slot !== inletSlot) active.delete(slot);
  }
  for (const slot of latched) {
    const notes = slots[String(slot)];
    if (Array.isArray(notes) && notes.length) active.add(slot);
  }
  if (inletSlot >= 0) {
    const notes = slots[String(inletSlot)];
    if (Array.isArray(notes) && notes.length) active.add(inletSlot);
  }
  const added = [];
  for (const slot of active) {
    if (!prevActive.has(slot)) added.push(slot);
  }
  // Rebuild play mask using slots lookup (worklet-safe).
  const play = typeof noteMaskCreate === "function" ? noteMaskCreate() : new Uint8Array(128);
  for (const slot of active) {
    const notes = slots[String(slot)] || nodeGraphChordMemoryNotesForSlot(id, slot);
    if (!Array.isArray(notes)) continue;
    for (const n of notes) {
      if (typeof noteMaskSet === "function") noteMaskSet(play, n, true);
      else if (n >= 0 && n < 128) play[n] = 1;
    }
  }
  if (!(host.chordMemoryPlayMaskByNode instanceof Map)) {
    host.chordMemoryPlayMaskByNode = new Map();
  }
  host.chordMemoryPlayMaskByNode.set(id, play);
  let inletOn = false;
  for (let i = 0; i < 128; i += 1) {
    if (next[i]) {
      inletOn = true;
      break;
    }
  }
  if (inletOn && nodeGraphChordMemoryMaskHasNotes(play)) {
    if (!(host.chordMemoryOutLatchByNode instanceof Map)) {
      host.chordMemoryOutLatchByNode = new Map();
    }
    host.chordMemoryOutLatchByNode.set(id, Uint8Array.from(play));
  }
  const all = typeof noteMaskCreate === "function" ? noteMaskCreate() : new Uint8Array(128);
  for (const m of host.chordMemoryPlayMaskByNode.values()) {
    if (!(m instanceof Uint8Array)) continue;
    for (let i = 0; i < 128; i += 1) {
      if (m[i]) all[i] = 1;
    }
  }
  host.chordMemoryPlayMask = all;
  return added;
}

if (typeof globalThis !== "undefined") {
  globalThis.NODE_GRAPH_CHORD_MEMORY_PORT = NODE_GRAPH_CHORD_MEMORY_PORT;
  globalThis.nodeGraphChordMemoryHost = nodeGraphChordMemoryHost;
  globalThis.nodeGraphChordMemoryNormalizeSlots = nodeGraphChordMemoryNormalizeSlots;
  globalThis.nodeGraphChordMemoryEnsureNode = nodeGraphChordMemoryEnsureNode;
  globalThis.nodeGraphChordMemoryHasSlot = nodeGraphChordMemoryHasSlot;
  globalThis.nodeGraphChordMemoryNotesForSlot = nodeGraphChordMemoryNotesForSlot;
  globalThis.nodeGraphChordMemorySaveFromArpMask = nodeGraphChordMemorySaveFromArpMask;
  globalThis.nodeGraphChordMemoryCurrentEditNotes = nodeGraphChordMemoryCurrentEditNotes;
  globalThis.nodeGraphChordMemorySaveCurrentEdit = nodeGraphChordMemorySaveCurrentEdit;
  globalThis.nodeGraphChordMemoryEditIs = nodeGraphChordMemoryEditIs;
  globalThis.nodeGraphChordMemoryEditClear = nodeGraphChordMemoryEditClear;
  globalThis.nodeGraphChordMemoryEditSet = nodeGraphChordMemoryEditSet;
  globalThis.nodeGraphChordMemoryBeginBlankEdit = nodeGraphChordMemoryBeginBlankEdit;
  globalThis.nodeGraphChordMemoryClearSlot = nodeGraphChordMemoryClearSlot;
  globalThis.nodeGraphChordMemoryRecallToArp = nodeGraphChordMemoryRecallToArp;
  globalThis.nodeGraphChordMemoryActivateSlot = nodeGraphChordMemoryActivateSlot;
  globalThis.nodeGraphChordMemoryToggleLatch = nodeGraphChordMemoryToggleLatch;
  globalThis.nodeGraphChordMemoryLatchedSetFor = nodeGraphChordMemoryLatchedSetFor;
  globalThis.nodeGraphChordMemorySyncLiveAudio = nodeGraphChordMemorySyncLiveAudio;
  globalThis.nodeGraphChordMemoryApplyLiveLatch = nodeGraphChordMemoryApplyLiveLatch;
  globalThis.nodeGraphChordMemoryToggleEditNote = nodeGraphChordMemoryToggleEditNote;
  globalThis.nodeGraphChordMemoryNoteIsEdit = nodeGraphChordMemoryNoteIsEdit;
  globalThis.nodeGraphChordMemoryMomentaryPlayTransmit = nodeGraphChordMemoryMomentaryPlayTransmit;
  globalThis.nodeGraphChordMemoryStartMomentaryPlay = nodeGraphChordMemoryStartMomentaryPlay;
  globalThis.nodeGraphChordMemoryReleasePointerPlay = nodeGraphChordMemoryReleasePointerPlay;
  globalThis.nodeGraphChordMemoryReleaseNode = nodeGraphChordMemoryReleaseNode;
  globalThis.nodeGraphChordMemoryPlayTransmit = nodeGraphChordMemoryPlayTransmit;
  globalThis.nodeGraphChordMemoryPlayTransmitForNode = nodeGraphChordMemoryPlayTransmitForNode;
  globalThis.nodeGraphChordMemoryLiveMaskForNode = nodeGraphChordMemoryLiveMaskForNode;
  globalThis.nodeGraphChordMemoryOutMaskForNode = nodeGraphChordMemoryOutMaskForNode;
  globalThis.nodeGraphChordMemoryOutTransmitForNode = nodeGraphChordMemoryOutTransmitForNode;
  globalThis.nodeGraphChordMemoryClearOutLatch = nodeGraphChordMemoryClearOutLatch;
  globalThis.nodeGraphChordMemorySlotBitsByNode = nodeGraphChordMemorySlotBitsByNode;
  globalThis.nodeGraphChordMemorySlotIsOn = nodeGraphChordMemorySlotIsOn;
  globalThis.nodeGraphChordMemoryPaintKeys = nodeGraphChordMemoryPaintKeys;
  globalThis.nodeGraphChordMemoryHandlePointer = nodeGraphChordMemoryHandlePointer;
  globalThis.nodeGraphChordMemoryApplyInletMask = nodeGraphChordMemoryApplyInletMask;
  globalThis.nodeGraphChordMemoryNodeIdFromSurface = nodeGraphChordMemoryNodeIdFromSurface;
}
