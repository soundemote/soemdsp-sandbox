// Pitch Detector face:
//   • Frequency → Number Readout plate (Hz / 8ve MIDI # / M note name)
//   • Bottom row: unit toggle + Fid value (plain DOM, not digit layout)

/** Concert A4 (Hz). Single tuning constant for Hz↔MIDI conversions. */
const nodeGraphPitchA4Hz = 440;

/** Display modes for the unit toggle: frequency → MIDI number → note name. */
const nodeGraphPitchDisplayModes = Object.freeze(["hz", "midi", "name"]);

/**
 * Hz → continuous MIDI (69 = A4). NaN when frequency is non-positive.
 * @param {number} hz
 * @param {number} [a4Hz=440]
 */
function nodeGraphFrequencyToMidi(hz, a4Hz = nodeGraphPitchA4Hz) {
  const f = Number(hz);
  if (!(f > 0) || !Number.isFinite(f)) {
    return Number.NaN;
  }
  const a4 = Number(a4Hz) > 0 ? Number(a4Hz) : nodeGraphPitchA4Hz;
  return 69 + 12 * Math.log2(f / a4);
}

/**
 * MIDI note number → name (Roland octave: MIDI 60 = C3).
 * Reuses the app-wide keyboard label helper when present.
 */
function nodeGraphMidiToNoteName(midi) {
  if (typeof nodeGraphMidiKeyboardPitchLabel === "function") {
    return nodeGraphMidiKeyboardPitchLabel(midi);
  }
  const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const n = Math.round(Number(midi) || 0);
  return `${names[((n % 12) + 12) % 12]}${Math.floor(n / 12) - 2}`;
}

function nodeGraphPitchDisplayModeNormalize(mode) {
  const key = String(mode || "hz").toLowerCase();
  if (key === "midi" || key === "8ve" || key === "note") {
    return "midi";
  }
  if (key === "name" || key === "m" || key === "notename") {
    return "name";
  }
  return "hz";
}

function nodeGraphPitchDisplayModeLabel(mode) {
  const m = nodeGraphPitchDisplayModeNormalize(mode);
  if (m === "midi") {
    return "8ve";
  }
  if (m === "name") {
    return "M";
  }
  return "Hz";
}

/**
 * Format Frequency port sample for the plate under the active display mode.
 * Leading space keeps DSEG width stable for numeric modes.
 */
function nodeGraphPitchDetectorFormatDisplay(hz, mode = "hz", decimals = 2) {
  const m = nodeGraphPitchDisplayModeNormalize(mode);
  const f = Number(hz);
  if (!(f > 0) || !Number.isFinite(f)) {
    return m === "name" ? " —" : " --";
  }
  if (m === "midi") {
    const midi = nodeGraphFrequencyToMidi(f);
    if (!Number.isFinite(midi)) {
      return " --";
    }
    const n = Math.round(midi);
    return n < 0 ? String(n) : ` ${n}`;
  }
  if (m === "name") {
    const midi = nodeGraphFrequencyToMidi(f);
    if (!Number.isFinite(midi)) {
      return " —";
    }
    return ` ${nodeGraphMidiToNoteName(Math.round(midi))}`;
  }
  if (typeof nodeGraphNumberReadoutFormatValue === "function") {
    return nodeGraphNumberReadoutFormatValue(f, decimals);
  }
  const places = Math.max(0, Math.min(8, Math.round(Number(decimals) || 2)));
  try {
    const fixed = f.toFixed(places);
    return fixed.startsWith("-") ? fixed : ` ${fixed}`;
  } catch {
    return ` ${f.toFixed(2)}`;
  }
}

function nodeGraphPitchDetectorFaceMode(faceOrNodeId) {
  if (faceOrNodeId && faceOrNodeId.dataset) {
    return nodeGraphPitchDisplayModeNormalize(faceOrNodeId.dataset.pitchDisplayMode);
  }
  const id = String(faceOrNodeId || "");
  if (!id) {
    return "hz";
  }
  const face = document.querySelector(`.node-pitch-detector-face[data-node="${CSS.escape(id)}"]`);
  return nodeGraphPitchDisplayModeNormalize(face?.dataset?.pitchDisplayMode);
}

function nodeGraphPitchDetectorCycleDisplayMode(face) {
  if (!face?.dataset) {
    return "hz";
  }
  const modes = nodeGraphPitchDisplayModes;
  const cur = nodeGraphPitchDisplayModeNormalize(face.dataset.pitchDisplayMode);
  const idx = Math.max(0, modes.indexOf(cur));
  const next = modes[(idx + 1) % modes.length];
  face.dataset.pitchDisplayMode = next;
  const unit = face.querySelector?.(".node-pitch-detector-hz");
  if (unit) {
    unit.textContent = nodeGraphPitchDisplayModeLabel(next);
    unit.setAttribute(
      "aria-label",
      `Display mode ${nodeGraphPitchDisplayModeLabel(next)}. Click to cycle Hz, 8ve, M.`,
    );
    unit.title = "Click to cycle: Hz (frequency) → 8ve (MIDI number) → M (note name)";
  }
  // Force Number Readout repaint (invalidate text cache on face canvas).
  const canvas = face.querySelector?.(".node-number-readout-canvas");
  if (canvas) {
    canvas._nodeGraphNumberReadoutText = null;
    canvas._numberReadoutLastValueText = "";
  }
  if (typeof scheduleNodeGraphModuleScopeDraw === "function") {
    scheduleNodeGraphModuleScopeDraw({ force: true });
  }
  return next;
}

function createNodeGraphPitchDetectorBody(nodeId) {
  const id = String(nodeId || "");
  const body = document.createElement("div");
  body.className = "node-pitch-detector-face node-light-source";
  body.dataset.node = id;
  body.dataset.nodeType = "helmholtzPitch";
  body.dataset.pitchDetectorFace = "true";
  body.dataset.pitchDisplayMode = "hz";
  body.dataset.lightSource = "screen";
  body.setAttribute("aria-label", "Pitch detector frequency LED and fidelity");

  // Phosphor Value LED plate (layout class keeps meta strip below digits).
  const lcd = document.createElement("div");
  lcd.className = "node-pitch-detector-lcd node-module-scope-window node-number-readout-face node-value-led-face node-light-source";
  lcd.dataset.node = id;
  lcd.dataset.nodeType = "helmholtzPitch";
  lcd.dataset.valueFaceStyle = "led";
  lcd.dataset.lightSource = "screen";
  lcd.dataset.lightStrength = "1";
  lcd.setAttribute("aria-hidden", "true");

  // Decorations under the LED plate: unit toggle + fidelity.
  const meta = document.createElement("div");
  meta.className = "node-pitch-detector-fid";
  const hz = document.createElement("button");
  hz.type = "button";
  hz.className = "node-pitch-detector-hz";
  hz.textContent = "Hz";
  hz.title = "Click to cycle: Hz (frequency) → 8ve (MIDI number) → M (note name)";
  hz.setAttribute("aria-label", "Display mode Hz. Click to cycle Hz, 8ve, M.");
  hz.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    nodeGraphPitchDetectorCycleDisplayMode(body);
  });
  hz.addEventListener("pointerdown", (event) => {
    // Keep module selection / marquee from stealing the unit toggle.
    event.stopPropagation();
  });
  const fidKey = document.createElement("span");
  fidKey.className = "node-pitch-detector-k";
  fidKey.textContent = "Fid";
  const fidVal = document.createElement("strong");
  fidVal.className = "node-pitch-detector-v";
  fidVal.dataset.pitchValue = "fidelity";
  fidVal.textContent = "—";
  const fidGroup = document.createElement("span");
  fidGroup.className = "node-pitch-detector-fid-group";
  fidGroup.append(fidKey, fidVal);
  meta.append(hz, fidGroup);

  body.append(lcd, meta);
  return body;
}

function nodeGraphPitchDetectorFormatFid(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return "—";
  }
  return Math.max(0, Math.min(1, n)).toFixed(4);
}

/**
 * Update fidelity strip from live scope payload
 * (entries [id, samples] where id is "nodeId:Fidelity").
 * Frequency is painted by the Number Readout path.
 */
function updateNodeGraphPitchDetectorFacesFromScopeValues(values) {
  if (!values || !values.length) {
    return;
  }
  for (const entry of values) {
    if (!entry) {
      continue;
    }
    const key = String(entry[0] || "");
    const samples = entry[1];
    if (!key || !samples) {
      continue;
    }
    const colon = key.indexOf(":");
    if (colon <= 0) {
      continue;
    }
    const nodeId = key.slice(0, colon);
    const port = key.slice(colon + 1);
    if (port !== "Fidelity") {
      continue;
    }
    const length = samples instanceof Float32Array
      ? samples.length
      : (Array.isArray(samples) ? samples.length : 0);
    if (!length) {
      continue;
    }
    const last = Number(samples[length - 1]);
    if (!Number.isFinite(last)) {
      continue;
    }
    const body = document.querySelector(`.node-pitch-detector-face[data-node="${nodeId}"]`);
    const fidEl = body?.querySelector?.('[data-pitch-value="fidelity"]');
    if (fidEl) {
      fidEl.textContent = nodeGraphPitchDetectorFormatFid(last);
    }
  }
}

/**
 * After module mount: register LCD for Number Readout paint + cold plate so
 * the black face is never invisible.
 */
function mountNodeGraphPitchDetectorFace(article, body, nodeId) {
  if (!article || !body) {
    return;
  }
  const lcd = body.querySelector(".node-pitch-detector-lcd") || body;
  if (typeof registerNodeGraphModuleScopeSlot === "function") {
    registerNodeGraphModuleScopeSlot(article, {
      nodeId: String(nodeId || body.dataset.node || ""),
      scopeElement: lcd,
      type: "helmholtzPitch",
      viewDrag: false,
    });
  }
  // Immediate cold LCD so the plate shows before the first scope post.
  if (typeof paintNodeGraphNumberReadoutColdBoot === "function"
    && typeof nodeGraphNumberReadoutCanvasForSlot === "function") {
    const slot = typeof nodeGraphModuleScopeState !== "undefined"
      ? nodeGraphModuleScopeState?.slots?.get?.(String(nodeId || body.dataset.node || ""))
      : null;
    if (slot) {
      const canvas = nodeGraphNumberReadoutCanvasForSlot(slot);
      const node = typeof nodeGraphPatchNode === "function"
        ? nodeGraphPatchNode(nodeId)
        : null;
      if (canvas && lcd) {
        paintNodeGraphNumberReadoutColdBoot(canvas, lcd, node);
      }
    }
  }
  // Full phosphor LED punch (not LCD less-dim).
  if (lcd.dataset) {
    lcd.dataset.valueFaceStyle = "led";
    lcd.dataset.lightSource = "screen";
    lcd.dataset.lightStrength = "1";
  }
  if (typeof nodeGraphModuleScopeMarkScreenLit === "function") {
    nodeGraphModuleScopeMarkScreenLit(lcd, 1);
  }
}
