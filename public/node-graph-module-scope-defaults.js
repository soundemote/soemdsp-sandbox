// Pure settings default constants extracted from node-graph-module-scopes.js
// (Phase D). Load BEFORE node-graph-module-scopes.js. No functions.

const nodeGraphTraceDisplayMaxZoomSeconds = 10;
// Instant Waterfall History (s): face width = this many seconds (longer = slower scroll).
// Not a sample-buffer size — do not reuse this for phosphor ring capacity.
const nodeGraphWaterfallMaxHistorySeconds = 3600;

const nodeGraphModuleScopeDefaultSettings = Object.freeze({
  blinkLightShape: "circle",
  brightness: 1,
  cycles: 2,
  gain: 1,
  lineThickness: 1,
  offset: 0,
  oscillatorTraceMode: "frequencyReset",
  pan: 0,
  // App-wide: oscilloscope trigger sync is off unless the user turns it on.
  sync: false,
  timeMs: 20,
});

const nodeGraphModuleScopeDefaultDotCores = Object.freeze({
  dot1: Object.freeze({
    brightness: 4.5,
    color: "#ffffff",
    size: 3.18,
  }),
  traceColor: "#3de0ff",
});

const nodeGraphModuleScopeMinCycles = 1;

const nodeGraphModuleScopeDiscontinuityThreshold = 0.85;

const nodeGraphModuleScopeUnipolarTypes = new Set([
  "badvalMonitor",
  "clock",
  "clockDivider",
  "delayedTrigger",
  "expAdsr",
  "modeResonator",
  "combResonator",
  "waveguide",
  "phaseDisperse",
  "bode",
  "stftBlur",
  "sinepulse",
  "kickEnvelope",
  "sineKick",
  "linearEnvelope",
  "linearAttackRelease",
  "curveAttackRelease",

  "bloomGlow",
  "chromaColor",
  "rgbaHsla",
  "sandboxVisuals",
  "sequencer",
  "triggerCounter",
  "triggerDivider",
]);


/**
 * Shared phosphor stamp defaults for all 1D + 2D phosphor faces
 * (line burn, scope2d, XY pad, value, attractors, …).
 * Bright / Size / Ghost / Trail / Scale / Pixel density / Dot budget.
 */
const nodeGraphScopePhosphorLookDefaults = Object.freeze({
  // Face / gradient floor (stop 0). Plate hue+brightness default black.
  background: "#000004",
  backgroundHue: 240,
  backgroundBrightness: 0,
  // Peak / tip (stop 1 + dot1Color).
  peakColor: "#fcfdbf",
  // Multi-stop energy→color LUT.
  gradientStops: Object.freeze([
    Object.freeze({ t: 0, color: "#000004" }),
    Object.freeze({ t: 0.2, color: "#3b0f70" }),
    Object.freeze({ t: 0.4, color: "#8c2981" }),
    Object.freeze({ t: 0.6, color: "#de4968" }),
    Object.freeze({ t: 0.8, color: "#fe9f6d" }),
    Object.freeze({ t: 1, color: "#fcfdbf" }),
  ]),
  // Bright 0…1 (1 = full deposit / tip).
  brightness: 1,
  // Shared phosphor drawer hang (all 1D/2D phosphor faces).
  ghost: 0.25,
  trail: 0.3,
  burnAmount: 1,
  residualSchema: 4,
  // Size: CSS px diameter @ zoom 1.
  size: 2,
  // Stamp blur 0 hard … 1 soft (aesthetic; continuity comes from path packing).
  blur: 0.35,
  // Max phosphor stamps / frame (economy spreads when over).
  dotBudget: 2048,
  // Face buffer scale (1 = native layout×dpr; <1 pixelated).
  pixelDensity: 1,
  // Amplitude zoom.
  scale: 1,
  // Retired packing toggles — deposit path always chord-packs (never beads).
  fullDotEconomy: false,
  dotsOnly: false,
});

/** Shared cyan energy LUT for 1D line-burn + 2D scope2d phosphor faces. */
const nodeGraphScopeCyanGradientStops = Object.freeze([
  Object.freeze({ t: 0, color: "#000000" }),
  Object.freeze({ t: 0.18, color: "#214247" }),
  Object.freeze({ t: 0.55, color: "#52a5b3" }),
  Object.freeze({ t: 1, color: "#75ebff" }),
]);


const nodeGraphWaterfallSettingsDefaults = Object.freeze({
  // Instant Waterfall = filled peak-to-peak strip chart (not phosphor / Trace stroke).
  // Bright / Blur are display-only; no audio DSP.
  background: "#000000",
  backgroundHue: 0,
  backgroundBrightness: 0,
  // Full-ish ink so Left/Right colors read as chosen (Brightness still 0–1).
  brightness: 0.95,
  // Mono / primary ink (Output Left). Pure red so Meet (red+blue) is green.
  color: "#ff0000",
  dot1Enabled: true,
  // Legacy Size (CSS px @ 96). Filled-bar path ignores Size; kept for old patches / preview.
  dot1Size: 2,
  // Output stereo: combine (Meet) | lighter | screen | source-over | multiply | …
  stereoBlend: "combine",
  // Meet always auto from Left/Right (complement + soft screen lift).
  meetColor: "auto",
  secondaryBrightness: 0.95,
  secondaryColor: "#0000ff",
  secondaryEnabled: true,
  secondarySize: 2,
  secondaryLineThickness: 0,
  tertiaryColor: "#00ff00",
  cycles: 2,
  // Blur 0–1: hard column → soft skirt on filled bars (also aliased as blur).
  lineThickness: 0.15,
  blur: 0.15,
  // Face gaussian. 0 = sharp bars. Legacy lineThickness does not turn this on.
  faceBlur: 0,
  // Legacy stroke packing / lo-fi buffer knobs (kept for older patches; UI hidden).
  stampDensity: 0.5,
  dotBudget: 1024,
  pixelDensity: 1,
  padding: 0,
  // Display gain (sample * scale). 1 = full-scale.
  scale: 1,
  skipDiscontinuities: false,
  // off | left | right | mono — Output stereo chooses which channel triggers the shared window.
  sourceSync: false,
  syncChannel: "off",
  // Sync off: History window duration in seconds (0 = pause). Sync on: cycles in view.
  // Stored separately so toggling Sync keeps both dials. Instant Waterfall only — no Hz.
  historySeconds: 0.25,
  // 1 = ±1 fills the face. Higher enlarges the signal.
  scale: 1,
  historyCycles: 4,
  // Alias of historySeconds for older capture paths.
  zoomSeconds: 0.25,
  // Column start rate vs layout pixels. Range 0..1, default 1.
  // 1 = one bar per layout pixel (max). Lower holds a longer min/max stretch
  // (fewer columns). Stored values above 1 clamp to 1. Not bar thickness.
  detail: 1,
  // Filled-bar width inside the column. 1 = full column. 0 = gone.
  barThickness: 1,
  // fill | stroke | both. One of them is always drawn.
  barInk: "fill",
  strokeColor: "#ffffff",
  strokeThickness: 1,
  // Off: keep scrolling. On: silence (linear amp at or below Planck) holds the plate.
  pauseOnSilence: false,
  // Bipolar: −1 bottom, 0 center, +1 top. Unipolar: 0 bottom, +1 top.
  polarity: "bipolar",
  // XYZ: stack all three on one plot, or split the face into three bands.
  xyzLayout: "stack",
});


/**
 * 1D phosphor (line burn) — same stamp SSOT as 2D scope2d / Lorenz.
 * Only 1D-specific fields differ (sweep, sync, skipDiscontinuities).
 * Drawing implementation is shared; Defaults must not fork a second look bag.
 */
const nodeGraphLineBurnSettingsDefaults = Object.freeze({
  background: "#000000",
  backgroundHue: 0,
  backgroundBrightness: 0,
  burnAmount: nodeGraphScopePhosphorLookDefaults.burnAmount,
  residualSchema: nodeGraphScopePhosphorLookDefaults.residualSchema,
  ghost: nodeGraphScopePhosphorLookDefaults.ghost,
  trail: nodeGraphScopePhosphorLookDefaults.trail,
  scale: nodeGraphScopePhosphorLookDefaults.scale,
  dot1Brightness: nodeGraphScopePhosphorLookDefaults.brightness,
  // Cyan scope LUT (shared with scope2d) — not Instant Waterfall red.
  dot1Color: "#75ebff",
  dot1Enabled: true,
  dot1Size: nodeGraphScopePhosphorLookDefaults.size,
  lineThickness: nodeGraphScopePhosphorLookDefaults.blur,
  pixelDensity: nodeGraphScopePhosphorLookDefaults.pixelDensity,
  dotBudget: nodeGraphScopePhosphorLookDefaults.dotBudget,
  // budget = solid line until the dots run out. length = dots across the full path.
  drawMode: "budget",
  fullDotEconomy: nodeGraphScopePhosphorLookDefaults.fullDotEconomy,
  // false = pack stamps along chords between samples (continuous CRT line).
  dotsOnly: false,
  // Rising-edge auto-trigger on In (snaps pen left). Off unless the user
  // turns Sync on — same default as Instant Waterfall / other 1D faces.
  sourceSync: false,
  // Saw / square / pulse wrap jumps look like ink spikes without this.
  skipDiscontinuities: true,
  // Sync off: left→right passes per second. Sync on: cycles in view.
  // Stored separately so toggling Sync keeps both dials.
  sweepHz: 4,
  sweepCycles: 4,
  gradientStops: nodeGraphScopeCyanGradientStops,
});


const nodeGraphTraceDisplayRenderPointBudgetDefault = 4096;


const nodeGraphZeroDBurnSettingsDefaults = Object.freeze({
  background: nodeGraphScopePhosphorLookDefaults.background,
  bipolarBrightness: false,
  ghost: nodeGraphScopePhosphorLookDefaults.ghost,
  trail: nodeGraphScopePhosphorLookDefaults.trail,
  burnAmount: 1,
  residualSchema: 4,
  dot1Brightness: nodeGraphScopePhosphorLookDefaults.brightness,
  dot1Color: nodeGraphScopePhosphorLookDefaults.peakColor,
  dot1Enabled: true,
  // Phosphor Dot only: large single stamp (~2/3 face min side). Not shared with 2D Phosphor.
  dot1Size: 0.6667,
  // Blur 0 hard … 1 soft (same as 2D Phosphor stamps).
  lineThickness: nodeGraphScopePhosphorLookDefaults.blur,
  // 0 = 1×1 pixel … 1 layout×dpr … 4 AA.
  pixelDensity: nodeGraphScopePhosphorLookDefaults.pixelDensity,
  dotBudget: nodeGraphScopePhosphorLookDefaults.dotBudget,
  // budget = solid line until the dots run out. length = dots across the full path.
  drawMode: "budget",
  fullDotEconomy: nodeGraphScopePhosphorLookDefaults.fullDotEconomy,
  sourceSync: false,
  gradientStops: nodeGraphScopePhosphorLookDefaults.gradientStops,
});


// 0D Value — WebGL beam (classic teal/blue + alpha). No face bitmap.
const nodeGraphValueOscilloscopeSettingsDefaults = Object.freeze({
  background: "#000004",
  // Beam intensity (alpha), not RGB premultiply.
  brightness: 0.72,
  capEnabled: true,
  capLength: 0.16,
  // 0 = outer edges flush with the horizontal line tips; 1 = caps meet at center.
  capPadding: 0,
  capSize: 0.1,
  // Classic sharp teal/blue.
  color: "#73ebff",
  // Residual unused (vector redraw every frame).
  ghost: 0,
  trail: 0,
  burnAmount: 1,
  residualSchema: 4,
  dot1Enabled: true,
  // Stroke diameter: authored CSS px at a 96px face. 0 = gone.
  dot1Size: 2,
  lineLength: 1,
  // Edge soft (beam uBlur). Mild default = AA without a big glow; draw floors ~0.12.
  lineThickness: 0.18,
  pixelDensity: 1,
  // Amplitude zoom (Y).
  scale: 1,
});


// Value LED (numberReadout): phosphor / lit seven-segment face.
// App-wide residual axes: Bright = light only; Ghost/Trail = hang only (no brightness).
const nodeGraphNumberReadoutSettingsDefaults = Object.freeze({
  faceStyle: "led",
  background: nodeGraphScopePhosphorLookDefaults.background,
  backgroundColor: nodeGraphScopePhosphorLookDefaults.background,
  // Digit hue saturation 0…1 (0 = grey, 1 = full hue).
  dot1Saturation: 1,
  colorSaturation: 1,
  // Bright 0…1: live light black → full hue at 0.5 → white at 1. Residual uses Ghost Gradient.
  brightness: 0.5,
  // Spawn live hue 52. Ghost Gradient stays the phosphor LUT.
  color: typeof nodeGraphHueUnitHex === "function"
    ? nodeGraphHueUnitHex(52)
    : "#ffdd00",
  // Trail / Ghost / Burn Amount -- same phosphor drawer SSOT as 1D/2D scopes.
  trail: nodeGraphScopePhosphorLookDefaults.trail,
  ghost: nodeGraphScopePhosphorLookDefaults.ghost,
  burnAmount: 1,
  residualSchema: 4,
  // Legacy aliases (normalize keeps trail/ghost aliases in sync).
  residual: nodeGraphScopePhosphorLookDefaults.trail,
  ghostBrightness: nodeGraphScopePhosphorLookDefaults.ghost,
  // Total digit budget (whole + fractional) for limit_decimals / GROW-off bins.
  digits: 5,
  decimals: 4,
  // When true: lock digit size to fixed Digits+Decimals bins (stable width).
  // When false (GROW): resize digits to fill available space for the live value.
  // Default OFF (GROW off) so Digit bins can hold a realistic meter.
  decimalBudget: true,
  // Digit bins: Digits slider is the slot count. Unused bins stay put (ghosts).
  digitBins: true,
  // How live Light composites over residual gradient (canvas blend / occlude).
  // lighten: live segments brighten residual ink (default for Value LED / Pitch).
  lightBlend: "lighten",
  // Digit inset 0…1 linear vs face square min side (0 = flush fill, 1 = one pin pixel).
  facePadding: 0.1,
  // bipolar: reserve/show minus. unipolar: no sign, centered.
  polarity: "bipolar",
  removeTrailingZeros: false,
  // Energy → color LUT for decaying deposits (live digits use solid Light).
  gradientStops: nodeGraphScopePhosphorLookDefaults.gradientStops,
});

// Value LCD — vector DSEG redraw every frame (no phosphor residual / hang).
// Plate + ink use hue + physically-plausible brightness (not HSL, not hex widgets).
// FX: permanent dim “8” ghost plate + dialable glass inner shadow.
const nodeGraphValueLcdDefaultHueDeg = 82;
const nodeGraphValueLcdSettingsDefaults = Object.freeze({
  faceStyle: "lcd",
  // Stored as pure hue hex; amount is backgroundBrightness.
  background: typeof nodeGraphHueUnitHex === "function"
    ? nodeGraphHueUnitHex(nodeGraphValueLcdDefaultHueDeg)
    : "#a2ff00",
  backgroundBrightness: 0.9,
  backgroundSaturation: 0,
  color: typeof nodeGraphHueUnitHex === "function"
    ? nodeGraphHueUnitHex(210)
    : "#00aaff",
  brightness: 0,
  dot1Saturation: 0.9,
  colorSaturation: 0.9,
  // Residual hang unused on LCD (kept 0 so old patches don’t re-enable burn path).
  trail: 0,
  ghost: 0,
  burnAmount: 1,
  residualSchema: 4,
  residual: 0,
  ghostBrightness: 0,
  digits: 5,
  decimals: 4,
  // Same budget policy as Value LED (GROW off / digit bins on).
  decimalBudget: true,
  digitBins: true,
  lightBlend: "source-over",
  // Digit inset 0…1 vs each axis half (0 = flush, 1 = pin).
  facePadding: 0.1,
  polarity: "bipolar",
  removeTrailingZeros: false,
  // LCD Ghost: permanent “8” skeleton amount 0…1 (soft fade from 0).
  unlitSegments: 0.1,
  innerShadowDistance: 1,
  innerShadowSharpness: 0.7,
  innerShadowOffsetX: 0.03,
  innerShadowOffsetY: 0.05,
  gradientStops: Object.freeze([]),
});

// Vector Dot — cheap companion to Phosphor Dot. Clear + redraw; no residual FBO.
const nodeGraphVectorDotSettingsDefaults = Object.freeze({
  background: typeof nodeGraphHueUnitHex === "function"
    ? nodeGraphHueUnitHex(220)
    : "#0055ff",
  backgroundBrightness: 0,
  backgroundColor: typeof nodeGraphHueUnitHex === "function"
    ? nodeGraphHueUnitHex(220)
    : "#0055ff",
  dot1Color: typeof nodeGraphHueUnitHex === "function"
    ? nodeGraphHueUnitHex(30)
    : "#ff8000",
  color: typeof nodeGraphHueUnitHex === "function"
    ? nodeGraphHueUnitHex(30)
    : "#ff8000",
  hue: 30,
  dot1Brightness: 0.9,
  brightness: 0.9,
  dot1Size: 0.85,
  lineThickness: 0.35,
  blur: 0.35,
  stereoBlend: "combine",
  shape: "circle",
  shapeParam: 0.5,
  // Legacy axes (derived on normalize for old readers).
  pill: 0,
  squircle: 0,
});

// LCD Dot — Vector Dot shape + LCD Value plate/ink/glass (same spawn as Value LCD).
const nodeGraphLcdDotSettingsDefaults = Object.freeze({
  faceStyle: "lcd",
  background: typeof nodeGraphHueUnitHex === "function"
    ? nodeGraphHueUnitHex(nodeGraphValueLcdDefaultHueDeg)
    : "#a2ff00",
  backgroundBrightness: 0.9,
  backgroundSaturation: 0,
  backgroundColor: typeof nodeGraphHueUnitHex === "function"
    ? nodeGraphHueUnitHex(nodeGraphValueLcdDefaultHueDeg)
    : "#a2ff00",
  dot1Color: typeof nodeGraphHueUnitHex === "function"
    ? nodeGraphHueUnitHex(210)
    : "#00aaff",
  color: typeof nodeGraphHueUnitHex === "function"
    ? nodeGraphHueUnitHex(210)
    : "#00aaff",
  hue: 210,
  dot1Brightness: 0,
  brightness: 0,
  dot1Saturation: 0.9,
  colorSaturation: 0.9,
  dot1Size: 0.72,
  lineThickness: 0.12,
  blur: 0.12,
  stereoBlend: "source-over",
  shape: "circle",
  shapeParam: 0.5,
  pill: 0,
  squircle: 0,
  unlitSegments: 0.1,
  innerShadowDistance: 1,
  innerShadowSharpness: 0.7,
  innerShadowOffsetX: 0.03,
  innerShadowOffsetY: 0.05,
});


/** Knob module face: macro-dial look; colors + rotation are per-node Display Settings. */
const nodeGraphKnobFaceDisplaySettingsDefaults = Object.freeze({
  decimals: 2,
  // Face number digit budget (whole + fraction). 0 = integer.
  maxDigits: 2,
  background: "#000000",
  arcFill: "#f1b84b",
  arcTrack: "#3a3428",
  // Centered arc span (degrees Bias 0→1). Start is always −span/2 (no Offset).
  rotationDegrees: 270,
  // Knob graphic size 0…1 (1 = fill entire display; 0 = disappear). Arc only.
  dialSize: 0.84,
  // Knob graphic vertical offset in face-height units; positive moves lower.
  dialOffsetY: 0.14,
  // Label / value size 0…1 of display min-edge (independent of knob size/position).
  labelSize: 0.2,
  valueSize: 0.2,
  // Value vertical offset −1…1 face heights (edge inset for top/bottom; bipolar for mid/midknob).
  valueOffsetY: 0,
  // Label / value align: off | top | mid | midknob | bottom (independent; may overlap).
  labelPosition: "top",
  valuePosition: "midknob",
  // Face name — independent of module alias / header title.
  labelText: "Knob",
  // Hole size 0…1 (0 = solid disk, ~0.7 default, 1 = thin outer ring).
  innerRadius: 0.7,
});

const nodeGraphSliderFaceDisplaySettingsDefaults = Object.freeze({
  decimals: 2,
  maxDigits: 5,
  labelText: "",
  background: "#000000",
  arcTrack: "#1a2226",
  sliderLength: 0.8909,
  sliderHeight: 0.6473,
  sliderPadding: 0.05,
  sliderAlign: "bottom",
  sliderColor: "#5491ab",
  sliderNumberColor: "#ffffff",
  sliderTextColor: "#cad3d8",
  sliderUnitColor: "#7fc7d9",
  sliderShowLabel: true,
  sliderShowNumber: true,
  sliderShowUnit: true,
  sliderLabelInside: false,
  sliderNumberInside: true,
  sliderUnitInside: false,
  sliderLabelAlign: "topleft",
  sliderLabelPadding: 0.035,
  sliderLabelScale: 0.26,
  sliderNumberAlign: "mid",
  sliderNumberPadding: 0,
  sliderNumberScale: 0.35,
  sliderUnitAlign: "topright",
  sliderUnitPadding: 0.04,
  sliderUnitScale: 0.18,
  sliderCornerShape: "squircle",
  sliderRounding: 0.47,
});


const nodeGraphSpectrogramFftSizes = Object.freeze([
  128, 256, 512, 1024, 2048, 4096, 8192, 16384,
]);

const nodeGraphSpectrogramSettingsDefaults = Object.freeze({
  fftSize: 1024,
  historyHz: 4,
  historyCycles: 4,
  historySeconds: 0.25,
  // Choice indices (match worklet tables).
  window: 1, // Hann
  // Time hop index into [1,2,4,8]: default 4× (hop N/4). 0 = none (hop N).
  overlap: 2,
  // Frequency overlap = zero-pad factor on the analysis window (denser Hz grid).
  // 0→1× (no pad), 1→2×, 2→4×. FFT length = min(window×factor, 32768).
  freqOverlap: 0,
  freqScale: 1, // Mel
  // Vertical face maps this Hz band (bottom→top). Zooming the range uses more
  // face pixels on the band of interest (better detail than full Nyquist).
  minFreq: 20,
  maxFreq: 20000,
  // Lowest gradient stop is the face/history "background" — analog pixel burn LUT.
  gradientStops: nodeGraphScopePhosphorLookDefaults.gradientStops,
});


/** @deprecated Alias — prefer nodeGraphScopeCyanGradientStops. */
const nodeGraphScope2dInitGradientStops = nodeGraphScopeCyanGradientStops;

const nodeGraphScope2dSettingsDefaults = Object.freeze({
  // Shared 2D phosphor bag — same stamp SSOT as 1D line burn / Lorenz / Jerobeam.
  // Per-module override bags were retired: Defaults + spawn use this one source.
  background: "#000000",
  backgroundHue: 0,
  backgroundBrightness: 0,
  ghost: nodeGraphScopePhosphorLookDefaults.ghost,
  trail: nodeGraphScopePhosphorLookDefaults.trail,
  burnAmount: nodeGraphScopePhosphorLookDefaults.burnAmount,
  residualSchema: nodeGraphScopePhosphorLookDefaults.residualSchema,
  dot1Brightness: nodeGraphScopePhosphorLookDefaults.brightness,
  dot1Color: "#75ebff",
  dot1Enabled: true,
  dot1Size: nodeGraphScopePhosphorLookDefaults.size,
  dotBudget: nodeGraphScopePhosphorLookDefaults.dotBudget,
  // budget = solid line until the dots run out. length = dots across the full path.
  // dots = one stamp per sample, no chord between samples.
  drawMode: "dots",
  fullDotEconomy: nodeGraphScopePhosphorLookDefaults.fullDotEconomy,
  dotsOnly: false,
  sourceSync: false,
  skipDiscontinuities: false,
  gradientStops: nodeGraphScopeCyanGradientStops,
  lineThickness: nodeGraphScopePhosphorLookDefaults.blur,
  pixelDensity: nodeGraphScopePhosphorLookDefaults.pixelDensity,
  scale: nodeGraphScopePhosphorLookDefaults.scale,
});

/**
 * Schema SSOT for every scope2d face (Lorenz, snowflake, Jerobeam, standalone…).
 * Module type no longer forks stamp defaults — 1D/2D share phosphor look.
 */
function nodeGraphScope2dSettingsDefaultsForModuleType(_type) {
  return nodeGraphScope2dSettingsDefaults;
}


const nodeGraphXyPadDisplaySettingsDefaults = Object.freeze({
  background: nodeGraphScopePhosphorLookDefaults.background,
  // Ghost = super-exp hang; Trail = linear blend.
  ghost: nodeGraphScopePhosphorLookDefaults.ghost,
  trail: nodeGraphScopePhosphorLookDefaults.trail,
  burnAmount: 1,
  residualSchema: 4,
  // Phosphor beam brightness 0..1.
  dot1Brightness: nodeGraphScopePhosphorLookDefaults.brightness,
  // Peak = last gradient stop (UI overlay tints from this).
  dot1Color: nodeGraphScopePhosphorLookDefaults.peakColor,
  // Phosphor beam diameter (exp size map).
  dot1Size: nodeGraphScopePhosphorLookDefaults.size,
  // Soft-stamp budget ceiling.
  dotBudget: nodeGraphScopePhosphorLookDefaults.dotBudget,
  // Default ON: always spend dense packing up to Dot budget (hard solid trails).
  fullDotEconomy: nodeGraphScopePhosphorLookDefaults.fullDotEconomy,
  dotsOnly: false,
  gradientStops: nodeGraphScopePhosphorLookDefaults.gradientStops,
  // Stamp blur 0–1: 0 hard disc, 1 full soft bleed.
  lineThickness: nodeGraphScopePhosphorLookDefaults.blur,
  // 0 = single pixel, 1 = layout×dpr, 4 = 4× AA (phosphor face only).
  pixelDensity: nodeGraphScopePhosphorLookDefaults.pixelDensity,
  // UI puck radius as fraction of face min side (vector overlay, not energy).
  puckSize: 0.045,
});


const nodeGraphScope2dTraceSettingsDefaults = Object.freeze({
  // Same family as PhosphorLight / Number Readout face plate.
  background: nodeGraphScopePhosphorLookDefaults.background,
  backgroundHue: nodeGraphScopePhosphorLookDefaults.backgroundHue,
  backgroundBrightness: 0,
  gradientStops: nodeGraphScopePhosphorLookDefaults.gradientStops,
  // Beam ink: unit hue hex + plausible brightness (black → hue @ 0.5 → white).
  dot1Brightness: 0.5,
  dot1Color: typeof nodeGraphHueUnitHex === "function"
    ? nodeGraphHueUnitHex(
      typeof nodeGraphHueDegFromHex === "function"
        ? nodeGraphHueDegFromHex(nodeGraphScopePhosphorLookDefaults.peakColor)
        : 60,
    )
    : nodeGraphScopePhosphorLookDefaults.peakColor,
  dot1Enabled: true,
  dot1Size: nodeGraphScopePhosphorLookDefaults.size,
  secondaryColor: typeof nodeGraphHueUnitHex === "function"
    ? nodeGraphHueUnitHex(240)
    : "#0000ff",
  ghost: typeof PhosphorResidual !== "undefined"
    ? PhosphorResidual.DEFAULT_GHOST
    : nodeGraphScopePhosphorLookDefaults.ghost,
  trail: typeof PhosphorResidual !== "undefined"
    ? PhosphorResidual.DEFAULT_TRAIL
    : nodeGraphScopePhosphorLookDefaults.trail,
  // Vector stroke; density scales face buffer for lo-fi/chunky look (default 1).
  pixelDensity: nodeGraphScopePhosphorLookDefaults.pixelDensity,
  scale: nodeGraphScopePhosphorLookDefaults.scale,
  skipDiscontinuities: false,
  dotBudget: 2048,
  drawMode: "budget",
});

/** Optional per-type 2D Trace defaults. */
const nodeGraphModuleScope2dTraceDisplayDefaultOverrides = Object.freeze({});

function nodeGraphScope2dTraceSettingsDefaultsForModuleType(type) {
  const overrides = type
    ? nodeGraphModuleScope2dTraceDisplayDefaultOverrides[type]
    : null;
  if (!overrides) {
    return nodeGraphScope2dTraceSettingsDefaults;
  }
  return Object.freeze({
    ...nodeGraphScope2dTraceSettingsDefaults,
    ...overrides,
  });
}


const nodeGraphScope1dTraceSettingsDefaults = Object.freeze({
  // Trace-family plate + woscope beam; sweep from 1D Phosphor.
  background: nodeGraphScopePhosphorLookDefaults.background,
  backgroundHue: nodeGraphScopePhosphorLookDefaults.backgroundHue,
  backgroundBrightness: 0,
  // Phosphor-style Bright → TraceWoscope intensity (1 = full).
  dot1Brightness: 1,
  // Left / mono default red (stereo Meet-friendly with blue Right).
  dot1Color: typeof nodeGraphHueUnitHex === "function"
    ? nodeGraphHueUnitHex(0)
    : "#ff0000",
  dot1Enabled: true,
  dot1Size: nodeGraphScope2dTraceSettingsDefaults.dot1Size,
  secondaryBrightness: 1,
  secondaryColor: typeof nodeGraphHueUnitHex === "function"
    ? nodeGraphHueUnitHex(240)
    : "#0000ff",
  secondaryEnabled: true,
  secondarySize: nodeGraphScope2dTraceSettingsDefaults.dot1Size,
  ghost: typeof PhosphorResidual !== "undefined"
    ? PhosphorResidual.DEFAULT_GHOST
    : nodeGraphScopePhosphorLookDefaults.ghost,
  trail: typeof PhosphorResidual !== "undefined"
    ? PhosphorResidual.DEFAULT_TRAIL
    : nodeGraphScopePhosphorLookDefaults.trail,
  pixelDensity: nodeGraphScopePhosphorLookDefaults.pixelDensity,
  scale: nodeGraphScopePhosphorLookDefaults.scale,
  skipDiscontinuities: true,
  // Rising-edge auto-trigger on In — ON for new 1D Trace modules (Tube Sat too).
  sourceSync: true,
  sweepHz: 4,
  sweepCycles: 4,
  // Shared colormap LUT: |sample| energy → color on TraceWoscope. Tube Sat overrides crt-amber.
  gradientStops: nodeGraphScopePhosphorLookDefaults.gradientStops,
  dotBudget: 2048,
  drawMode: "budget",
});



