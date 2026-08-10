// Pitch Detector face:
//   • Frequency → Number Readout plate (Hz / 8ve MIDI # / M note name + cents)
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
 * Cents off the nearest equal-temperament pitch (−50…+50].
 * Same wrap idea as elan tone gen: past ±50¢ you're closer to the neighbor.
 */
function nodeGraphFrequencyToCentsOff(hz, a4Hz = nodeGraphPitchA4Hz) {
  const midi = nodeGraphFrequencyToMidi(hz, a4Hz);
  if (!Number.isFinite(midi)) {
    return Number.NaN;
  }
  const nearest = Math.round(midi);
  return (midi - nearest) * 100;
}

/**
 * Detune CV −1…+1 (0 = in tune, ±1 ≈ half-semitone / midpoint wrap).
 */
function nodeGraphFrequencyToDetune(hz, a4Hz = nodeGraphPitchA4Hz) {
  const cents = nodeGraphFrequencyToCentsOff(hz, a4Hz);
  if (!Number.isFinite(cents)) {
    return 0;
  }
  return Math.max(-1, Math.min(1, cents / 50));
}

/**
 * Pitch-class table for fixed-width names.
 * Accidental column is always present: space | # | ♭ (U+266D).
 * Black keys use sharps by default (efficient MIDI class index); the reserved
 * column keeps layout from jittering when naturals and accidentals alternate.
 * Roland octave: MIDI 60 = C3.
 */
const nodeGraphMidiNoteNameParts = Object.freeze([
  Object.freeze({ letter: "C", accidental: " " }),
  Object.freeze({ letter: "C", accidental: "#" }),
  Object.freeze({ letter: "D", accidental: " " }),
  Object.freeze({ letter: "D", accidental: "#" }),
  Object.freeze({ letter: "E", accidental: " " }),
  Object.freeze({ letter: "F", accidental: " " }),
  Object.freeze({ letter: "F", accidental: "#" }),
  Object.freeze({ letter: "G", accidental: " " }),
  Object.freeze({ letter: "G", accidental: "#" }),
  Object.freeze({ letter: "A", accidental: " " }),
  Object.freeze({ letter: "A", accidental: "#" }),
  Object.freeze({ letter: "B", accidental: " " }),
]);

/** UTF-8 music flat (U+266D) — available for enharmonic display if needed. */
const nodeGraphMidiFlatSymbol = "\u266D";

/**
 * Octave field: compact (no trailing pad). Negative keeps leading minus.
 *   3 | -1 | 0
 */
function nodeGraphMidiOctaveField(octave) {
  const o = Math.trunc(Number(octave) || 0);
  if (o < 0) {
    return String(o);
  }
  return String(Math.min(9, Math.max(0, o)));
}

/**
 * MIDI note number → compact name for monospace LED readout (centered, no
 * zero-fill padding that ate plate width at facePadding 0).
 *   C3 | C#3 | D3 | A#4 | B-1
 *
 * @param {number} midi
 * @param {{ preferFlats?: boolean }} [options]
 */
function nodeGraphMidiToNoteName(midi, options = null) {
  const n = Math.round(Number(midi) || 0);
  const pc = ((n % 12) + 12) % 12;
  const preferFlats = Boolean(options && options.preferFlats);
  let letter = nodeGraphMidiNoteNameParts[pc].letter;
  let accidental = nodeGraphMidiNoteNameParts[pc].accidental;
  // Optional enharmonic flats for black keys (C#→D♭, D#→E♭, …).
  if (preferFlats && accidental === "#") {
    const flatOf = Object.freeze({
      C: "D",
      D: "E",
      F: "G",
      G: "A",
      A: "B",
    });
    letter = flatOf[letter] || letter;
    accidental = nodeGraphMidiFlatSymbol;
  }
  // Naturals: omit blank accidental so the plate centers tight (C3 not "C 3").
  const acc = accidental === " " ? "" : accidental;
  const octave = Math.floor(n / 12) - 2;
  return `${letter}${acc}${nodeGraphMidiOctaveField(octave)}`;
}

/** Empty / no-pitch name plate — single DSEG-style dash (not zeros). */
function nodeGraphMidiToNoteNameZero() {
  return "-";
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
 * No-pitch plate: one LCD/DSEG dash (ASCII "-") so low-fidelity / below-threshold
 * frames read as "no lock" instead of 0.00 — not an em dash (no DSEG glyph).
 */
function nodeGraphPitchDetectorZeroDisplay(mode = "hz", decimals = 2) {
  void mode;
  void decimals;
  return "-";
}

/**
 * Format Frequency port sample for the plate under the active display mode.
 * Positive Hz/MIDI are unpadded so the LED centers (no forced sign column).
 * No pitch → dash.
 * @param {number} hz
 * @param {string} [mode]
 * @param {number} [decimals]
 * @param {{ digits?: number, maxDigits?: number }} [options] digit budget for limit_decimals
 */
function nodeGraphPitchDetectorFormatDisplay(hz, mode = "hz", decimals = 2, options = null) {
  const m = nodeGraphPitchDisplayModeNormalize(mode);
  const f = Number(hz);
  if (!(f > 0) || !Number.isFinite(f)) {
    return nodeGraphPitchDetectorZeroDisplay(m, decimals);
  }
  if (m === "midi") {
    const midi = nodeGraphFrequencyToMidi(f);
    if (!Number.isFinite(midi)) {
      return nodeGraphPitchDetectorZeroDisplay(m, decimals);
    }
    // Integer MIDI number, no leading pad — center on the plate.
    return String(Math.round(midi));
  }
  if (m === "name") {
    const midi = nodeGraphFrequencyToMidi(f);
    if (!Number.isFinite(midi)) {
      return nodeGraphPitchDetectorZeroDisplay(m, decimals);
    }
    // Compact note name only; cents live on the meta strip.
    return nodeGraphMidiToNoteName(Math.round(midi));
  }
  // Hz: limit_decimals economy via shared FormatValue; strip sign column for center.
  if (typeof nodeGraphNumberReadoutFormatValue === "function") {
    const formatted = nodeGraphNumberReadoutFormatValue(f, decimals, {
      digits: options?.digits ?? options?.maxDigits ?? 6,
      removeTrailingZeros: false,
      reserveSignSpace: false,
    });
    return String(formatted || "").replace(/^\s+/, "") || "0";
  }
  const places = Math.max(0, Math.min(8, Math.round(Number(decimals) || 2)));
  try {
    return f.toFixed(places);
  } catch {
    return f.toFixed(2);
  }
}

/** Format cents for the M-page strip: "+12¢" / "−3¢" / "0¢". */
function nodeGraphPitchDetectorFormatCents(cents) {
  const n = Number(cents);
  if (!Number.isFinite(n)) {
    return "—";
  }
  const rounded = Math.round(n);
  if (rounded > 0) {
    return `+${rounded}¢`;
  }
  if (rounded < 0) {
    // U+2212 minus for typography when available; ASCII fallback ok.
    return `${rounded}¢`.replace("-", "\u2212");
  }
  return "0¢";
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
    unit.title = "Click to cycle: Hz (frequency) → 8ve (MIDI number) → M (note name + cents)";
  }
  // Show cents strip only on M (note name) page.
  const centsEl = face.querySelector?.("[data-pitch-value='cents']");
  if (centsEl) {
    centsEl.hidden = next !== "name";
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

  // Decorations under the LED plate: unit toggle + cents (M page) + fidelity.
  const meta = document.createElement("div");
  meta.className = "node-pitch-detector-fid";
  const hz = document.createElement("button");
  hz.type = "button";
  hz.className = "node-pitch-detector-hz";
  hz.textContent = "Hz";
  hz.title = "Click to cycle: Hz (frequency) → 8ve (MIDI number) → M (note name + cents)";
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

  const centsVal = document.createElement("strong");
  centsVal.className = "node-pitch-detector-cents";
  centsVal.dataset.pitchValue = "cents";
  centsVal.textContent = "—";
  centsVal.title = "Cents off equal temperament (M page)";
  centsVal.hidden = true;

  const fidKey = document.createElement("span");
  fidKey.className = "node-pitch-detector-k";
  fidKey.textContent = "Fid";
  const fidVal = document.createElement("strong");
  fidVal.className = "node-pitch-detector-v";
  fidVal.dataset.pitchValue = "fidelity";
  fidVal.textContent = "—";
  const fidGroup = document.createElement("span");
  fidGroup.className = "node-pitch-detector-fid-group";
  fidGroup.append(centsVal, fidKey, fidVal);
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
 * Update fidelity + cents strip from live scope payload
 * (entries [id, samples] where id is "nodeId:Fidelity" or "nodeId:Frequency").
 */
function updateNodeGraphPitchDetectorFacesFromScopeValues(values) {
  if (!values || !values.length) {
    return;
  }
  // Collect last sample per nodeId:port so we can update Fid and cents together.
  const lastByKey = new Map();
  for (const entry of values) {
    if (!entry) {
      continue;
    }
    const key = String(entry[0] || "");
    const samples = entry[1];
    if (!key || !samples) {
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
    lastByKey.set(key, last);
  }

  const touchedNodes = new Set();
  for (const key of lastByKey.keys()) {
    const colon = key.indexOf(":");
    if (colon > 0) {
      touchedNodes.add(key.slice(0, colon));
    }
  }

  for (const nodeId of touchedNodes) {
    const body = document.querySelector(`.node-pitch-detector-face[data-node="${CSS.escape(nodeId)}"]`);
    if (!body) {
      continue;
    }
    const fid = lastByKey.get(`${nodeId}:Fidelity`);
    const fidEl = body.querySelector?.('[data-pitch-value="fidelity"]');
    if (fidEl && fid != null) {
      fidEl.textContent = nodeGraphPitchDetectorFormatFid(fid);
    }
    const freq = lastByKey.get(`${nodeId}:Frequency`);
    const centsEl = body.querySelector?.('[data-pitch-value="cents"]');
    if (centsEl) {
      const mode = nodeGraphPitchDisplayModeNormalize(body.dataset.pitchDisplayMode);
      centsEl.hidden = mode !== "name";
      if (mode === "name") {
        if (freq != null && freq > 0) {
          centsEl.textContent = nodeGraphPitchDetectorFormatCents(
            nodeGraphFrequencyToCentsOff(freq),
          );
        } else {
          centsEl.textContent = "—";
        }
      }
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
