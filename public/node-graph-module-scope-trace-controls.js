// Trace display active-control / section helpers (Phase D).
// Load after scopes.js (+ settings-form). Extract-only.

function nodeGraphDisplaySettingsIsPhosphorFormType(type) {
  const key = String(type || "").trim();
  // Spectrogram is *Burn by name only — not the stamp/residual phosphor stack.
  if (key === "spectrogramBurn") {
    return false;
  }
  return key === "scope2d"
    || key === "phosphorLight"
    || key === "lineBurn"
    || key === "dot"
    || key === "xyPad"
    || key === "videoscopeBurn"
    || key === "oscilloscopeBankBurn"
    || key === "hypersawBurn"
    || key.endsWith("Burn");
}

/** Filter shared phosphor order down to keys active on this face. */
function nodeGraphPhosphorDisplayFieldsFor(keys) {
  const want = new Set(keys || []);
  return nodeGraphPhosphorDisplayFieldOrder.filter((key) => want.has(key));
}

const nodeGraphTraceDisplaySettingControlKeys = Object.freeze({
  fields: [
    ...nodeGraphTraceDisplaySettingFields.map(([key]) => key),
    "hue",
    "rounding",
  ],
  colors: ["dot1Color", "secondaryColor", "backgroundColor", "ghostColor"],
  // Every control key that exists in the shared popover MUST be listed here.
  // setNodeGraphTraceDisplaySettingsFormType only show/hides keys from these
  // lists — anything missing leaks onto every module (e.g. Output saw
  // Window / Overlap / Freq scale because those choices were unregistered).
  toggles: ["sourceSync", "skipDiscontinuities", "bipolarBrightness", "secondaryEnabled", "capEnabled", "fullDotEconomy"],
  choices: ["syncChannel", "stereoBlend", "window", "overlap", "freqOverlap", "freqScale", "cornerShape"],
});

const nodeGraphTraceDisplayActiveControlsByType = Object.freeze({
  // TRACE = VECTOR stroke into an optional lo-fi face buffer (density).
  // Density only sizes the canvas; it is not phosphor energy stamps / strip-chart.
  trace: Object.freeze({
    fields: Object.freeze([
      "zoomSeconds",
      "scale",
      "pixelDensity",
      "dot1Size",
      "dot1Brightness",
      "secondarySize",
      "secondaryBrightness",
    ]),
    colors: Object.freeze(["dot1Color", "secondaryColor", "backgroundColor"]),
    // sourceSync kept for legacy single-channel; Output uses syncChannel choice.
    toggles: Object.freeze(["sourceSync", "skipDiscontinuities", "secondaryEnabled"]),
    choices: Object.freeze(["syncChannel", "stereoBlend"]),
  }),
  // Phosphor energy faces: color via shared Gradient editor (not single swatches).
  // Field order = nodeGraphPhosphorDisplayFieldOrder (Size…Dot Budget).
  dot: Object.freeze({
    fields: Object.freeze(nodeGraphPhosphorDisplayFieldsFor([
      "dot1Size",
      "lineThickness",
      "dot1Brightness",
      "ghost",
      "trail",
      "pixelDensity",
    ])),
    colors: Object.freeze([]),
    toggles: Object.freeze(["bipolarBrightness"]),
    choices: Object.freeze([]),
  }),
  lineBurn: Object.freeze({
    // Heart-monitor phosphor: Sweep first, then shared phosphor stack.
    fields: Object.freeze([
      "sweepSeconds",
      ...nodeGraphPhosphorDisplayFieldsFor([
        "dot1Size",
        "lineThickness",
        "dot1Brightness",
        "ghost",
        "trail",
        "scale",
        "pixelDensity",
        "dotBudget",
      ]),
    ]),
    colors: Object.freeze([]),
    toggles: Object.freeze(["fullDotEconomy"]),
    choices: Object.freeze([]),
  }),
  value: Object.freeze({
    fields: Object.freeze([
      "lineLength",
      ...nodeGraphPhosphorDisplayFieldsFor([
        "dot1Size",
        "lineThickness",
        "dot1Brightness",
        "ghost",
        "trail",
        "scale",
        "pixelDensity",
      ]),
      "capSize",
      "capLength",
    ]),
    colors: Object.freeze(["dot1Color", "backgroundColor"]),
    toggles: Object.freeze(["capEnabled"]),
    choices: Object.freeze([]),
  }),
  // 2D Phosphor (Lorenz + friends): Size → Blur → Bright → Ghost → Trail → Scale → AA → Dot Budget
  scope2d: Object.freeze({
    fields: Object.freeze(nodeGraphPhosphorDisplayFieldsFor([
      "dot1Size",
      "lineThickness",
      "dot1Brightness",
      "ghost",
      "trail",
      "scale",
      "pixelDensity",
      "dotBudget",
    ])),
    colors: Object.freeze([]),
    // Same horizontal packing row: Full Dot Economy | Dots only
    toggles: Object.freeze(["fullDotEconomy", "dotsOnly"]),
    choices: Object.freeze([]),
  }),
  // 2D Trace = VECTOR path; density = face buffer lo-fi/AA only.
  scope2dTrace: Object.freeze({
    fields: Object.freeze([
      "historySeconds",
      "scale",
      "pixelDensity",
      "dot1Size",
      "dot1Brightness",
    ]),
    colors: Object.freeze(["dot1Color", "backgroundColor"]),
    toggles: Object.freeze([]),
    choices: Object.freeze([]),
  }),
  numberReadout: Object.freeze({
    // Decimals first; digit color = shared phosphor gradient (energy→color);
    // Ghost/Trail = residual of previous digits (shared phosphor model);
    // backgroundColor = LCD back plate; ghostColor = unlit segment ink.
    fields: Object.freeze([
      "decimals",
      "ghost",
      "trail",
      "dot1Brightness",
    ]),
    colors: Object.freeze(["backgroundColor", "ghostColor"]),
    toggles: Object.freeze([]),
    choices: Object.freeze([]),
  }),
  // LED lamp: same shared display inspector as other faces (not a separate window).
  ledLamp: Object.freeze({
    fields: Object.freeze([
      "hue",
      "dot1Brightness",
      "lineThickness",
      "rounding",
    ]),
    colors: Object.freeze([]),
    toggles: Object.freeze([]),
    choices: Object.freeze(["cornerShape"]),
  }),
  // RGB Shape: gradient picker only (geometry is module params).
  rgbShapeFace: Object.freeze({
    fields: Object.freeze([]),
    colors: Object.freeze([]),
    toggles: Object.freeze([]),
    choices: Object.freeze([]),
  }),
  // RGB Picture: load SVG/image (custom body); geometry is module params.
  rgbPictureFace: Object.freeze({
    fields: Object.freeze([]),
    colors: Object.freeze([]),
    toggles: Object.freeze([]),
    choices: Object.freeze([]),
  }),
  // RGB Soft Fractal: outer plate mode + gradient (field is module params + rAF).
  rgbFractalFace: Object.freeze({
    fields: Object.freeze([]),
    // Optional plate fallback; Outer color Stop 0.00 uses gradient t=0, not this swatch.
    colors: Object.freeze(["backgroundColor"]),
    toggles: Object.freeze([]),
    // First control in Soft Fractal section (before gradient).
    choices: Object.freeze(["outerPlate"]),
  }),
  // Evolve Field: full-plate gradient only (Speed/Color/Seed are module params).
  evolveFieldFace: Object.freeze({
    fields: Object.freeze([]),
    colors: Object.freeze(["backgroundColor"]),
    toggles: Object.freeze([]),
    choices: Object.freeze([]),
  }),
  // Fractal Brownian Field: mono terrain → gradient only (params are knobs).
  fbmFieldFace: Object.freeze({
    fields: Object.freeze([]),
    colors: Object.freeze([]),
    toggles: Object.freeze([]),
    choices: Object.freeze([]),
  }),
  // Matrix faces: custom bodies (glyph / message) — no stepper fields.
  matrixFace: Object.freeze({
    fields: Object.freeze([]),
    colors: Object.freeze([]),
    toggles: Object.freeze([]),
    choices: Object.freeze([]),
  }),
  matrixWaterfallFace: Object.freeze({
    fields: Object.freeze([]),
    colors: Object.freeze([]),
    toggles: Object.freeze([]),
    choices: Object.freeze([]),
  }),
  matrixDisplayFace: Object.freeze({
    fields: Object.freeze([]),
    colors: Object.freeze([]),
    toggles: Object.freeze([]),
    choices: Object.freeze([]),
  }),
  // XY Pad: phosphor of Out X/Y + UI puck. No scale (would desync puck/trail).
  xyPad: Object.freeze({
    fields: Object.freeze([
      ...nodeGraphPhosphorDisplayFieldsFor([
        "dot1Size",
        "lineThickness",
        "dot1Brightness",
        "ghost",
        "trail",
        "pixelDensity",
        "dotBudget",
      ]),
      "puckSize",
    ]),
    colors: Object.freeze([]),
    toggles: Object.freeze(["fullDotEconomy"]),
    choices: Object.freeze([]),
  }),
  // Same controls as scope2d — leftover formType="phosphorLight".
  phosphorLight: Object.freeze({
    fields: Object.freeze(nodeGraphPhosphorDisplayFieldsFor([
      "dot1Size",
      "lineThickness",
      "dot1Brightness",
      "ghost",
      "trail",
      "scale",
      "pixelDensity",
      "dotBudget",
    ])),
    colors: Object.freeze([]),
    toggles: Object.freeze(["fullDotEconomy"]),
    choices: Object.freeze([]),
  }),
  // Spectrogram: FFT + analysis choices. History / Min·Max Freq are module sliders.
  // Gradient separate.
  spectrogramBurn: Object.freeze({
    fields: Object.freeze([
      "fftSize",
    ]),
    colors: Object.freeze([]),
    toggles: Object.freeze([]),
    choices: Object.freeze(["window", "overlap", "freqOverlap", "freqScale"]),
  }),
  // Videoscope / bank / hypersaw: mono energy phosphor (same knobs as 2D Phosphor).
  // MUST NOT fall through to "trace" — that is Output's Left/Right page.
  // Videoscope Bright lives on the module face param — not in Display Settings.
  videoscopeBurn: Object.freeze({
    fields: Object.freeze(nodeGraphPhosphorDisplayFieldsFor([
      "dot1Size",
      "lineThickness",
      "ghost",
      "trail",
      "scale",
      "pixelDensity",
      "dotBudget",
    ])),
    colors: Object.freeze([]),
    toggles: Object.freeze([]),
    choices: Object.freeze([]),
  }),
  oscilloscopeBankBurn: Object.freeze({
    fields: Object.freeze(nodeGraphPhosphorDisplayFieldsFor([
      "dot1Size",
      "lineThickness",
      "dot1Brightness",
      "ghost",
      "trail",
      "pixelDensity",
      "dotBudget",
    ])),
    colors: Object.freeze([]),
    toggles: Object.freeze([]),
    choices: Object.freeze([]),
  }),
  hypersawBurn: Object.freeze({
    fields: Object.freeze(nodeGraphPhosphorDisplayFieldsFor([
      "dot1Size",
      "lineThickness",
      "dot1Brightness",
      "ghost",
      "trail",
      "pixelDensity",
    ])),
    colors: Object.freeze([]),
    toggles: Object.freeze([]),
    choices: Object.freeze([]),
  }),
  // Knob face: macro dial look + image layers + rotation (Display Settings only).
  knobFace: Object.freeze({
    fields: Object.freeze(["decimals", "rotationDegrees", "rotationOffsetDegrees"]),
    colors: Object.freeze(["backgroundColor", "arcFill", "arcTrack"]),
    toggles: Object.freeze(["showLabel", "showReadout"]),
    choices: Object.freeze([]),
  }),
  pluginSliderFace: Object.freeze({
    fields: Object.freeze([]),
    colors: Object.freeze([]),
    toggles: Object.freeze([]),
    choices: Object.freeze([]),
  }),
  toggleButtonFace: Object.freeze({
    fields: Object.freeze([]),
    colors: Object.freeze([]),
    toggles: Object.freeze([]),
    choices: Object.freeze([]),
  }),
  momentaryButtonFace: Object.freeze({
    fields: Object.freeze([]),
    colors: Object.freeze([]),
    toggles: Object.freeze([]),
    choices: Object.freeze([]),
  }),
  // Custom body (colors + 8 name fields) — see macro-controls-settings.js.
  macroControlsFace: Object.freeze({
    fields: Object.freeze([]),
    colors: Object.freeze([]),
    toggles: Object.freeze([]),
    choices: Object.freeze([]),
  }),
});

function nodeGraphTraceDisplayActiveControlsForType(type = nodeGraphTraceDisplaySettingsFormType()) {
  const key = String(type || "").trim();
  if (nodeGraphTraceDisplayActiveControlsByType[key]) {
    return nodeGraphTraceDisplayActiveControlsByType[key];
  }
  // Energy / *Burn faces → scope2d controls. Never default unknown types to
  // "trace" (Output stereo page) — that leaked syncChannel/stereoBlend onto
  // Videoscope and friends.
  if (key.endsWith("Burn") || key === "transportBpm" || key === "clock") {
    return nodeGraphTraceDisplayActiveControlsByType.scope2d;
  }
  return nodeGraphTraceDisplayActiveControlsByType.trace;
}

function nodeGraphTraceDisplayActiveControlSet(kind, type = nodeGraphTraceDisplaySettingsFormType()) {
  return new Set(nodeGraphTraceDisplayActiveControlsForType(type)[kind] || []);
}

const nodeGraphTraceDisplaySectionControls = Object.freeze({
  caps: Object.freeze({
    fields: Object.freeze(["capSize", "capLength"]),
    colors: Object.freeze([]),
    toggles: Object.freeze(["capEnabled"]),
    choices: Object.freeze([]),
  }),
  // Stamp geometry/light — order matches shared phosphor stack (Size → Blur → Bright).
  dot1: Object.freeze({
    fields: Object.freeze(["dot1Size", "lineThickness", "dot1Brightness", "puckSize"]),
    colors: Object.freeze(["dot1Color"]),
    toggles: Object.freeze(["bipolarBrightness"]),
    choices: Object.freeze([]),
  }),
  secondary: Object.freeze({
    fields: Object.freeze(["secondarySize", "secondaryLineThickness", "secondaryBrightness"]),
    colors: Object.freeze(["secondaryColor"]),
    toggles: Object.freeze(["secondaryEnabled"]),
    choices: Object.freeze([]),
  }),
  trace: Object.freeze({
    // Residual + framing. Ghost once only (was listed twice → double "Ghost" rows).
    // Phosphor residual order: Ghost → Trail → Scale → Pixel density → Dot Budget.
    // Stamp size/blur/bright live only under the Dot/Stamp section.
    fields: Object.freeze([
      "decimals",
      "rotationDegrees",
      "rotationOffsetDegrees",
      "sweepSeconds",
      "ghost",
      "trail",
      "zoomSeconds",
      "historySeconds",
      "scale",
      "pixelDensity",
      "dotBudget",
      "padding",
      "fftSize",
      "minFreq",
      "maxFreq",
      "hue",
      "rounding",
    ]),
    // Face plate (+ number readout ghost ink) + Knob arc colors.
    colors: Object.freeze(["backgroundColor", "ghostColor", "arcFill", "arcTrack"]),
    toggles: Object.freeze([
      "sourceSync",
      "skipDiscontinuities",
      "fullDotEconomy",
      "showLabel",
      "showReadout",
    ]),
    // window/overlap/freqOverlap/freqScale = spectrogram; syncChannel/stereoBlend = Output.
    // cornerShape = LED.
    choices: Object.freeze([
      "outerPlate",
      "window",
      "overlap",
      "freqOverlap",
      "freqScale",
      "syncChannel",
      "stereoBlend",
      "cornerShape",
    ]),
  }),
  value: Object.freeze({
    fields: Object.freeze(["lineLength"]),
    colors: Object.freeze([]),
    toggles: Object.freeze([]),
    choices: Object.freeze([]),
  }),
});

function nodeGraphTraceDisplaySectionHasActiveControls(section, type = nodeGraphTraceDisplaySettingsFormType()) {
  const sectionControls = nodeGraphTraceDisplaySectionControls[section];
  if (!sectionControls) {
    return false;
  }
  return ["fields", "colors", "toggles", "choices"].some((kind) => {
    const activeSet = nodeGraphTraceDisplayActiveControlSet(kind, type);
    return (sectionControls[kind] || []).some((key) => activeSet.has(key));
  });
}

function setNodeGraphTraceDisplaySectionVisible(popover, section, visible) {
  if (!popover) {
    return;
  }
  for (const element of popover.querySelectorAll(`.node-trace-display-${section}-title, .node-trace-display-${section}-section`)) {
    element.hidden = !visible;
  }
}

function formatNodeGraphTraceDisplaySetting(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return "0";
  }
  return Number.isInteger(number)
    ? String(number)
    : number.toFixed(4).replace(/\.?0+$/g, "");
}

/** Open display-settings shell (singleton). All field queries should use this root. */
function nodeGraphTraceDisplaySettingsRoot() {
  return document.getElementById("nodeTraceDisplaySettingsPopover");
}

// Field labels / input modes for schema-exclusive body builders.
// Phosphor labels: Size, Blur, Bright, Ghost, Trail, Scale, Pixel density, Dot Budget.
const nodeGraphDisplaySettingsFieldMeta = Object.freeze({
  ghost: Object.freeze({
    label: "Ghost",
    inputmode: "decimal",
    id: "nodeTraceDisplayGhost",
    title: "Dim scorched residual hang (screen burn-in). 0 = none; 1 = long low ghost. Not peak light (Bright) or hot trail length (Trail).",
  }),
  trail: Object.freeze({
    label: "Trail",
    inputmode: "decimal",
    id: "nodeTraceDisplayTrail",
    title: "Main residual length. 0 = dies immediately; 1 ≈ freeze-ish hot path. Dim scorched floor is Ghost.",
  }),
  historySeconds: Object.freeze({
    label: "History (s)",
    inputmode: "decimal",
    id: "nodeTraceDisplayHistorySeconds",
    title: "Seconds of audio across the face (short windows near 0). Drag uses exponential scaling — fine control for short history, long windows toward the top of the range.",
  }),
  fftSize: Object.freeze({
    label: "FFT size",
    inputmode: "numeric",
    id: "nodeTraceDisplayFftSize",
    title: "Analysis window length (samples). Steps 128…16384. Time hop = N / time-overlap. Freq overlap zero-pads the FFT.",
  }),
  minFreq: Object.freeze({
    label: "Min freq (Hz)",
    inputmode: "decimal",
    id: "nodeTraceDisplayMinFreq",
    title: "Lowest frequency drawn at the bottom of the face (1–24000 Hz). Raise this with Max freq to zoom into a band — more vertical pixels on the range you care about.",
  }),
  maxFreq: Object.freeze({
    label: "Max freq (Hz)",
    inputmode: "decimal",
    id: "nodeTraceDisplayMaxFreq",
    title: "Highest frequency drawn at the top of the face (1–24000 Hz, must stay above Min). Lower this to crop ultrasonic / empty highs and spend face height on mid/low detail.",
  }),
  scale: Object.freeze({
    label: "Scale",
    inputmode: "decimal",
    id: "nodeTraceDisplayScale",
    title: "Amplitude zoom (1 = full-scale ±1 fills the face). Raise to enlarge quieter signals.",
  }),
  pixelDensity: Object.freeze({
    label: "Pixel density",
    inputmode: "decimal",
    id: "nodeTraceDisplayPixelDensity",
    title:
      "Face buffer scale (0–4). 1 = native layout×dpr. Below 1 = intentional low-res (pixelated / chunky). Above 1 = supersample then filter down (smoother, more GPU).",
  }),
  dotBudget: Object.freeze({
    label: "Dot Budget",
    inputmode: "numeric",
    id: "nodeTraceDisplayDotBudget",
    title: "Max phosphor stamps per frame. Under budget: dense packing. Over budget: even spacing across the whole path (beautiful sparse dots at high frequency — not unlimited line drawing).",
  }),
  zoomSeconds: Object.freeze({
    label: "History (s)",
    inputmode: "decimal",
    id: "nodeTraceDisplayZoomSeconds",
    title: "Seconds of capture shown (0–10 s). Exponential drag: most useful short windows live near 0; longer history toward max.",
  }),
  sweepSeconds: Object.freeze({
    label: "Sweep (s)",
    inputmode: "decimal",
    id: "nodeTraceDisplaySweepSeconds",
    title: "Seconds for one left→right pass (0.01–10). 0 clamps to 0.01 (fastest), not back to the 2 s default.",
  }),
  cycles: Object.freeze({ label: "Cycles", inputmode: "decimal", id: "nodeTraceDisplayCycles" }),
  decimals: Object.freeze({
    label: "Decimals",
    inputmode: "numeric",
    id: "nodeTraceDisplayDecimals",
    title: "Digits after the decimal point (0–8).",
  }),
  rotationDegrees: Object.freeze({
    label: "Span °",
    inputmode: "numeric",
    id: "nodeTraceDisplayKnobSpan",
    title: "How many degrees image layers rotate across Bias 0…1 (0–1440).",
  }),
  rotationOffsetDegrees: Object.freeze({
    label: "Offset °",
    inputmode: "numeric",
    id: "nodeTraceDisplayKnobOffset",
    title: "Starting angle for rotating image layers (−720…720).",
  }),
  hue: Object.freeze({
    label: "Hue",
    inputmode: "decimal",
    id: "nodeTraceDisplayHue",
    title: "LED lamp hue in degrees (0–360).",
  }),
  rounding: Object.freeze({
    label: "Rounding",
    inputmode: "decimal",
    id: "nodeTraceDisplayRounding",
    title: "LED corner rounding percent (0 = square tile, 100 = full capsule/circle).",
  }),
  padding: Object.freeze({ label: "Amp", inputmode: "decimal", id: "nodeTraceDisplayPadding" }),
  lineLength: Object.freeze({ label: "Line length", inputmode: "decimal", id: "nodeTraceDisplayValueLineLength" }),
  dot1Brightness: Object.freeze({
    label: "Bright",
    inputmode: "decimal",
    id: "nodeTraceDisplayBrightness",
    title: "Peak deposit / present light 0–1 exactly (1 = full energy / gradient tip). Not Ghost or Trail. Not a 0–2 scale.",
  }),
  lineThickness: Object.freeze({ label: "Blur", inputmode: "decimal", id: "nodeTraceDisplayLineThickness" }),
  dot1Size: Object.freeze({
    label: "Size",
    inputmode: "decimal",
    id: "nodeTraceDisplayDot1Size",
    title: "Trace/dot thickness. 0 = 1px, 1 = full face min side. Exponential — fine control near 0 for sharp beams.",
  }),
  puckSize: Object.freeze({
    label: "Puck size",
    inputmode: "decimal",
    id: "nodeTraceDisplayPuckSize",
    title: "UI puck radius (vector overlay). Does not scale the phosphor trail or Phase mapping.",
  }),
  secondaryBrightness: Object.freeze({ label: "Bright", inputmode: "decimal", id: "nodeTraceDisplaySecondaryBrightness" }),
  secondaryLineThickness: Object.freeze({ label: "Blur", inputmode: "decimal", id: "nodeTraceDisplaySecondaryLineThickness" }),
  secondarySize: Object.freeze({
    label: "Size",
    inputmode: "decimal",
    id: "nodeTraceDisplaySecondarySize",
    title: "Secondary channel thickness. 0 = 1px, 1 = full face min side (exponential).",
  }),
  capSize: Object.freeze({
    label: "Size",
    inputmode: "decimal",
    id: "nodeTraceDisplayCapSize",
    title: "Cap stroke thickness. 0 = 1px, 1 = full face min side (exponential).",
  }),
  capLength: Object.freeze({ label: "Length", inputmode: "decimal", id: "nodeTraceDisplayCapLength" }),
});

const nodeGraphDisplaySettingsToggleMeta = Object.freeze({
  sourceSync: Object.freeze({ label: "Sync", id: "nodeTraceDisplaySourceSync" }),
  skipDiscontinuities: Object.freeze({ label: "Skip discontinuities", id: "nodeTraceDisplaySkipDiscontinuities" }),
  bipolarBrightness: Object.freeze({ label: "Bipolar", id: "nodeTraceDisplayBipolarBrightness" }),
  secondaryEnabled: Object.freeze({ label: "Secondary on", id: "nodeTraceDisplaySecondaryEnabled" }),
  capEnabled: Object.freeze({ label: "Caps on", id: "nodeTraceDisplayCapEnabled" }),
  fullDotEconomy: Object.freeze({
    label: "Full dot economy",
    id: "nodeTraceDisplayFullDotEconomy",
    title:
      "Off (default): pack soft stamps at fuse spacing (continuous trail, thrifty on Dot Budget). On: denser packing up to Dot Budget (brighter solid trails). Over budget: spacing widens evenly along the whole path — never truncates the head. Ignored when Dots only is on (except even sample skip under budget).",
  }),
  dotsOnly: Object.freeze({
    label: "Dots only",
    id: "nodeTraceDisplayDotsOnly",
    title:
      "Stamp only real sample hits — no path packing between samples. Completely avoids connective lines / chord fill. Dense samples still fuse visually; sparse samples stay discrete dots.",
  }),
  showLabel: Object.freeze({
    label: "Show label",
    id: "nodeTraceDisplayShowLabel",
    title: "Show the name/alias above the dial on the Knob module face.",
  }),
  showReadout: Object.freeze({
    label: "Show value",
    id: "nodeTraceDisplayShowReadout",
    title: "Show the live Bias readout on the Knob module face.",
  }),
});

// No side-column "Color" labels — the widget is self-evident; full-width row only.
const nodeGraphDisplaySettingsColorMeta = Object.freeze({
  backgroundColor: Object.freeze({
    label: "",
    aria: "Background color",
    defaultValue: "#000000",
    id: "nodeTraceDisplayBackgroundColor",
  }),
  ghostColor: Object.freeze({
    label: "",
    aria: "LCD unlit segment color",
    defaultValue: "#1a4a55",
    id: "nodeTraceDisplayGhostColor",
  }),
  dot1Color: Object.freeze({
    label: "",
    aria: "Primary color",
    defaultValue: "#ff0000",
    id: "nodeTraceDisplayColor",
  }),
  secondaryColor: Object.freeze({
    label: "",
    aria: "Secondary color",
    defaultValue: "#0000ff",
    id: "nodeTraceDisplaySecondaryColor",
  }),
  // Knob module macro dial (per-node Display Settings).
  arcFill: Object.freeze({
    label: "",
    aria: "Arc fill (value)",
    defaultValue: "#f1b84b",
    id: "nodeTraceDisplayArcFill",
  }),
  arcTrack: Object.freeze({
    label: "",
    aria: "Arc track (unfilled)",
    defaultValue: "#3a3428",
    id: "nodeTraceDisplayArcTrack",
  }),
});

const nodeGraphDisplaySettingsChoiceMeta = Object.freeze({
  // Soft Fractal: Stop 0.00 (solid gradient t=0) / Gradient (soft palette exterior).
  outerPlate: Object.freeze({
    label: "Outer color",
    aria: "Outer / empty plate color source",
    id: "nodeTraceDisplayOuterPlate",
    title: "Stop 0.00 = exterior is the gradient color at stop t=0.00 (default). Gradient = soft exterior plate sampled from the full gradient.",
    options: Object.freeze([
      Object.freeze({ value: "stop0", label: "Stop 0.00" }),
      Object.freeze({ value: "gradient", label: "Gradient" }),
    ]),
  }),
  syncChannel: Object.freeze({
    label: "Sync",
    aria: "Sync channel",
    id: "nodeTraceDisplaySyncChannel",
    options: Object.freeze([
      Object.freeze({ value: "off", label: "Off" }),
      Object.freeze({ value: "left", label: "Left" }),
      Object.freeze({ value: "right", label: "Right" }),
      Object.freeze({ value: "mono", label: "Mono" }),
    ]),
  }),
  stereoBlend: Object.freeze({
    label: "Blend",
    aria: "Stereo blend mode",
    id: "nodeTraceDisplayStereoBlend",
    options: Object.freeze([
      Object.freeze({ value: "combine", label: "Meet" }),
      Object.freeze({ value: "lighter", label: "Add" }),
      Object.freeze({ value: "screen", label: "Screen" }),
      Object.freeze({ value: "source-over", label: "Over" }),
      Object.freeze({ value: "multiply", label: "Multiply" }),
      Object.freeze({ value: "difference", label: "Difference" }),
      Object.freeze({ value: "exclusion", label: "Exclusion" }),
      Object.freeze({ value: "xor", label: "Xor" }),
    ]),
  }),
  cornerShape: Object.freeze({
    label: "Corners",
    aria: "LED corner shape",
    id: "nodeTraceDisplayCornerShape",
    options: Object.freeze([
      Object.freeze({ value: "square", label: "Square" }),
      Object.freeze({ value: "squircle", label: "Squircle" }),
    ]),
  }),
  window: Object.freeze({
    label: "Window",
    aria: "STFT window",
    id: "nodeTraceDisplayWindow",
    options: Object.freeze([
      Object.freeze({ value: "0", label: "Rectangular" }),
      Object.freeze({ value: "1", label: "Hann" }),
      Object.freeze({ value: "2", label: "Hamming" }),
      Object.freeze({ value: "3", label: "Blackman" }),
      Object.freeze({ value: "4", label: "Blackman-Harris" }),
    ]),
  }),
  overlap: Object.freeze({
    label: "Time overlap",
    aria: "STFT time hop overlap",
    id: "nodeTraceDisplayOverlap",
    title: "How often we emit a new spectrum (hop = N / factor). Higher = denser time samples, thinner waterfall stripes. None = hop N; 32× = hop N/32.",
    options: Object.freeze([
      Object.freeze({ value: "0", label: "1× (none)" }),
      Object.freeze({ value: "1", label: "2× (50%)" }),
      Object.freeze({ value: "2", label: "4× (75%)" }),
      Object.freeze({ value: "3", label: "8× (87.5%)" }),
      Object.freeze({ value: "4", label: "16× (93.8%)" }),
      Object.freeze({ value: "5", label: "32× (96.9%)" }),
    ]),
  }),
  freqOverlap: Object.freeze({
    label: "Freq overlap",
    aria: "STFT frequency zero-pad",
    id: "nodeTraceDisplayFreqOverlap",
    title: "Zero-pad the analysis window before the FFT for a denser frequency grid (does not lengthen the time window).",
    options: Object.freeze([
      Object.freeze({ value: "0", label: "1× (none)" }),
      Object.freeze({ value: "1", label: "2× pad" }),
      Object.freeze({ value: "2", label: "4× pad" }),
    ]),
  }),
  freqScale: Object.freeze({
    label: "Freq scale",
    aria: "Frequency scale",
    id: "nodeTraceDisplayFreqScale",
    options: Object.freeze([
      Object.freeze({ value: "0", label: "Linear" }),
      Object.freeze({ value: "1", label: "Mel" }),
      Object.freeze({ value: "2", label: "Bark" }),
    ]),
  }),
});

const nodeGraphDisplaySettingsFormTypeTitles = Object.freeze({
  trace: "Trace",
  value: "Value",
  lineBurn: "Burn",
  scope2d: "2D",
  scope2dTrace: "Trace",
  numberReadout: "Readout",
  xyPad: "Phosphor",
  phosphorLight: "2D Phosphor",
  dot: "Phosphor Dot",
  spectrogramBurn: "Spectrogram",
  ledLamp: "LED",
  rgbShapeFace: "Shape",
  rgbPictureFace: "Picture",
  rgbFractalFace: "Soft Fractal",
  evolveFieldFace: "Evolve Field",
  fbmFieldFace: "Fractal Brownian Field",
  matrixFace: "Matrix",
  matrixWaterfallFace: "Waterfall",
  matrixDisplayFace: "Matrix",
  // Phosphor energy faces — must not fall through to generic "Trace"
  // (that title is what made Videoscope look like Output).
  videoscopeBurn: "Videoscope",
  oscilloscopeBankBurn: "Bank",
  hypersawBurn: "Hypersaw",
  knobFace: "Knob",
  pluginSliderFace: "Slider",
  macroControlsFace: "Macro Controls",
  toggleButtonFace: "Toggle",
  momentaryButtonFace: "Momentary",
});

const nodeGraphDisplaySettingsSectionOrder = Object.freeze([
  "trace",
  "value",
  "dot1",
  "secondary",
  "gradient",
  "caps",
]);

// Phosphor faces: Stamp (Size/Blur/Bright) before residual (Ghost/Trail/…).
// Yields: Size → Blur → Bright → Ghost → Trail → Scale → Pixel density → Dot Budget
const nodeGraphPhosphorDisplaySettingsSectionOrder = Object.freeze([
  "dot1",
  "trace",
  "value",
  "secondary",
  "gradient",
  "caps",
]);

function nodeGraphDisplaySettingsEscapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// nodeGraphDisplaySettingsBuildStepperRowHtml → node-graph-module-scope-settings-form.js
// nodeGraphDisplaySettingsBuildToggleRowHtml → node-graph-module-scope-settings-form.js
// nodeGraphDisplaySettingsBuildChoiceRowHtml → node-graph-module-scope-settings-form.js
// nodeGraphDisplaySettingsColorRowMeta → node-graph-module-scope-settings-form.js
// nodeGraphDisplaySettingsBuildColorRowHtml → node-graph-module-scope-settings-form.js
// Trace display settings UI chrome → node-graph-module-scope-settings-ui.js
// Scope buffer I/O → node-graph-module-scope-buffer-io.js
