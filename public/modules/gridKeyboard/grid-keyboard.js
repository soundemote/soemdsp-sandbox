// Grid Keyboard — Array mbira layout (Bill Wesley).
// Columns: circle of fifths starting at F. Rows: octaves, bottom = low.

const NODE_GRAPH_GRID_KEYBOARD_FIFTHS_FROM_F = Object.freeze([
  5, 0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10,
]);
const NODE_GRAPH_GRID_KEYBOARD_COLS = 12;
const NODE_GRAPH_GRID_KEYBOARD_ROWS = 11;
const NODE_GRAPH_GRID_KEYBOARD_PC_NAMES = Object.freeze([
  "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B",
]);

function nodeGraphGridKeyboardMidiAt(col, row) {
  const c = Math.max(0, Math.min(NODE_GRAPH_GRID_KEYBOARD_COLS - 1, col | 0));
  const r = Math.max(0, Math.min(NODE_GRAPH_GRID_KEYBOARD_ROWS - 1, row | 0));
  const pc = NODE_GRAPH_GRID_KEYBOARD_FIFTHS_FROM_F[c];
  const midi = pc + 12 * r;
  return midi >= 0 && midi <= 127 ? midi : -1;
}

/** Unclamped sounding MIDI. ShiftMidi clamps to 0, which turns low F into C. */
function nodeGraphGridKeyboardSoundingMidi(rawMidi, octave) {
  const oct = Number.isFinite(Number(octave)) ? Math.round(Number(octave)) : 0;
  return Math.round(Number(rawMidi)) + oct * 12;
}

function nodeGraphGridKeyboardPadInRange(rawMidi, octave) {
  const sounding = nodeGraphGridKeyboardSoundingMidi(rawMidi, octave);
  return sounding >= 0 && sounding <= 127;
}

function nodeGraphGridKeyboardXY(col, row) {
  return {
    x: col / Math.max(1, NODE_GRAPH_GRID_KEYBOARD_COLS - 1),
    y: row / Math.max(1, NODE_GRAPH_GRID_KEYBOARD_ROWS - 1),
  };
}

function nodeGraphGridKeyboardPadFromPointer(event, surface) {
  const raw = event.target?.closest?.("[data-grid-midi]");
  if (raw && surface.contains(raw) && Number(raw.dataset.gridMidi) >= 0) {
    return raw;
  }
  const x = event.clientX;
  const y = event.clientY;
  const pads = surface.querySelectorAll("[data-grid-midi]");
  for (let i = 0; i < pads.length; i += 1) {
    const el = pads[i];
    if (Number(el.dataset.gridMidi) < 0) continue;
    const r = el.getBoundingClientRect();
    if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return el;
  }
  return null;
}

function nodeGraphGridKeyboardSignalFromPad(pad, event, options = {}) {
  const col = Number(pad.dataset.gridCol);
  const row = Number(pad.dataset.gridRow);
  const rawMidi = Number(pad.dataset.gridMidi);
  const { x, y } = nodeGraphGridKeyboardXY(col, row);
  const gate = event.buttons > 0 || event.type === "pointerdown" ? 1 : 0;
  const strike = 1;
  const refreshVelocity = options.refreshVelocity === true
    || event.type === "pointerdown"
    || options.gatePulse === true;
  const rawStrike = refreshVelocity
    ? strike
    : (Number(nodeGraphMvp.keyboardModuleSignal?._strikeVelocity) > 0
      ? Number(nodeGraphMvp.keyboardModuleSignal._strikeVelocity)
      : strike);
  const velocity = typeof nodeGraphMidiKeyboardMapStrikeVelocity01 === "function"
    ? nodeGraphMidiKeyboardMapStrikeVelocity01(rawStrike)
    : rawStrike;
  const signal = nodeGraphMidiKeyboardSignalFromRaw(rawMidi, {
    source: "pointer",
    gate,
    gatePulse: options.gatePulse === true || (gate && event.type === "pointerdown") ? 1 : 0,
    x,
    y,
    velocity,
  });
  signal._strikeVelocity = rawStrike;
  signal._gridCol = col;
  signal._gridRow = row;
  return signal;
}

function nodeGraphMidiKeyboardGoldMidiIsOn(midi) {
  const m = Math.round(Number(midi));
  if (m < 0 || m > 127) return false;
  if (typeof noteMaskGet === "function" && nodeGraphMvp?.midiKeyboardArpMask instanceof Uint8Array) {
    return noteMaskGet(nodeGraphMvp.midiKeyboardArpMask, m);
  }
  const mask = nodeGraphMvp?.midiKeyboardArpMask;
  return mask instanceof Uint8Array && Boolean(mask[m]);
}

function createNodeGraphGridKeyboardBody(node = null) {
  const section = document.createElement("section");
  section.className = "node-grid-keyboard-panel node-grid-keyboard-module node-module-face";
  section.dataset.moduleBand = "face";
  if (node) section.dataset.node = node;
  section.setAttribute("aria-label", "Grid Keyboard");

  const heading = document.createElement("div");
  heading.className = "node-midi-keyboard-heading";
  const controls = document.createElement("div");
  controls.className = "node-midi-keyboard-midi-controls";
  const modeLabel = typeof createNodeGraphMidiModeControl === "function"
    ? createNodeGraphMidiModeControl()
    : document.createElement("span");
  const octave = typeof createNodeGraphPlusMinusControl === "function"
    ? createNodeGraphPlusMinusControl({
      ariaLabel: "Keyboard octave transpose",
      downKey: "midiKeyboardOctaveDown",
      valueKey: "midiKeyboardOctaveValue",
      upKey: "midiKeyboardOctaveUp",
      downAria: "Transpose keyboard down one octave",
      upAria: "Transpose keyboard up one octave",
      valueText: "+0",
    })
    : document.createElement("span");
  const liveReadouts = document.createElement("span");
  liveReadouts.className = "node-midi-keyboard-live-readouts";
  liveReadouts.setAttribute("aria-live", "polite");
  for (const [key, labelText, valueText] of [
    ["frequency", "freq", "-"],
    ["pitch", "pitch", "-"],
    ["midi", "midi", "-"],
    ["x", "x", "0.000"],
    ["y", "y", "0.000"],
    ["velocity", "vel", "-"],
  ]) {
    const item = document.createElement("span");
    item.append(document.createTextNode(`${labelText} `));
    const value = document.createElement("strong");
    value.dataset.keyboardSignal = key;
    value.textContent = valueText;
    item.append(value);
    liveReadouts.append(item);
  }
  const velRow = document.createElement("div");
  velRow.className = "node-midi-keyboard-vel-range";
  const velMinLabel = document.createElement("label");
  velMinLabel.className = "node-midi-keyboard-vel-field";
  const velMinCaption = document.createElement("span");
  velMinCaption.textContent = "Vel Min";
  const velMinInput = document.createElement("input");
  velMinInput.type = "number";
  velMinInput.min = "0";
  velMinInput.max = "127";
  velMinInput.step = "1";
  velMinInput.dataset.midiKeyboardVelMin = "true";
  velMinInput.value = "127";
  velMinLabel.append(velMinCaption, velMinInput);
  const velMaxLabel = document.createElement("label");
  velMaxLabel.className = "node-midi-keyboard-vel-field";
  const velMaxCaption = document.createElement("span");
  velMaxCaption.textContent = "Vel Max";
  const velMaxInput = document.createElement("input");
  velMaxInput.type = "number";
  velMaxInput.min = "0";
  velMaxInput.max = "127";
  velMaxInput.step = "1";
  velMaxInput.dataset.midiKeyboardVelMax = "true";
  velMaxInput.value = "127";
  velMaxLabel.append(velMaxCaption, velMaxInput);
  velRow.append(velMinLabel, velMaxLabel);
  controls.append(modeLabel, octave, liveReadouts);
  heading.append(controls, velRow);

  const performance = document.createElement("div");
  performance.className = "node-grid-keyboard-performance";
  const surface = document.createElement("div");
  surface.className = "node-grid-keyboard-surface";
  surface.setAttribute("aria-label", "Array grid keyboard");
  surface.style.gridTemplateColumns = `repeat(${NODE_GRAPH_GRID_KEYBOARD_COLS}, minmax(0, 1fr))`;
  surface.style.gridTemplateRows = `repeat(${NODE_GRAPH_GRID_KEYBOARD_ROWS}, minmax(0, 1fr))`;
  performance.append(surface);

  const signalBar = document.createElement("div");
  signalBar.className = "node-midi-keyboard-signal-bar";
  signalBar.dataset.midiKeyboardSignalBar = "true";
  for (const [key, labelText, valueText] of [
    ["gate", "Gate", "0"],
    ["gatePulse", "Trigger", "0"],
    ["octave", "Octave", "+0"],
    ["frequency", "ƒ", "-"],
    ["x", "X", "0.000"],
    ["y", "Y", "0.000"],
  ]) {
    const item = document.createElement("span");
    item.append(document.createTextNode(`${labelText} `));
    const value = document.createElement("strong");
    value.dataset.keyboardSignal = key;
    value.textContent = valueText;
    item.append(value);
    signalBar.append(item);
  }

  section.append(heading, performance, signalBar);
  return section;
}

function nodeGraphGridKeyboardFillSurface(surface, octave) {
  const black = typeof nodeGraphMidiKeyboardBlackPitchClasses !== "undefined"
    ? nodeGraphMidiKeyboardBlackPitchClasses
    : new Set([1, 3, 6, 8, 10]);
  surface.replaceChildren();
  surface.dataset.gridOctave = String(octave);
  for (let row = 0; row < NODE_GRAPH_GRID_KEYBOARD_ROWS; row += 1) {
    for (let col = 0; col < NODE_GRAPH_GRID_KEYBOARD_COLS; col += 1) {
      const layoutMidi = nodeGraphGridKeyboardMidiAt(col, row);
      if (layoutMidi < 0) continue;
      const midi = nodeGraphGridKeyboardSoundingMidi(layoutMidi, octave);
      if (midi < 0 || midi > 127) continue;
      const pad = document.createElement("button");
      pad.type = "button";
      pad.className = "node-grid-keyboard-pad";
      pad.dataset.gridCol = String(col);
      pad.dataset.gridRow = String(row);
      pad.dataset.gridMidi = String(midi);
      pad.style.gridColumn = String(col + 1);
      pad.style.gridRow = String(NODE_GRAPH_GRID_KEYBOARD_ROWS - row);
      const pc = ((midi % 12) + 12) % 12;
      if (black.has(pc)) pad.classList.add("black-pc");
      pad.textContent = typeof nodeGraphMidiKeyboardPitchLabel === "function"
        ? nodeGraphMidiKeyboardPitchLabel(midi)
        : (NODE_GRAPH_GRID_KEYBOARD_PC_NAMES[pc] || "");
      surface.append(pad);
    }
  }
}

function renderNodeGraphGridKeyboardPads() {
  const octave = typeof nodeGraphMidiKeyboardOctaveOffset === "function"
    ? nodeGraphMidiKeyboardOctaveOffset()
    : 0;
  const playing = Number(nodeGraphMvp?.keyboardModuleSignal?.gate) > 0
    ? Number(nodeGraphMvp.keyboardModuleSignal.midi)
    : NaN;
  document.querySelectorAll(".node-grid-keyboard-surface").forEach((surface) => {
    if (surface.dataset.gridOctave !== String(octave)) {
      nodeGraphGridKeyboardFillSurface(surface, octave);
    }
    surface.querySelectorAll(".node-grid-keyboard-pad[data-grid-midi]").forEach((pad) => {
      const midi = Number(pad.dataset.gridMidi);
      if (!(midi >= 0 && midi <= 127)) return;
      const goldOn = nodeGraphMidiKeyboardGoldMidiIsOn(midi);
      pad.classList.toggle("held", goldOn);
      pad.classList.toggle("active", Number.isFinite(playing) && playing === midi);
      const momMask = typeof nodeGraphChordMemoryHost === "function"
        ? nodeGraphChordMemoryHost()?.chordMemoryMomentaryPlayMask
        : null;
      const midiPlay = nodeGraphMvp?.midiKeyboardPlayMask;
      const playGhost = typeof noteMaskGet === "function"
        && ((momMask instanceof Uint8Array && noteMaskGet(momMask, midi))
          || (midiPlay instanceof Uint8Array && noteMaskGet(midiPlay, midi)));
      const arpGhost = goldOn;
      pad.classList.toggle("ghost-play", Boolean(playGhost) && !goldOn);
      pad.classList.toggle("ghost-arp", Boolean(arpGhost) && !goldOn);
    });
  });
  if (typeof nodeGraphChordMemoryPaintKeys === "function") {
    nodeGraphChordMemoryPaintKeys();
  }
}

function updateNodeGraphGridKeyboardSignal(event) {
  const surface = event.currentTarget;
  if (!surface) return;
  const mode = typeof nodeGraphMidiKeyboardMode === "function"
    ? nodeGraphMidiKeyboardMode()
    : "press";
  const pointerId = event.pointerId;
  const pad = nodeGraphGridKeyboardPadFromPointer(event, surface);

  const altDown = Boolean(event.altKey || event.getModifierState?.("Alt"));

  if (typeof nodeGraphChordMemoryHandlePointer === "function") {
    const midi = pad ? Number(pad.dataset.gridMidi) : NaN;
    const nodeId = typeof nodeGraphChordMemoryNodeIdFromSurface === "function"
      ? nodeGraphChordMemoryNodeIdFromSurface(surface)
      : "";
    if (nodeGraphChordMemoryHandlePointer(event, surface, midi, {
      nodeId,
      onArpToggle: (slotMidi) => {
        if (typeof nodeGraphMidiKeyboardToggleHeldMidi === "function") {
          nodeGraphMidiKeyboardToggleHeldMidi(slotMidi, 1);
        }
      },
    })) {
      return;
    }
  }

  if (event.type === "pointerdown" && event.ctrlKey && altDown) {
    if (typeof nodeGraphMidiKeyboardClearArpKeys === "function") {
      nodeGraphMidiKeyboardClearArpKeys();
    }
    if (typeof nodeGraphMidiKeyboardClearPlayGate === "function") {
      nodeGraphMidiKeyboardClearPlayGate("arp clear");
    }
    event.preventDefault();
    event.stopPropagation();
    return;
  }

  if (event.type === "pointerdown" && event.ctrlKey) {
    nodeGraphMvp.midiKeyboardArpLatchPointerId = pointerId;
    if (typeof nodeGraphMidiKeyboardClearPlayGate === "function") {
      nodeGraphMidiKeyboardClearPlayGate("arp latch");
    }
    if (typeof clearNodeGraphMidiKeyboardPointerHold === "function") {
      clearNodeGraphMidiKeyboardPointerHold();
    }
    if (pad) {
      nodeGraphMidiKeyboardToggleHeldMidi(Number(pad.dataset.gridMidi), 1);
    }
    try { surface.setPointerCapture?.(pointerId); } catch (_e) { /* ignore */ }
    event.preventDefault();
    return;
  }
  if (nodeGraphMvp.midiKeyboardArpLatchPointerId === pointerId) {
    if (event.type === "pointerup" || event.type === "pointercancel") {
      try { surface.releasePointerCapture?.(pointerId); } catch (_e) { /* ignore */ }
      nodeGraphMvp.midiKeyboardArpLatchPointerId = null;
    }
    event.preventDefault();
    return;
  }

  if (event.type === "pointerdown" && mode === "toggle" && !event.ctrlKey) {
    if (pad) nodeGraphMidiKeyboardToggleHeldMidi(Number(pad.dataset.gridMidi), 1);
    event.preventDefault();
    return;
  }

  if (event.type === "pointerdown" && (event.shiftKey || mode === "hold")) {
    if (pad && typeof renderNodeGraphMidiKeyboardSignal === "function") {
      const next = nodeGraphGridKeyboardSignalFromPad(pad, event);
      next.gate = 1;
      renderNodeGraphMidiKeyboardSignal(next);
    }
    try { surface.setPointerCapture?.(event.pointerId); } catch (_e) { /* ignore */ }
    event.preventDefault();
    return;
  }

  if (event.type === "pointermove") {
    if (nodeGraphMvp.midiKeyboardArpLatchPointerId != null) return;
    if ((mode === "slide" || mode === "press") && event.buttons > 0 && !event.ctrlKey && pad) {
      const prevRaw = Number(nodeGraphMvp.keyboardModuleSignal?.rawMidi);
      const rawMidi = Number(pad.dataset.gridMidi);
      const next = nodeGraphGridKeyboardSignalFromPad(pad, event, {
        gatePulse: Number.isFinite(prevRaw) && prevRaw !== rawMidi,
        refreshVelocity: true,
      });
      next.gate = 1;
      if (typeof renderNodeGraphMidiKeyboardSignal === "function") {
        renderNodeGraphMidiKeyboardSignal(next);
      }
      renderNodeGraphGridKeyboardPads();
    }
    event.preventDefault();
    return;
  }

  if (event.type === "pointerup" || event.type === "pointercancel") {
    try { surface.releasePointerCapture?.(event.pointerId); } catch (_e) { /* ignore */ }
    const held = typeof nodeGraphMidiKeyboardHeldPointerSignal === "function"
      ? nodeGraphMidiKeyboardHeldPointerSignal()
      : null;
    if (held) {
      if (typeof renderNodeGraphMidiKeyboardSignal === "function") {
        renderNodeGraphMidiKeyboardSignal({ ...held, gate: 1, gatePulse: 0 });
      }
      return;
    }
    const current = nodeGraphMvp.keyboardModuleSignal;
    if (current && typeof renderNodeGraphMidiKeyboardSignal === "function") {
      renderNodeGraphMidiKeyboardSignal({ ...current, gate: 0, gatePulse: 0 });
    }
    renderNodeGraphGridKeyboardPads();
    return;
  }

  if (event.type === "pointerdown" && pad) {
    try { surface.setPointerCapture?.(event.pointerId); } catch (_e) { /* ignore */ }
    if (typeof renderNodeGraphMidiKeyboardSignal === "function") {
      renderNodeGraphMidiKeyboardSignal(nodeGraphGridKeyboardSignalFromPad(pad, event));
    }
    renderNodeGraphGridKeyboardPads();
  }
}

function bindNodeGraphGridKeyboardEvents() {
  document.querySelectorAll(".node-grid-keyboard-surface").forEach((surface) => {
    if (surface.dataset.gridKeyboardBound === "true") return;
    surface.dataset.gridKeyboardBound = "true";
    surface.addEventListener("pointerdown", updateNodeGraphGridKeyboardSignal);
    surface.addEventListener("pointermove", updateNodeGraphGridKeyboardSignal);
    surface.addEventListener("pointerup", updateNodeGraphGridKeyboardSignal);
    surface.addEventListener("pointercancel", updateNodeGraphGridKeyboardSignal);
    surface.addEventListener("lostpointercapture", updateNodeGraphGridKeyboardSignal);
  });
  renderNodeGraphGridKeyboardPads();
}

if (typeof globalThis !== "undefined") {
  globalThis.createNodeGraphGridKeyboardBody = createNodeGraphGridKeyboardBody;
  globalThis.bindNodeGraphGridKeyboardEvents = bindNodeGraphGridKeyboardEvents;
  globalThis.renderNodeGraphGridKeyboardPads = renderNodeGraphGridKeyboardPads;
  globalThis.nodeGraphGridKeyboardMidiAt = nodeGraphGridKeyboardMidiAt;
}
