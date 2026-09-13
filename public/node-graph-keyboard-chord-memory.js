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
      chordMemoryPlayMask: null,
      chordMemoryPlayPointerId: null,
      chordMemoryPlayPointerSlot: null,
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

/** Delete the chord stored on this key (green slot). */
function nodeGraphChordMemoryClearSlot(nodeId, midi) {
  const slot = Math.round(Number(midi));
  if (slot < 0 || slot > 127) return false;
  const node = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
  if (!node) return false;
  const mem = nodeGraphChordMemoryEnsureNode(node);
  if (!mem.slots[String(slot)]) return false;
  delete mem.slots[String(slot)];
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

function nodeGraphChordMemoryActivateSlot(nodeId, midi, on) {
  const slot = Math.round(Number(midi));
  if (slot < 0 || slot > 127) return false;
  if (on && !nodeGraphChordMemoryHasSlot(nodeId, slot)) return false;
  const active = nodeGraphChordMemoryActiveSetFor(nodeId);
  if (on) active.add(slot);
  else active.delete(slot);
  nodeGraphChordMemoryRebuildPlayMask(nodeId);
  if (typeof sendNodeGraphLiveMidiPlayKeysBitmask === "function") {
    // Merge chord play into the live play mask push path via dedicated transmit.
    // Evaluators OR chordMemoryPlayMask; also nudge face paint.
  }
  if (typeof renderNodeGraphMidiKeyboardHeldKeys === "function") {
    renderNodeGraphMidiKeyboardHeldKeys();
  }
  if (typeof renderNodeGraphMidiKeyboardActiveKeys === "function") {
    renderNodeGraphMidiKeyboardActiveKeys();
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
  });
  document.querySelectorAll(".node-grid-keyboard-pad[data-grid-midi]").forEach((pad) => {
    const nodeId = nodeGraphChordMemoryNodeIdFromElement(pad);
    const midi = Number(pad.dataset.gridMidi);
    pad.classList.toggle("chord-memory", nodeGraphChordMemoryHasSlot(nodeId, midi));
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
  if (!nodeId || !Number.isFinite(Number(midi))) return false;
  const mode = typeof nodeGraphMidiKeyboardMode === "function"
    ? nodeGraphMidiKeyboardMode()
    : "slide";
  const slotMidi = Math.round(Number(midi));
  const hasChord = nodeGraphChordMemoryHasSlot(nodeId, slotMidi);
  const pointerId = event.pointerId;

  // Exclusive capture for shift-momentary chord play.
  if (nodeGraphMvp?.chordMemoryPlayPointerId === pointerId) {
    if (event.type === "pointerup" || event.type === "pointercancel") {
      const heldSlot = Number(nodeGraphMvp.chordMemoryPlayPointerSlot);
      nodeGraphChordMemoryActivateSlot(nodeId, heldSlot, false);
      nodeGraphMvp.chordMemoryPlayPointerId = null;
      nodeGraphMvp.chordMemoryPlayPointerSlot = null;
      try { surface.releasePointerCapture?.(pointerId); } catch (_e) { /* ignore */ }
      event.preventDefault();
      return true;
    }
    event.preventDefault();
    return true;
  }

  if (event.type !== "pointerdown") return false;

  const altDown = Boolean(event.altKey || event.getModifierState?.("Alt"));

  // Chord Memory mode + Ctrl+Alt on a green key: delete that slot.
  if (event.ctrlKey && altDown && !event.shiftKey && mode === "chordMemory" && hasChord) {
    nodeGraphChordMemoryClearSlot(nodeId, slotMidi);
    event.preventDefault();
    return true;
  }

  // Alt+click in ChordMemory mode: save / clear from gold arp.
  // Use altKey || metaKey — some platforms report Option as alt.
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
      // Refresh status line on the face.
      renderNodeGraphMidiKeyboardSignal(nodeGraphMvp?.keyboardModuleSignal || null);
    }
    event.preventDefault();
    return true;
  }

  // Ctrl+click on a key that is already gold: toggle it off (same as normal
  // arp latch). Do not recall — that stole individual note-off after a chord.
  if (event.ctrlKey && !event.shiftKey && !altDown) {
    const mask = typeof nodeGraphMvp === "object" ? nodeGraphMvp.midiKeyboardArpMask : null;
    const alreadyHeld = typeof noteMaskGet === "function" && mask instanceof Uint8Array
      ? noteMaskGet(mask, slotMidi)
      : false;
    if (alreadyHeld) {
      if (typeof options.onArpToggle === "function") options.onArpToggle(slotMidi, event);
      event.preventDefault();
      return true;
    }
    if (hasChord) {
      if (typeof nodeGraphMidiKeyboardClearPlayGate === "function") {
        nodeGraphMidiKeyboardClearPlayGate("chord → arp");
      }
      nodeGraphChordMemoryRecallToArp(nodeId, slotMidi);
      event.preventDefault();
      return true;
    }
  }

  // Shift+click on chord key: momentary Play Keys (mode on or off).
  if (event.shiftKey && !event.ctrlKey && !event.altKey && hasChord) {
    nodeGraphMvp.chordMemoryPlayPointerId = pointerId;
    nodeGraphMvp.chordMemoryPlayPointerSlot = slotMidi;
    nodeGraphChordMemoryActivateSlot(nodeId, slotMidi, true);
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
  globalThis.nodeGraphChordMemoryClearSlot = nodeGraphChordMemoryClearSlot;
  globalThis.nodeGraphChordMemoryRecallToArp = nodeGraphChordMemoryRecallToArp;
  globalThis.nodeGraphChordMemoryActivateSlot = nodeGraphChordMemoryActivateSlot;
  globalThis.nodeGraphChordMemoryPlayTransmit = nodeGraphChordMemoryPlayTransmit;
  globalThis.nodeGraphChordMemoryPaintKeys = nodeGraphChordMemoryPaintKeys;
  globalThis.nodeGraphChordMemoryHandlePointer = nodeGraphChordMemoryHandlePointer;
  globalThis.nodeGraphChordMemoryApplyInletMask = nodeGraphChordMemoryApplyInletMask;
  globalThis.nodeGraphChordMemoryNodeIdFromSurface = nodeGraphChordMemoryNodeIdFromSurface;
}
