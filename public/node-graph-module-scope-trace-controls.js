// Trace display active-control / section helpers (Phase D).
// Load after scopes.js (+ settings-form). Extract-only.

function nodeGraphDisplaySettingsIsVectorTraceFormType(type) {
  const key = String(type || "").trim();
  return key === "trace"
    || key === "traceXyz"
    || key === "scope2dTrace"
    || key === "gradientVectorscopeFace"
    || key === "value";
}

/** Instant Trace stack: Scale → History → Fade (2D only) → Size → Blur → Pixel density → Bright. */
const nodeGraphInstantTraceDisplayFieldOrder = Object.freeze([
  "scale",
  "historySeconds",
  "zoomSeconds",
  "fade",
  "dot1Size",
  "lineThickness",
  "pixelDensity",
  "dot1Brightness",
]);

/** Instant Trace Right / secondary: Size → Blur → Bright. */
const nodeGraphTraceDisplaySecondaryInkFieldOrder = Object.freeze([
  "secondarySize",
  "secondaryLineThickness",
  "secondaryBrightness",
]);

function nodeGraphDisplaySettingsOrderInkGroup(keys, group) {
  const list = Array.isArray(keys) ? keys : [];
  const order = Array.isArray(group) ? group : [];
  if (!order.length) {
    return list;
  }
  const want = new Set(list);
  const ink = order.filter((key) => want.has(key));
  if (!ink.length) {
    return list;
  }
  const out = [];
  let placed = false;
  for (const key of list) {
    if (order.includes(key)) {
      if (!placed) {
        out.push(...ink);
        placed = true;
      }
      continue;
    }
    out.push(key);
  }
  return out;
}

function nodeGraphDisplaySettingsOrderTraceInkFields(keys) {
  let list = Array.isArray(keys) ? keys.slice() : [];
  list = nodeGraphDisplaySettingsOrderInkGroup(list, nodeGraphInstantTraceDisplayFieldOrder);
  list = nodeGraphDisplaySettingsOrderInkGroup(list, nodeGraphTraceDisplaySecondaryInkFieldOrder);
  return list;
}

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
    "screenPadding",
    "textSize",
    "textSizePx",
    "textWeight",
    "buttonWidth",
    "buttonHeight",
    "labelSize",
    "valueSize",
  ],
  colors: ["dot1Color", "secondaryColor", "backgroundColor", "ghostColor", "buttonColor", "hoverColor", "downColor", "textColor", "strokeColor", "dotColor"],
  // Every control key that exists in the shared popover MUST be listed here.
  // setNodeGraphTraceDisplaySettingsFormType only show/hides keys from these
  // lists — anything missing leaks onto every module (e.g. Output saw
  // Window / Overlap / Freq scale because those choices were unregistered).
  toggles: [
    "sourceSync",
    "skipDiscontinuities",
    "bipolarBrightness",
    "secondaryEnabled",
    "capEnabled",
    "fullDotEconomy",
    "dotsOnly",
    "digitBins",
    "decimalBudget",
    "removeTrailingZeros",
    "squareRatio",
    "rotate90",
  ],
  choices: [
    "syncChannel",
    "stereoBlend",
    "fftSize",
    "window",
    "overlap",
    "freqOverlap",
    "freqScale",
    "cornerShape",
    "screenShape",
    "outerPlate",
    "lightBlend",
    "polarity",
    "font",
    "labelPosition",
    "valuePosition",
    "xyzLayout",
  ],
});

const nodeGraphTraceDisplayActiveControlsByType = Object.freeze({
  // 1D history plot (Output / Music Player). RGB stroke — no phosphor residual.
  // Fade is 2D Instant Trace only (scope2dTrace / XYZ / vectorscope).
  // Output stereo: Left = Size/Blur, Right = secondary*.
  trace: Object.freeze({
    fields: Object.freeze([
      "scale",
      "zoomSeconds",
      "dot1Size",
      "lineThickness",
      "pixelDensity",
      "dot1Brightness",
      "secondarySize",
      "secondaryLineThickness",
      "secondaryBrightness",
      "dotBudget",
    ]),
    colors: Object.freeze(["dot1Color", "secondaryColor", "backgroundColor"]),
    toggles: Object.freeze(["sourceSync"]),
    choices: Object.freeze(["stereoBlend", "syncChannel"]),
  }),
  // Phosphor energy faces: color via shared Gradient editor (not single swatches).
  // Field order = nodeGraphPhosphorDisplayFieldOrder (Bright…residual…Pixel density).
  // Ghost/Trail/Burn are the pixel fade hang — same residual stack as 2D Phosphor.
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
    toggles: Object.freeze(["sourceSync", "bipolarBrightness"]),
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
    // Packing row: Sync | Full Dots | Dots only | Clear
    toggles: Object.freeze(["sourceSync", "fullDotEconomy", "dotsOnly"]),
    choices: Object.freeze([]),
  }),
  // 0D Value: WebGL beam (no face bitmap / pixelDensity / residual).
  value: Object.freeze({
    fields: Object.freeze([
      "scale",
      "dot1Size",
      "lineThickness",
      "dot1Brightness",
      "lineLength",
      "capSize",
      "capLength",
      "capPadding",
    ]),
    colors: Object.freeze(["dot1Color", "backgroundColor"]),
    toggles: Object.freeze(["capEnabled"]),
    choices: Object.freeze([]),
  }),
  // 2D Phosphor (Lorenz + friends): Bright → Size → Blur → Ghost → Trail → Scale → Pixel density
  scope2d: Object.freeze({
    fields: Object.freeze(nodeGraphPhosphorDisplayFieldsFor([
      "dot1Brightness",
      "dot1Size",
      "lineThickness",
      "ghost",
      "trail",
      "scale",
      "pixelDensity",
      "dotBudget",
    ])),
    colors: Object.freeze([]),
    // Packing row: Sync | Full Dots | Dots only | Clear
    toggles: Object.freeze(["sourceSync", "fullDotEconomy", "dotsOnly"]),
    choices: Object.freeze([]),
  }),
  // 2D Trace = VECTOR path; density = face buffer lo-fi/AA only.
  // lineThickness = Instant Trace Blur (concentric stroke skirt, not phosphor).
  scope2dTrace: Object.freeze({
    fields: Object.freeze([
      "scale",
      "historySeconds",
      "fade",
      "dot1Size",
      "lineThickness",
      "pixelDensity",
      "dot1Brightness",
    ]),
    colors: Object.freeze(["dot1Color", "backgroundColor"]),
    toggles: Object.freeze([]),
    choices: Object.freeze([]),
  }),
  vectorRgbFace: Object.freeze({
    fields: Object.freeze([
      "dot1Brightness",
      "dot1Size",
      "trail",
      "scale",
      "pixelDensity",
    ]),
    colors: Object.freeze(["backgroundColor"]),
    toggles: Object.freeze([]),
    choices: Object.freeze([]),
  }),
  rasterRgbFace: Object.freeze({
    fields: Object.freeze(["screenPadding", "rounding"]),
    colors: Object.freeze([]),
    toggles: Object.freeze(["squareRatio"]),
    choices: Object.freeze(["screenShape"]),
  }),
  gradientVectorscopeFace: Object.freeze({
    fields: Object.freeze([
      "scale",
      "historySeconds",
      "fade",
      "dot1Size",
      "lineThickness",
      "pixelDensity",
      "dot1Brightness",
      "dotBudget",
    ]),
    colors: Object.freeze(["backgroundColor"]),
    toggles: Object.freeze(["rotate90"]),
    choices: Object.freeze([]),
  }),
  traceXyz: Object.freeze({
    fields: Object.freeze([
      "scale",
      "zoomSeconds",
      "fade",
      "dot1Size",
      "lineThickness",
      "pixelDensity",
      "dot1Brightness",
      "dotBudget",
    ]),
    colors: Object.freeze(["backgroundColor"]),
    toggles: Object.freeze([]),
    choices: Object.freeze(["stereoBlend", "xyzLayout"]),
  }),
  numberReadout: Object.freeze({
    // Value LED: Digits → Decimals → Padding → Bright → Ghost → Trail → Burn.
    // Value LCD (vector): digits, decimals, padding, Ghost plate, glass shadow.
    fields: Object.freeze([
      "digits",
      "decimals",
      "facePadding",
      "dot1Brightness",
      "ghost",
      "trail",
      "burn",
      "burnAmount",
      "unlitSegments",
      "centsBand",
      "innerShadowDistance",
      "innerShadowSharpness",
      "innerShadowOffsetX",
      "innerShadowOffsetY",
    ]),
    colors: Object.freeze(["backgroundColor", "dot1Color"]),
    // GROW: live resize vs fixed Digits+Decimals bins (stored as !decimalBudget).
    toggles: Object.freeze(["digitBins", "decimalBudget", "removeTrailingZeros"]),
    choices: Object.freeze(["lightBlend", "polarity"]),
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
    toggles: Object.freeze(["fullDotEconomy", "dotsOnly"]),
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
    toggles: Object.freeze(["fullDotEconomy", "dotsOnly"]),
    choices: Object.freeze([]),
  }),
  // Spectrogram: FFT + analysis choices. History / Min·Max Freq are module sliders.
  // Gradient separate.
  spectrogramBurn: Object.freeze({
    fields: Object.freeze([]),
    colors: Object.freeze([]),
    toggles: Object.freeze([]),
    choices: Object.freeze(["fftSize", "window", "overlap", "freqOverlap", "freqScale"]),
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
    toggles: Object.freeze(["fullDotEconomy", "dotsOnly"]),
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
    toggles: Object.freeze(["fullDotEconomy", "dotsOnly"]),
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
      "dotBudget",
    ])),
    colors: Object.freeze([]),
    toggles: Object.freeze(["fullDotEconomy", "dotsOnly"]),
    choices: Object.freeze([]),
  }),
  // Knob face: macro dial look + image layers + arc geometry (Display Settings only).
  // Span is centered (no Offset) — left and right open together.
  // dialSize 0…1 scales only the arc (1 = fill available space).
  knobFace: Object.freeze({
    fields: Object.freeze([
      "decimals",
      "rotationDegrees",
      "dialSize",
      "labelSize",
      "valueSize",
      "innerRadius",
    ]),
    colors: Object.freeze(["backgroundColor", "arcFill", "arcTrack"]),
    toggles: Object.freeze([]),
    choices: Object.freeze(["labelPosition", "valuePosition"]),
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
  keypadFace: Object.freeze({
    fields: Object.freeze(["textSize", "textWeight", "buttonWidth", "buttonHeight", "buttonSize", "padPx"]),
    colors: Object.freeze(["backgroundColor", "buttonColor", "hoverColor", "downColor", "textColor", "strokeColor"]),
    toggles: Object.freeze(["squareRatio"]),
    choices: Object.freeze(["font"]),
  }),
  portalFace: Object.freeze({
    fields: Object.freeze(["channel"]),
    colors: Object.freeze([]),
    toggles: Object.freeze([]),
    choices: Object.freeze([]),
  }),
  roundShapeFace: Object.freeze({
    fields: Object.freeze(["lineThickness", "lineBlur", "pixelDensity"]),
    colors: Object.freeze(["backgroundColor", "strokeColor", "dotColor"]),
    toggles: Object.freeze([]),
    choices: Object.freeze([]),
  }),
  limiterGainFace: Object.freeze({
    fields: Object.freeze(["historySeconds", "lineThickness", "hue", "lineBrightness"]),
    colors: Object.freeze(["backgroundColor"]),
    toggles: Object.freeze([]),
    choices: Object.freeze([]),
  }),
  textBoxFace: Object.freeze({
    fields: Object.freeze(["textSizePercent", "verticalAlignPercent"]),
    colors: Object.freeze(["backgroundColor", "textColor"]),
    toggles: Object.freeze([]),
    choices: Object.freeze([]),
  }),
  // Patch identity plate: which info rows to show + plate colors.
  patchFace: Object.freeze({
    fields: Object.freeze([]),
    colors: Object.freeze(["backgroundColor", "dot1Color"]),
    toggles: Object.freeze([
      "showName",
      "showBank",
      "showProgram",
      "showBankName",
      "showCategory",
      "showTags",
      "showAuthor",
      "showDescription",
    ]),
    choices: Object.freeze([]),
  }),
  // Custom body (colors + 8 name fields) — see macro-controls-settings.js.
  macroControlsFace: Object.freeze({
    fields: Object.freeze([]),
    colors: Object.freeze([]),
    toggles: Object.freeze([]),
    choices: Object.freeze([]),
  }),
  keyboardControllerFace: Object.freeze({
    fields: Object.freeze([]),
    colors: Object.freeze([]),
    toggles: Object.freeze([]),
    choices: Object.freeze([]),
  }),
});

function nodeGraphTraceDisplayActiveControlsForType(type = nodeGraphTraceDisplaySettingsFormType()) {
  const key = String(type || "").trim();
  if (nodeGraphTraceDisplayActiveControlsByType[key]) {
    const spec = nodeGraphTraceDisplayActiveControlsByType[key];
    if (
      typeof nodeGraphDisplayFormTypeHas1dSync === "function"
      && nodeGraphDisplayFormTypeHas1dSync(key)
      && !(spec.toggles || []).includes("sourceSync")
    ) {
      return Object.freeze({
        fields: spec.fields,
        colors: spec.colors,
        toggles: Object.freeze(["sourceSync", ...(spec.toggles || [])]),
        choices: spec.choices,
      });
    }
    return spec;
  }
  // Energy / *Burn faces → scope2d controls. Never default unknown types to
  // "trace" (Output stereo page) — that leaked syncChannel/stereoBlend onto
  // Videoscope and friends.
  if (key.endsWith("Burn") || key === "transportBpm" || key === "clock" || key === "phoneToneFace" || key === "vectorRgbFace" || key === "rasterRgbFace" || key === "gradientVectorscopeFace") {
    return nodeGraphTraceDisplayActiveControlsByType.scope2d;
  }
  return nodeGraphTraceDisplayActiveControlsByType.trace;
}

function nodeGraphTraceDisplayActiveControlSet(kind, type = nodeGraphTraceDisplaySettingsFormType()) {
  return new Set(nodeGraphTraceDisplayActiveControlsForType(type)[kind] || []);
}

const nodeGraphTraceDisplaySectionControls = Object.freeze({
  caps: Object.freeze({
    fields: Object.freeze(["capSize", "capLength", "capPadding"]),
    colors: Object.freeze([]),
    toggles: Object.freeze(["capEnabled"]),
    choices: Object.freeze([]),
  }),
  // Stamp geometry/light — order matches shared phosphor stack (Bright → Size → Blur).
  // ghostBrightness sits next to Bright for Number Readout (min residual gradient stop).
  dot1: Object.freeze({
    fields: Object.freeze([
      "dot1Brightness",
      "dot1Size",
      "lineThickness",
      "ghostBrightness",
      "puckSize",
    ]),
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
      "residual",
      "rotationDegrees",
      "dialSize",
      "labelSize",
      "valueSize",
      "innerRadius",
      "sweepSeconds",
      "ghost",
      "trail",
      "burn",
      "burnAmount",
      "facePadding",
      "unlitSegments",
      "innerShadowDistance",
      "innerShadowSharpness",
      "innerShadowOffsetX",
      "innerShadowOffsetY",
      "zoomSeconds",
      "historySeconds",
      "scale",
      "pixelDensity",
      "dotBudget",
      "padding",
      "screenPadding",
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
      "dotsOnly",
      "digitBins",
      "decimalBudget",
      "removeTrailingZeros",
      "rotate90",
      "squareRatio",
    ]),
    // window/overlap/freqOverlap/freqScale = spectrogram; syncChannel/stereoBlend = Output.
    // cornerShape = LED.
    choices: Object.freeze([
      "outerPlate",
      "lightBlend",
      "window",
      "overlap",
      "freqOverlap",
      "freqScale",
      "syncChannel",
      "stereoBlend",
      "cornerShape",
      "polarity",
      "labelPosition",
      "valuePosition",
      "xyzLayout",
      "screenShape",
      "fftSize",
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
  // Integers as bare digits; keep up to 4 decimals without float dust.
  // Avoid regex that can turn near-1 values into ambiguous strings.
  if (Number.isInteger(number)) {
    return String(number);
  }
  const fixed = number.toFixed(4);
  // Trim trailing zeros after decimal only (keep "0.5", never "" or "1.").
  return fixed.replace(/(\.\d*?[1-9])0+$/g, "$1").replace(/\.0+$/g, "");
}

/** Open display-settings shell (singleton). All field queries should use this root. */
function nodeGraphTraceDisplaySettingsRoot() {
  return document.getElementById("nodeTraceDisplaySettingsPopover");
}

// Field labels / input modes for schema-exclusive body builders.
// Phosphor labels: Bright, Size, Blur, Ghost, Trail, Burn, Scale, Pixel density, Dot Budget.
const nodeGraphDisplaySettingsFieldMeta = Object.freeze({
  ghost: Object.freeze({
    label: "Ghost",
    inputmode: "decimal",
    id: "nodeTraceDisplayGhost",
    title: "Extreme analog (super-exp) residual hang — not brightness. Trail 0 = Ghost only (this is the whole hang). Mixes toward linear as Trail rises.",
  }),
  trail: Object.freeze({
    label: "Trail",
    inputmode: "decimal",
    id: "nodeTraceDisplayTrail",
    title: "Mix from Ghost-only toward linear, then freeze. 0 = Ghost only; 0.5 = half linear / half Ghost; 0.75 = full linear; 1 = never decay pixels.",
  }),
  burn: Object.freeze({
    label: "Burn",
    inputmode: "decimal",
    id: "nodeTraceDisplayBurn",
    title: "Sticky residual floor 0…1. 0 = none stick; 0.5 = once energy ≥ 0.5 freezes there; 1 = freeze all residual. Off by default.",
  }),
  burnAmount: Object.freeze({
    label: "Burn \u2A2F",
    inputmode: "decimal",
    id: "nodeTraceDisplayBurnAmount",
    title: "Residual deposit gain vs Bright (default 1). Deposit = Bright \u00d7 this control. Live light unchanged. 0.5 = dim ghost deposit; 2 = hot deposit.",
  }),
  residual: Object.freeze({
    // Legacy key — Value LED/LCD forms use trail (same axis).
    label: "Trail",
    inputmode: "decimal",
    id: "nodeTraceDisplayResidual",
    title: "Linear residual hang 0…1 (app-wide Trail). Not brightness. Ghost is the analog hang; Burn is the sticky floor.",
  }),
  ghostBrightness: Object.freeze({
    // Legacy key — Value LED/LCD forms use ghost (same axis).
    label: "Ghost",
    inputmode: "decimal",
    id: "nodeTraceDisplayGhostBrightness",
    title: "Extreme analog residual hang 0…1 (app-wide Ghost). Not brightness — only decay/hang of deposited energy.",
  }),
  unlitSegments: Object.freeze({
    label: "Ghost",
    inputmode: "decimal",
    id: "nodeTraceDisplayUnlitSegments",
    title:
      "Value LCD Ghost: permanent dim all-8 segment plate (0 = off, 1 = strong). Soft fade near 0 — not residual hang (LED Trail/Ghost).",
  }),
  centsBand: Object.freeze({
    label: "Tune",
    inputmode: "decimal",
    id: "nodeTraceDisplayCentsBand",
    title:
      "Pitch Detector 8ve page: cents-accuracy color stripes behind the note name. 0 = off, 1 = fully opaque. Blue = 0–10¢, green 11–20, yellow 21–30, orange 31–40, red 41–50.",
  }),
  facePadding: Object.freeze({
    label: "Padding",
    inputmode: "decimal",
    id: "nodeTraceDisplayFacePadding",
    title:
      "Value LED/LCD: linear inset on each axis (half-width / half-height). 0 = no inset; positive pulls digits in (1 = pin pixel); negative grows digits toward the plate walls so you can dial wall contact.",
  }),
  innerShadowDistance: Object.freeze({
    label: "Shadow dist",
    inputmode: "decimal",
    id: "nodeTraceDisplayInnerShadowDistance",
    title: "Value LCD: how far the Gaussian inset glass shadow reaches from the edge (0 = none, 1 = deep). Not brightness.",
  }),
  innerShadowSharpness: Object.freeze({
    label: "Shadow hard",
    inputmode: "decimal",
    id: "nodeTraceDisplayInnerShadowSharpness",
    title:
      "Value LCD shadow hardness 0…1. Soft = wide translucent Gaussian; harder = less blur and more black. Full hardness = solid black hard rim.",
  }),
  innerShadowOffsetX: Object.freeze({
    label: "Shadow X",
    inputmode: "decimal",
    id: "nodeTraceDisplayInnerShadowOffsetX",
    title: "Value LCD: inset shadow horizontal offset −1…1 (0 = centered). Positive darkens the left edge (light from the right).",
  }),
  innerShadowOffsetY: Object.freeze({
    label: "Shadow Y",
    inputmode: "decimal",
    id: "nodeTraceDisplayInnerShadowOffsetY",
    title: "Value LCD: inset shadow vertical offset −1…1 (0 = centered). Positive darkens the top edge (light from below).",
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
      "Face buffer scale (0–1). 1 = native layout×dpr. Below 1 = intentional low-res (pixelated / chunky).",
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
  digits: Object.freeze({
    label: "Digits",
    inputmode: "numeric",
    id: "nodeTraceDisplayDigits",
    title:
      "Total digit budget (1–12): whole + fractional places. With Decimals, defines the exact bins for limit_decimals economy and GROW-off fixed width.",
  }),
  decimals: Object.freeze({
    label: "Decimals",
    inputmode: "numeric",
    id: "nodeTraceDisplayDecimals",
    title:
      "Digits after the decimal point (0–8). Capped by Digits budget via limit_decimals (min/max decimal economy).",
  }),
  rotationDegrees: Object.freeze({
    label: "Span °",
    inputmode: "numeric",
    id: "nodeTraceDisplayKnobSpan",
    title: "Centered arc sweep across Bias 0…1 (0–1440°). Opens left and right together (gap stays opposite center). Default 270°.",
  }),
  dialSize: Object.freeze({
    label: "Knob size",
    inputmode: "decimal",
    id: "nodeTraceDisplayKnobDialSize",
    title: "Dial ring size 0…1. 1 = fill available dial cell (no padding). Scales only the arc — label and value stay put.",
  }),
  labelSize: Object.freeze({
    label: "Label size",
    inputmode: "decimal",
    id: "nodeTraceDisplayKnobLabelSize",
    title: "Title size 0…1 on the Knob face. Independent of knob size.",
  }),
  valueSize: Object.freeze({
    label: "Value size",
    inputmode: "decimal",
    id: "nodeTraceDisplayKnobValueSize",
    title: "Bias readout size 0…1 on the Knob face. Independent of knob size.",
  }),
  innerRadius: Object.freeze({
    label: "Inner radius",
    inputmode: "decimal",
    id: "nodeTraceDisplayKnobInnerRadius",
    title: "Arc hole size 0…1. 0 = solid disk; ~0.7 default ring; higher = thinner outer ring.",
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
    title: "Corner rounding percent (0 = square, 100 = full capsule/circle). Pairs with Pill or Squircle.",
  }),
  screenPadding: Object.freeze({
    label: "Padding",
    inputmode: "decimal",
    id: "nodeTraceDisplayScreenPadding",
    title: "Screen inset 0…1. 0 = flush to the plate; 1 = collapse to a point. Same role as Music Player edge spacing.",
  }),
  padding: Object.freeze({ label: "Amp", inputmode: "decimal", id: "nodeTraceDisplayPadding" }),
  textSize: Object.freeze({
    label: "Font size",
    inputmode: "decimal",
    id: "nodeTraceDisplayKeypadTextSize",
    title: "Font size 0–1. 0 hides the digit; 1 fills the button (square, no clip).",
  }),
  textSizePx: Object.freeze({
    label: "Font size",
    inputmode: "decimal",
    id: "nodeTraceDisplayKeypadTextSizePx",
    title: "Legacy pixel size. Display Settings uses Font size 0–1.",
  }),
  textWeight: Object.freeze({
    label: "Boldness",
    inputmode: "numeric",
    id: "nodeTraceDisplayKeypadTextWeight",
    title: "Font weight 100–900 (steps of 100).",
  }),
  buttonWidth: Object.freeze({
    label: "Button width",
    inputmode: "decimal",
    id: "nodeTraceDisplayKeypadButtonWidth",
    title: "Key width as a fraction of its cell (0.5–1).",
  }),
  buttonHeight: Object.freeze({
    label: "Button height",
    inputmode: "decimal",
    id: "nodeTraceDisplayKeypadButtonHeight",
    title: "Key height as a fraction of its cell (0.5–1).",
  }),
  lineLength: Object.freeze({ label: "Line length", inputmode: "decimal", id: "nodeTraceDisplayValueLineLength" }),
  fade: Object.freeze({
    label: "Fade",
    inputmode: "decimal",
    id: "nodeTraceDisplayFade",
    title: "Fade the stroke along history. 0 = even ink. 1 = oldest gone, newest full.",
  }),
  dot1Brightness: Object.freeze({
    label: "Bright",
    inputmode: "decimal",
    id: "nodeTraceDisplayBrightness",
    title: "Peak deposit / present light 0–1 (1 = full). Number Readout LED: live light grey→hue→white (never black); also deposit energy.",
  }),
  lineThickness: Object.freeze({
    label: "Blur",
    inputmode: "decimal",
    id: "nodeTraceDisplayLineThickness",
    title:
      "Edge soft 0…1 (beam smoothstep). Phosphor stamps: soft radius. 0D Value: line + cap edge AA (draw floors ~0.12 so thin strokes stay anti-aliased).",
  }),
  lineBlur: Object.freeze({
    label: "Line blur",
    inputmode: "decimal",
    id: "nodeTraceDisplayLineBlur",
    title:
      "Vector restroke blur in CSS pixels (0 = hard). Diamond tent kernel: the path is redrawn at center + 4 cardinal + 4 diagonal offsets. Cheap, no extra canvas.",
  }),
  dot1Size: Object.freeze({
    label: "Size",
    inputmode: "decimal",
    id: "nodeTraceDisplayDot1Size",
    title: "Stroke/dot diameter vs face square min side. 0 = 1px (min), 1 = full square. Linear ratio.",
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
  capPadding: Object.freeze({
    label: "Padding",
    inputmode: "decimal",
    id: "nodeTraceDisplayCapPadding",
    title:
      "Pull end caps inward from the horizontal line tips toward the middle. 0 = outer edges flush with the line caps; 1 = both caps meet at the center.",
  }),
});

const nodeGraphDisplaySettingsToggleMeta = Object.freeze({
  sourceSync: Object.freeze({
    label: "Sync",
    id: "nodeTraceDisplaySourceSync",
    title:
      "App-wide 1D Sync. Instant Trace: edge-lock the visible window. 1D Phosphor: rising edges snap the pen (Reset jack still works). Off = free-run.",
  }),
  skipDiscontinuities: Object.freeze({ label: "Skip discontinuities", id: "nodeTraceDisplaySkipDiscontinuities" }),
  bipolarBrightness: Object.freeze({ label: "Bipolar", id: "nodeTraceDisplayBipolarBrightness" }),
  secondaryEnabled: Object.freeze({ label: "Secondary on", id: "nodeTraceDisplaySecondaryEnabled" }),
  capEnabled: Object.freeze({ label: "Caps on", id: "nodeTraceDisplayCapEnabled" }),
  fullDotEconomy: Object.freeze({
    label: "Full Dots",
    id: "nodeTraceDisplayFullDotEconomy",
    title:
      "How densely stamps are packed along the path. Off (default): thrifty fuse spacing so soft dots blend into a continuous trail without burning the Dot Budget. On: pack as many stamps as Dot Budget allows (brighter, more solid trails). If the path still needs more stamps than budget, spacing widens evenly over the whole path — the head is never cut off. When Dots only is on, this mainly controls even sample skipping under budget.",
  }),
  rotate90: Object.freeze({
    label: "90°",
    id: "nodeTraceDisplayRotate90",
    title: "Audio vectorscope rotation: (X−Y, X+Y)/√2 so mono is vertical. Off = raw X/Y.",
  }),
  squareRatio: Object.freeze({
    label: "Square pixels",
    id: "nodeTraceDisplaySquareRatio",
    title: "Keep raster cells square. When Width and Height match, a non-square face letterboxes instead of stretching. Off: stretch the grid to fill the face.",
  }),
  dotsOnly: Object.freeze({
    label: "Dots only",
    id: "nodeTraceDisplayDotsOnly",
    title:
      "Stamp only real sample hits — no extra packing between samples. Avoids connective lines / chord fill. Dense samples can still fuse; sparse samples stay discrete dots.",
  }),
  showName: Object.freeze({
    label: "Name",
    id: "nodeTraceDisplayShowPatchName",
    title: "Show the patch name field on the Patch plate.",
  }),
  showBank: Object.freeze({
    label: "Bank #",
    id: "nodeTraceDisplayShowPatchBank",
    title: "Show the bank number on the Patch plate.",
  }),
  showProgram: Object.freeze({
    label: "Program #",
    id: "nodeTraceDisplayShowPatchProgram",
    title: "Show the program number on the Patch plate.",
  }),
  showBankName: Object.freeze({
    label: "Bank name",
    id: "nodeTraceDisplayShowPatchBankName",
    title: "Show the bank name on the Patch plate.",
  }),
  showCategory: Object.freeze({
    label: "Category",
    id: "nodeTraceDisplayShowPatchCategory",
    title: "Show the patch category on the Patch plate.",
  }),
  showTags: Object.freeze({
    label: "Tags",
    id: "nodeTraceDisplayShowPatchTags",
    title: "Show tags on the Patch plate.",
  }),
  showAuthor: Object.freeze({
    label: "Author",
    id: "nodeTraceDisplayShowPatchAuthor",
    title: "Show the author on the Patch plate.",
  }),
  showDescription: Object.freeze({
    label: "Description",
    id: "nodeTraceDisplayShowPatchDescription",
    title: "Show the description on the Patch plate.",
  }),
  digitBins: Object.freeze({
    label: "Digit bins",
    id: "nodeTraceDisplayDigitBins",
    title:
      "Number of digits decides the number of digit bins. Unused bins stay put and can show ghosts — numbers do not walk around.",
  }),
  decimalBudget: Object.freeze({
    // UI label GROW = digits resize to fill the plate. Stored as !decimalBudget
    // (decimalBudget true = fixed Digits+Decimals bins — inverted in form I/O).
    label: "GROW",
    id: "nodeTraceDisplayDecimalBudget",
    title:
      "When on, digit size resizes to fill the plate for the live value. When off, digit size locks to the fixed bins from Digits + Decimals (limit_decimals economy).",
  }),
  removeTrailingZeros: Object.freeze({
    label: "No pad 0",
    id: "nodeTraceDisplayRemoveTrailingZeros",
    title: "When on, do not zero-pad the fractional part (1.5 stays 1.5, not 1.50).",
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
    aria: "Residual digit color (previous reading fade ink)",
    defaultValue: "#8c2981",
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
  buttonColor: Object.freeze({
    label: "",
    aria: "Keypad button color",
    defaultValue: "#f3f1ec",
    id: "nodeTraceDisplayKeypadButtonColor",
  }),
  hoverColor: Object.freeze({
    label: "",
    aria: "Keypad mouse hover color",
    defaultValue: "#ddd9d2",
    id: "nodeTraceDisplayKeypadHoverColor",
  }),
  downColor: Object.freeze({
    label: "",
    aria: "Keypad mouse down color",
    defaultValue: "#c4bdb3",
    id: "nodeTraceDisplayKeypadDownColor",
  }),
  textColor: Object.freeze({
    label: "",
    aria: "Keypad text color",
    defaultValue: "#2d2d2d",
    id: "nodeTraceDisplayKeypadTextColor",
  }),
  strokeColor: Object.freeze({
    label: "",
    aria: "Keypad stroke color",
    defaultValue: "#2d2d2d",
    id: "nodeTraceDisplayKeypadStrokeColor",
  }),
  dotColor: Object.freeze({
    label: "",
    aria: "Cursor dot color",
    defaultValue: "#ffffff",
    id: "nodeTraceDisplayDotColor",
  }),
});

const nodeGraphDisplaySettingsChoiceMeta = Object.freeze({
  labelPosition: Object.freeze({
    label: "Title",
    aria: "Title off, above, mid, or below knob",
    id: "nodeTraceDisplayKnobLabelPosition",
    title: "Title: off, or above / mid / below the knob.",
    options: Object.freeze([
      Object.freeze({ value: "off", label: "Off" }),
      Object.freeze({ value: "above", label: "Above" }),
      Object.freeze({ value: "mid", label: "Mid" }),
      Object.freeze({ value: "below", label: "Below" }),
    ]),
  }),
  xyzLayout: Object.freeze({
    label: "Layout",
    aria: "Stack XYZ traces or split them vertically",
    id: "nodeTraceDisplayXyzLayout",
    title: "Stack draws X/Y/Z on one plot. Separate splits the face into three bands.",
    options: Object.freeze([
      Object.freeze({ value: "stack", label: "Stack" }),
      Object.freeze({ value: "separate", label: "Separate" }),
    ]),
  }),
  valuePosition: Object.freeze({
    aria: "Value off, above, mid, or below knob",
    id: "nodeTraceDisplayKnobValuePosition",
    title: "Value: off, or above / mid / below the knob.",
    options: Object.freeze([
      Object.freeze({ value: "off", label: "Off" }),
      Object.freeze({ value: "above", label: "Above" }),
      Object.freeze({ value: "mid", label: "Mid" }),
      Object.freeze({ value: "below", label: "Below" }),
    ]),
  }),
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
  polarity: Object.freeze({
    label: "Polarity",
    aria: "Unipolar or bipolar number sign",
    id: "nodeTraceDisplayPolarity",
    title: "Bipolar shows − and reserves sign space. Unipolar hides the minus and centers the digits.",
    options: Object.freeze([
      Object.freeze({ value: "bipolar", label: "Bipolar" }),
      Object.freeze({ value: "unipolar", label: "Unipolar" }),
    ]),
  }),
  // Number Readout: how live Light composites over residual / ghost gradient.
  lightBlend: Object.freeze({
    label: "Light blend",
    aria: "How live digit light blends over residual gradient",
    id: "nodeTraceDisplayLightBlend",
    title: "How the solid Light digits composite over residual/ghost. Occlude = plate underpaint (no mix). Others are canvas blend modes over the gradient.",
    options: Object.freeze([
      Object.freeze({ value: "occlude", label: "Occlude" }),
      Object.freeze({ value: "source-over", label: "Over" }),
      Object.freeze({ value: "lighter", label: "Add" }),
      Object.freeze({ value: "screen", label: "Screen" }),
      Object.freeze({ value: "multiply", label: "Multiply" }),
      Object.freeze({ value: "overlay", label: "Overlay" }),
      Object.freeze({ value: "soft-light", label: "Soft light" }),
      Object.freeze({ value: "hard-light", label: "Hard light" }),
      Object.freeze({ value: "color-dodge", label: "Color dodge" }),
      Object.freeze({ value: "color-burn", label: "Color burn" }),
      Object.freeze({ value: "lighten", label: "Lighten" }),
      Object.freeze({ value: "darken", label: "Darken" }),
      Object.freeze({ value: "difference", label: "Difference" }),
      Object.freeze({ value: "exclusion", label: "Exclusion" }),
      Object.freeze({ value: "source-atop", label: "Atop" }),
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
  screenShape: Object.freeze({
    label: "Corners",
    aria: "Screen corner shape",
    id: "nodeTraceDisplayScreenShape",
    options: Object.freeze([
      Object.freeze({ value: "pill", label: "Pill" }),
      Object.freeze({ value: "squircle", label: "Squircle" }),
    ]),
  }),
  font: Object.freeze({
    label: "Font",
    aria: "Keypad font",
    id: "nodeTraceDisplayKeypadFont",
    options: Object.freeze([
      Object.freeze({ value: "thasadith", label: "Thasadith" }),
      Object.freeze({ value: "poiret-one", label: "Poiret One" }),
      Object.freeze({ value: "big-shoulders", label: "Big Shoulders" }),
      Object.freeze({ value: "tenor-sans", label: "Tenor Sans" }),
      Object.freeze({ value: "zen-loop", label: "Zen Loop" }),
    ]),
  }),
  fftSize: Object.freeze({
    label: "FFT size",
    aria: "FFT size",
    id: "nodeTraceDisplayFftSize",
    title: "Analysis window length (samples). Time hop = N / time-overlap. Freq overlap zero-pads the FFT.",
    options: Object.freeze([
      Object.freeze({ value: "128", label: "128" }),
      Object.freeze({ value: "256", label: "256" }),
      Object.freeze({ value: "512", label: "512" }),
      Object.freeze({ value: "1024", label: "1024" }),
      Object.freeze({ value: "2048", label: "2048" }),
      Object.freeze({ value: "4096", label: "4096" }),
      Object.freeze({ value: "8192", label: "8192" }),
      Object.freeze({ value: "16384", label: "16384" }),
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
  traceXyz: "XYZ Trace",
  vectorRgbFace: "Vector RGB",
  rasterRgbFace: "Pixel Grid",
  gradientVectorscopeFace: "Vectorscope",
  numberReadout: "Value",
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
  keypadFace: "Keypad",
  roundShapeFace: "RoundShape",
  textBoxFace: "Text Box",
  pluginSliderFace: "Slider",
  macroControlsFace: "Macro Controls",
  keyboardControllerFace: "MIDI Keyboard",
  toggleButtonFace: "Toggle",
  momentaryButtonFace: "Momentary",
  patchFace: "Patch",
});

const nodeGraphDisplaySettingsSectionOrder = Object.freeze([
  "trace",
  "value",
  "dot1",
  "secondary",
  "gradient",
  "caps",
]);

// Instant Trace: Size → Blur → Bright first (Left then Right), then History / Scale.
const nodeGraphTraceDisplaySettingsSectionOrder = Object.freeze([
  "dot1",
  "secondary",
  "trace",
  "value",
  "gradient",
  "caps",
]);

// Phosphor faces: Stamp (Bright/Size/Blur) before residual (Ghost/Trail/…).
// Yields: Bright → Size → Blur → Ghost → Trail → Scale → Pixel density → Dot Budget
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
