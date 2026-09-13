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

function nodeGraphChordMemoryNotesForSlot(nodeId, midi) {
  const slot = Math.round(Number(midi));
  if (slot < 0 || slot > 127) return [];
  const notes = nodeGraphChordMemorySlotsForNodeId(nodeId)[String(slot)];
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

function nodeGraphChordMemoryEditSet(nodeId, midi) {
  const host = nodeGraphChordMemoryHost();
  host.chordMemoryEditNodeId = String(nodeId || "").trim();
  host.chordMemoryEditSlot = Math.round(Number(midi));
}

/** While a slot is selected for edit, gold latch writes through to that slot. */
function nodeGraphChordMemoryAutosaveEdit() {
  const host = nodeGraphChordMemoryHost();
  const nodeId = String(host.chordMemoryEditNodeId || "").trim();
  const slot = Number(host.chordMemoryEditSlot);
  if (!nodeId || !Number.isFinite(slot) || slot < 0 || slot > 127) return false;
  const ok = nodeGraphChordMemorySaveFromArpMask(nodeId, slot);
  nodeGraphChordMemoryPaintKeys();
  if (typeof renderNodeGraphGridKeyboardPads === "function") {
    renderNodeGraphGridKeyboardPads();
  }
  return ok;
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

/** VoiceManager follows the polyphony table; send the chord-tone delta. */
function nodeGraphChordMemoryVoiceDelta(prevPlayMask, prevTable) {
  const nextPlay = nodeGraphChordMemoryHost().chordMemoryPlayMask;
  const nextTable = (typeof nodeGraphMvp === "object" && nodeGraphMvp)
    ? nodeGraphMvp.keyboardPolyphonyVelocities
    : null;
  const wasOn = (midi) => prevTable instanceof Uint8Array && (prevTable[midi] | 0) > 0;
  const stillOn = (midi) => nextTable instanceof Uint8Array && (nextTable[midi] | 0) > 0;
  for (const midi of nodeGraphChordMemorySoundingOfMask(nextPlay)) {
    if (wasOn(midi)) continue;
    const vel = stillOn(midi) ? (nextTable[midi] | 0) : 100;
    if (typeof sendNodeGraphLiveVmNoteOn === "function") {
      sendNodeGraphLiveVmNoteOn(midi, vel / 127);
    }
  }
  for (const midi of nodeGraphChordMemorySoundingOfMask(prevPlayMask)) {
    if (stillOn(midi)) continue;
    if (typeof sendNodeGraphLiveVmNoteOff === "function") {
      sendNodeGraphLiveVmNoteOff(midi);
    }
  }
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
  return true;
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

/** Chord Memory OUT: last non-empty inlet expansion, so arp keeps walking during sequencer rests. */
function nodeGraphChordMemoryOutMaskForNode(nodeId) {
  const host = nodeGraphChordMemoryHost();
  const id = String(nodeId || "").trim() || "__global__";
  if (!(host.chordMemoryOutLatchByNode instanceof Map)) {
    host.chordMemoryOutLatchByNode = new Map();
  }
  const latch = host.chordMemoryOutLatchByNode.get(id);
  if (latch instanceof Uint8Array && nodeGraphChordMemoryMaskHasNotes(latch)) return latch;
  return nodeGraphChordMemoryLiveMaskForNode(id);
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
  const latch = host.chordMemoryOutLatchByNode;
  if (latch instanceof Map) {
    for (const id of latch.keys()) ids.add(String(id));
  }
  for (const id of ids) {
    const notes = nodeGraphChordMemorySoundingOfMask(nodeGraphChordMemoryOutMaskForNode(id));
    if (notes.length) out[id] = notes;
  }
  return out;
}

function nodeGraphChordMemoryNoteIsSounding(nodeId, midi) {
  const m = Math.round(Number(midi));
  if (m < 0 || m > 127) return false;
  const id = String(nodeId || "").trim();
  if (id && typeof noteMaskGet === "function") {
    const mask = nodeGraphChordMemoryOutMaskForNode(id);
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
  document.querySelectorAll(".node-midi-keyboard-module [data-midi]").forEach((key) => {
    const nodeId = nodeGraphChordMemoryNodeIdFromElement(key);
    const midi = Number(key.dataset.midi);
    key.classList.toggle("chord-memory", nodeGraphChordMemoryHasSlot(nodeId, midi));
    key.classList.toggle("slot-on", nodeGraphChordMemorySlotIsOn(nodeId, midi));
    key.classList.toggle("slot-edit", nodeGraphChordMemoryEditIs(nodeId, midi));
    key.classList.toggle("ghost-chord", nodeGraphChordMemoryNoteIsSounding(nodeId, midi));
  });
  document.querySelectorAll(".node-grid-keyboard-pad[data-grid-midi]").forEach((pad) => {
    const nodeId = nodeGraphChordMemoryNodeIdFromElement(pad);
    const midi = Number(pad.dataset.gridMidi);
    pad.classList.toggle("chord-memory", nodeGraphChordMemoryHasSlot(nodeId, midi));
    pad.classList.toggle("slot-on", nodeGraphChordMemorySlotIsOn(nodeId, midi));
    pad.classList.toggle("slot-edit", nodeGraphChordMemoryEditIs(nodeId, midi));
    pad.classList.toggle("ghost-chord", nodeGraphChordMemoryNoteIsSounding(nodeId, midi));
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

  // Exclusive capture for shift-momentary chord play (blue, unlatched).
  // Must run before the midi-finite check — pointerup can land off-key.
  if (host.chordMemoryPlayPointerId === pointerId) {
    if (event.type === "pointerup" || event.type === "pointercancel") {
      const heldSlot = Number(host.chordMemoryPlayPointerSlot);
      const heldNode = host.chordMemoryPlayPointerNodeId || nodeId;
      nodeGraphChordMemoryActivateSlot(heldNode, heldSlot, false);
      host.chordMemoryPlayPointerId = null;
      host.chordMemoryPlayPointerSlot = null;
      host.chordMemoryPlayPointerNodeId = null;
      try { surface.releasePointerCapture?.(pointerId); } catch (_e) { /* ignore */ }
      event.preventDefault();
      return true;
    }
    event.preventDefault();
    return true;
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

  // Alt+click in Chord Memory mode: save current gold into this key.
  if ((event.altKey || event.metaKey) && !event.ctrlKey && mode === "chordMemory") {
    const ok = nodeGraphChordMemorySaveFromArpMask(nodeId, slotMidi);
    nodeGraphChordMemoryPaintKeys();
    if (typeof nodeGraphMvp === "object" && nodeGraphMvp) {
      const saved = nodeGraphChordMemoryHasSlot(nodeId, slotMidi);
      nodeGraphMvp.midiKeyboardStatus = !ok
        ? "chord save failed"
        : (saved ? `chord saved @ ${slotMidi}` : `chord cleared @ ${slotMidi}`);
    }
    if (typeof renderNodeGraphMidiKeyboardSignal === "function") {
      renderNodeGraphMidiKeyboardSignal(nodeGraphMvp?.keyboardModuleSignal || null);
    }
    event.preventDefault();
    return true;
  }

  function recallGreenSlot() {
    if (typeof nodeGraphMidiKeyboardClearPlayGate === "function") {
      nodeGraphMidiKeyboardClearPlayGate("chord → arp");
    }
    nodeGraphChordMemoryRecallToArp(nodeId, slotMidi);
  }

  // Slide/Press/Hold/Toggle: Alt+click a green slot replaces gold held keys.
  // Ctrl stays gold latch in these modes, so recall cannot live on Ctrl.
  if (mode !== "chordMemory" && altDown && !event.ctrlKey && !event.shiftKey && hasChord) {
    recallGreenSlot();
    event.preventDefault();
    return true;
  }

  // Chord Memory mode: Ctrl+click selects a slot for gold edit (latch + highlight).
  // Ctrl+click the same slot again to deselect. Plain click still toggles gold;
  // those changes autosave into the highlighted slot.
  if (mode === "chordMemory" && event.ctrlKey && !event.shiftKey && !altDown) {
    if (nodeGraphChordMemoryEditIs(nodeId, slotMidi)) {
      nodeGraphChordMemoryEditClear();
      if (typeof nodeGraphMvp === "object" && nodeGraphMvp) {
        nodeGraphMvp.midiKeyboardStatus = `chord edit off`;
      }
    } else if (hasChord) {
      recallGreenSlot();
      nodeGraphChordMemoryEditSet(nodeId, slotMidi);
      if (typeof nodeGraphMvp === "object" && nodeGraphMvp) {
        nodeGraphMvp.midiKeyboardStatus = `editing chord @ ${slotMidi}`;
      }
    } else {
      nodeGraphChordMemorySaveFromArpMask(nodeId, slotMidi);
      nodeGraphChordMemoryEditSet(nodeId, slotMidi);
      if (typeof nodeGraphMvp === "object" && nodeGraphMvp) {
        nodeGraphMvp.midiKeyboardStatus = `editing chord @ ${slotMidi}`;
      }
    }
    nodeGraphChordMemoryPaintKeys();
    if (typeof renderNodeGraphMidiKeyboardSignal === "function") {
      renderNodeGraphMidiKeyboardSignal(nodeGraphMvp?.keyboardModuleSignal || null);
    }
    event.preventDefault();
    return true;
  }

  // Shift+click on a green slot: momentary blue Play Keys through Polyphony.
  // Not gold / not latched — release the pointer and the chord stops.
  if (event.shiftKey && !event.ctrlKey && !event.altKey && hasChord) {
    host.chordMemoryPlayPointerId = pointerId;
    host.chordMemoryPlayPointerSlot = slotMidi;
    host.chordMemoryPlayPointerNodeId = nodeId;
    nodeGraphChordMemoryActivateSlot(
      nodeId,
      slotMidi,
      true,
      nodeGraphChordMemoryStrikeVelocity127(event, surface),
    );
    try { surface.setPointerCapture?.(pointerId); } catch (_e) { /* ignore */ }
    event.preventDefault();
    return true;
  }

  // ChordMemory mode + normal click: toggle gold arp (like toggle mode).
  if (
    mode === "chordMemory"
    && !event.ctrlKey
    && !event.shiftKey
    && !event.altKey
  ) {
    if (typeof options.onArpToggle === "function") {
      options.onArpToggle(slotMidi, event);
    }
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
  if (!id) return;
  const next = mask instanceof Uint8Array ? mask : (typeof noteMaskCreate === "function" ? noteMaskCreate() : new Uint8Array(128));
  const slots = nodeGraphChordMemorySlotsLookup(id, nodesMap);
  const active = nodeGraphChordMemoryActiveSetFor(id);
  // Drop slots no longer held by inlet (keep pointer-held slots).
  const host = nodeGraphChordMemoryHost();
  const pointerSlot = host.chordMemoryPlayPointerId != null
    ? Number(host.chordMemoryPlayPointerSlot)
    : NaN;
  for (const slot of [...active]) {
    if (Number.isFinite(pointerSlot) && slot === pointerSlot) continue;
    if (!(next[slot] > 0)) active.delete(slot);
  }
  for (let i = 0; i < 128; i += 1) {
    if (!(next[i] > 0)) continue;
    const notes = slots[String(i)];
    if (!Array.isArray(notes) || !notes.length) continue;
    active.add(i);
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
}

if (typeof globalThis !== "undefined") {
  globalThis.NODE_GRAPH_CHORD_MEMORY_PORT = NODE_GRAPH_CHORD_MEMORY_PORT;
  globalThis.nodeGraphChordMemoryHost = nodeGraphChordMemoryHost;
  globalThis.nodeGraphChordMemoryNormalizeSlots = nodeGraphChordMemoryNormalizeSlots;
  globalThis.nodeGraphChordMemoryEnsureNode = nodeGraphChordMemoryEnsureNode;
  globalThis.nodeGraphChordMemoryHasSlot = nodeGraphChordMemoryHasSlot;
  globalThis.nodeGraphChordMemoryNotesForSlot = nodeGraphChordMemoryNotesForSlot;
  globalThis.nodeGraphChordMemorySaveFromArpMask = nodeGraphChordMemorySaveFromArpMask;
  globalThis.nodeGraphChordMemoryAutosaveEdit = nodeGraphChordMemoryAutosaveEdit;
  globalThis.nodeGraphChordMemoryEditIs = nodeGraphChordMemoryEditIs;
  globalThis.nodeGraphChordMemoryEditClear = nodeGraphChordMemoryEditClear;
  globalThis.nodeGraphChordMemoryClearSlot = nodeGraphChordMemoryClearSlot;
  globalThis.nodeGraphChordMemoryRecallToArp = nodeGraphChordMemoryRecallToArp;
  globalThis.nodeGraphChordMemoryActivateSlot = nodeGraphChordMemoryActivateSlot;
  globalThis.nodeGraphChordMemoryPlayTransmit = nodeGraphChordMemoryPlayTransmit;
  globalThis.nodeGraphChordMemoryPlayTransmitForNode = nodeGraphChordMemoryPlayTransmitForNode;
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
