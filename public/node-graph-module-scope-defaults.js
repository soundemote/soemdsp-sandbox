// Pure settings default constants extracted from node-graph-module-scopes.js
// (Phase D). Load BEFORE node-graph-module-scopes.js. No functions.

const nodeGraphTraceDisplayMaxZoomSeconds = 10;

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
  "attackDecay",
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
  "midiNotePitch",
  "midiOut",
  "pluckEnvelope",
  "bloomGlow",
  "chromaColor",
  "rgbaHsla",
  "sandboxVisuals",
  "stepSequencer",
  "triggerCounter",
  "triggerDivider",
  "vactrolEnvelopeSeries",
  "vactrolEnvelopeCustom",
]);


/**
 * Shared phosphor stamp defaults for all 1D + 2D phosphor faces
 * (line burn, scope2d, XY pad, value, attractors, …).
 * Bright / Size / Ghost / Trail / Burn / Scale / Pixel density / Dot budget.
 */
const nodeGraphScopePhosphorLookDefaults = Object.freeze({
  // Face / gradient floor (stop 0).
  background: "#000004",
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
  // Bright 0…1 (deposit / tip).
  brightness: 0.08,
  // Ghost = extreme analog (super-exp) hang; Trail = linear blend; Burn = sticky floor (off).
  // Burn Amount = residual deposit gain vs Bright (1 = deposit at Bright).
  ghost: 0.45,
  trail: 0,
  burn: 0,
  burnAmount: 1,
  residualSchema: 3,
  // Size 0…1 diameter map (0 → 1px floor, 1 → full face min side).
  size: 0.02,
  // Stamp blur 0 hard … 1 soft.
  blur: 0.35,
  // Max phosphor stamps / frame (economy spreads when over).
  dotBudget: 2048,
  // Face buffer scale (1 = native layout×dpr; <1 pixelated; 2–4 supersample).
  pixelDensity: 1,
  // Amplitude zoom.
  scale: 1,
  // Thrifty packing by default (Full Dot Economy ON for dense).
  fullDotEconomy: false,
});


const nodeGraphTraceDisplaySettingsDefaults = Object.freeze({
  // Instant Trace is a VECTOR stroke, not phosphor energy — do NOT inherit the
  // phosphor look brightness (0.08) / size (0.02). Those made Output Meet
  // strokes nearly invisible so only the plate color seemed to work.
  background: "#000000",
  // Full-ish ink so Left/Right colors read as chosen (Brightness still 0…1).
  brightness: 0.95,
  // Mono / primary stroke (Output Left). Pure red so Meet (red+blue) is green.
  color: "#ff0000",
  dot1Enabled: true,
  // ~2–3 CSS px on typical faces (size 0 still floors at 1 device px).
  dot1Size: 0.035,
  // Output stereo: combine (Meet) | lighter | screen | source-over | multiply | …
  stereoBlend: "combine",
  // Meet always auto from Left/Right (complement + soft screen lift).
  meetColor: "auto",
  secondaryBrightness: 0.95,
  secondaryColor: "#0000ff",
  secondaryEnabled: true,
  secondarySize: 0.035,
  secondaryLineThickness: 0,
  cycles: 2,
  // Stroke softness 0…1 (hard → soft skirt). History plot, not phosphor burn.
  lineThickness: 0.15,
  // Max verts before the drawer switches to sparse dots.
  dotBudget: 2048,
  // Vector stroke into a density-scaled face buffer (lo-fi look when < 1).
  // Not a phosphor energy grid — still one polyline; density only sets buffer size.
  pixelDensity: 1,
  padding: 0,
  // Amplitude zoom for quieter signals (1 = full-scale ±1 fills the face).
  scale: 1,
  skipDiscontinuities: false,
  // off | left | right | mono — Output stereo chooses which channel triggers the shared window.
  // Non-output single traces treat any non-off as "sync on" for that buffer.
  sourceSync: false,
  syncChannel: "off",
  zoomSeconds: 0.05,
  historySeconds: 0.05,
  // XYZ Trace: stack all three on one plot, or split the face into three bands.
  xyzLayout: "stack",
});


/**
 * 1D phosphor (line burn) — from polyBlep face on Desktop/init.json.
 * Applied to all 1D oscillators with a 1D oscilloscope (polyBlep, osc, blit, …).
 */
const nodeGraphLineBurnSettingsDefaults = Object.freeze({
  background: "#000000",
  // Sticky Burn off; decay is legacy 1−trail only.
  burn: 0,
  burnAmount: 1,
  residualSchema: 3,
  decay: 0.3,
  ghost: 0.3,
  trail: 0.7,
  scale: 1,
  // Bright stamps; Size 0 → 1px floor (crisp 1D pen).
  dot1Brightness: 0.8,
  dot1Color: "#75ebff",
  dot1Enabled: true,
  dot1Size: 0,
  lineThickness: 0.2,
  pixelDensity: 1,
  dotBudget: 1024,
  fullDotEconomy: false,
  dotsOnly: false,
  // Rising-edge auto-trigger on In (snaps pen left). Off = free-run + Reset jack.
  sourceSync: false,
  // Fast sweep — matches polyBlep init preset (~one screen of high-freq detail).
  sweepSeconds: 0.01,
  gradientStops: Object.freeze([
    Object.freeze({ t: 0, color: "#000000" }),
    Object.freeze({ t: 0.18, color: "#214247" }),
    Object.freeze({ t: 0.55, color: "#52a5b3" }),
    Object.freeze({ t: 1, color: "#75ebff" }),
  ]),
});


const nodeGraphTraceDisplayRenderPointBudgetDefault = 4096;


const nodeGraphZeroDBurnSettingsDefaults = Object.freeze({
  background: nodeGraphScopePhosphorLookDefaults.background,
  bipolarBrightness: false,
  ghost: nodeGraphScopePhosphorLookDefaults.ghost,
  trail: nodeGraphScopePhosphorLookDefaults.trail,
  burn: 0,
  burnAmount: 1,
  residualSchema: 3,
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
  fullDotEconomy: nodeGraphScopePhosphorLookDefaults.fullDotEconomy,
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
  burn: 0,
  burnAmount: 1,
  residualSchema: 3,
  decay: 1,
  dot1Enabled: true,
  // Stroke diameter: 0 = 1px, 1 = face square min side.
  dot1Size: 0.04,
  lineLength: 1,
  // Edge soft (beam uBlur). Mild default = AA without a big glow; draw floors ~0.12.
  lineThickness: 0.18,
  pixelDensity: 1,
  // Amplitude zoom (Y).
  scale: 1,
});


// Value LED (numberReadout): phosphor / lit seven-segment face.
// App-wide residual axes: Bright = light only; Ghost/Trail/Burn = hang only (no brightness).
const nodeGraphNumberReadoutSettingsDefaults = Object.freeze({
  faceStyle: "led",
  background: nodeGraphScopePhosphorLookDefaults.background,
  // Bright 0…1: 0 = mid grey, 0.5 = full Hue, 1 = white (never black).
  brightness: 0.5,
  // Live digit “light” — single solid color (not the residual gradient).
  color: nodeGraphScopePhosphorLookDefaults.peakColor,
  // Trail 0…1 — linear residual blend (PhosphorResidual.trail).
  trail: 0.88,
  // Ghost 0…1 — extreme analog (super-exp) hang (NOT brightness).
  ghost: 0.45,
  // Burn 0…1 — sticky residual floor (0 = off).
  burn: 0,
  burnAmount: 1,
  // Burn Amount — multiplies Bright for residual deposits only (default 1×).
  burnAmount: 1,
  residualSchema: 3,
  // Legacy aliases (normalize keeps trail/ghost aliases in sync).
  residual: 0.88,
  ghostBrightness: 0.45,
  // Total digit budget (whole + fractional) for limit_decimals / GROW-off bins.
  // Default 8 ≈ former hard-coded 6 integer slots + 2 decimals.
  digits: 8,
  decimals: 2,
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

// Value LCD — vector DSEG (no phosphor residual / Ghost / Trail hang).
// FX: permanent dim “8” plate (unlit segments) + dialable glass inner shadow.
const nodeGraphValueLcdSettingsDefaults = Object.freeze({
  faceStyle: "lcd",
  background: "#b0b5a6",
  brightness: 1,
  // Foreground (digit ink) — full color widget, same family as Background.
  color: "#1a2216",
  // Residual hang unused on LCD (kept 0 so old patches don’t re-enable burn path).
  trail: 0,
  ghost: 0,
  burn: 0,
  burnAmount: 1,
  residualSchema: 3,
  residual: 0,
  ghostBrightness: 0,
  // Total digit budget (whole + fractional). Default 9 ≈ 6 int + 3 decimals.
  digits: 9,
  decimals: 3,
  // Same budget policy as Value LED (GROW off / digit bins on).
  decimalBudget: true,
  digitBins: true,
  lightBlend: "source-over",
  // Digit inset 0…1 vs each axis half (0 = flush, 1 = pin).
  facePadding: 0.1,
  polarity: "bipolar",
  removeTrailingZeros: false,
  // LCD Ghost: permanent “8” skeleton amount 0…1 (soft fade from 0).
  unlitSegments: 0.01,
  // Inner shadow (screen glass): Gaussian soft inset + CSS-like offset.
  // LCD glass inset shadow defaults.
  innerShadowDistance: 1,
  innerShadowSharpness: 0.732,
  // Offset −1…1 (0 = centered). Positive X/Y darkens left/top (light from +X/+Y).
  innerShadowOffsetX: 0,
  innerShadowOffsetY: 0.135,
  gradientStops: Object.freeze([]),
});


/** Knob module face: macro-dial look; colors + rotation are per-node Display Settings. */
const nodeGraphKnobFaceDisplaySettingsDefaults = Object.freeze({
  decimals: 2,
  background: "#000000",
  arcFill: "#f1b84b",
  arcTrack: "#3a3428",
  // Centered arc span (degrees Bias 0→1). Start is always −span/2 (no Offset).
  rotationDegrees: 270,
  // Dial ring size 0…1 (1 = fill available dial cell; label/value unchanged).
  dialSize: 1,
  // Title / value size 0…1 (independent of knob size).
  labelSize: 0.45,
  valueSize: 0.45,
  // Title / value vs the dial: above | mid | below.
  labelPosition: "above",
  valuePosition: "mid",
  // Hole size 0…1 (0 = solid disk, ~0.7 default, 1 = thin outer ring).
  innerRadius: 0.7,
});


const nodeGraphSpectrogramFftSizes = Object.freeze([
  128, 256, 512, 1024, 2048, 4096, 8192, 16384,
]);

const nodeGraphSpectrogramSettingsDefaults = Object.freeze({
  fftSize: 1024,
  historySeconds: 2,
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


/** Shared cyan energy LUT from Desktop/init.json phosphor faces. */
const nodeGraphScope2dInitGradientStops = Object.freeze([
  Object.freeze({ t: 0, color: "#000000" }),
  Object.freeze({ t: 0.18, color: "#214247" }),
  Object.freeze({ t: 0.55, color: "#52a5b3" }),
  Object.freeze({ t: 1, color: "#75ebff" }),
]);

const nodeGraphScope2dSettingsDefaults = Object.freeze({
  // 2D phosphor base — overridden per attractor / Jerobeam family below.
  background: "#000000",
  ghost: nodeGraphScopePhosphorLookDefaults.ghost,
  trail: nodeGraphScopePhosphorLookDefaults.trail,
  burn: 0,
  burnAmount: 1,
  residualSchema: 3,
  decay: 1 - nodeGraphScopePhosphorLookDefaults.trail,
  dot1Brightness: nodeGraphScopePhosphorLookDefaults.brightness,
  dot1Color: "#75ebff",
  dot1Enabled: true,
  dot1Size: nodeGraphScopePhosphorLookDefaults.size,
  dotBudget: 1024,
  fullDotEconomy: false,
  dotsOnly: false,
  sourceSync: false,
  gradientStops: nodeGraphScope2dInitGradientStops,
  lineThickness: nodeGraphScopePhosphorLookDefaults.blur,
  pixelDensity: 1,
  scale: 1,
});

/**
 * Per-module 2D Phosphor defaults from Desktop/init.json faces:
 *   snowflake · lorenzAttractor · keplerBouwkamp (→ all Jerobeam)
 *   nyquistShannon (exception)
 */
const nodeGraphScope2dSnowflakeDisplayDefaults = Object.freeze({
  ghost: 0.82,
  trail: 0.88,
  burn: 0,
  burnAmount: 1,
  residualSchema: 3,
  decay: 0.12,
  dot1Brightness: 0.0818,
  dot1Size: 0.032,
  dotBudget: 1024,
  fullDotEconomy: true,
  dotsOnly: true,
  lineThickness: 0.225,
  gradientStops: nodeGraphScope2dInitGradientStops,
});

const nodeGraphScope2dLorenzDisplayDefaults = Object.freeze({
  ghost: 0.82,
  trail: 0.88,
  burn: 0,
  burnAmount: 1,
  residualSchema: 3,
  decay: 0.12,
  dot1Brightness: 0.3546,
  dot1Size: 0.009,
  dotBudget: 1024,
  fullDotEconomy: false,
  dotsOnly: false,
  lineThickness: 0.35,
  gradientStops: nodeGraphScope2dInitGradientStops,
});

const nodeGraphScope2dKeplerJerobeamDisplayDefaults = Object.freeze({
  ghost: 0.37,
  trail: 0.5845,
  burn: 0,
  burnAmount: 1,
  residualSchema: 3,
  decay: 0.4155,
  dot1Brightness: 0.92,
  dot1Size: 0.009,
  dotBudget: 1024,
  fullDotEconomy: false,
  dotsOnly: false,
  lineThickness: 0.35,
  gradientStops: nodeGraphScope2dInitGradientStops,
});

const nodeGraphScope2dNyquistDisplayDefaults = Object.freeze({
  ghost: 0.45,
  trail: 0,
  burn: 0,
  burnAmount: 1,
  residualSchema: 3,
  decay: 1,
  dot1Brightness: 0.8,
  dot1Size: 0.02,
  dotBudget: 1024,
  fullDotEconomy: false,
  dotsOnly: false,
  lineThickness: 0,
  gradientStops: Object.freeze([
    Object.freeze({ t: 0, color: "#000000" }),
    Object.freeze({ t: 0.18, color: "#214247" }),
    Object.freeze({ t: 0.55, color: "#52a5b3" }),
    Object.freeze({ t: 0.7704, color: "#52a5b3" }),
    Object.freeze({ t: 1, color: "#75ebff" }),
  ]),
});

/** Jerobeam family (all use keplerBouwkamp face except nyquistShannon). */
const nodeGraphJerobeamScope2dModuleTypes = Object.freeze([
  "blubb",
  "boing",
  "keplerBouwkamp",
  "mushroom",
  "radar",
  "spiral",
  "torus",
  "wirdoSpiral",
]);

const nodeGraphModuleScope2dDisplayDefaultOverrides = Object.freeze({
  snowflake: nodeGraphScope2dSnowflakeDisplayDefaults,
  lorenzAttractor: nodeGraphScope2dLorenzDisplayDefaults,
  nyquistShannon: nodeGraphScope2dNyquistDisplayDefaults,
  ...Object.fromEntries(
    nodeGraphJerobeamScope2dModuleTypes.map((type) => [type, nodeGraphScope2dKeplerJerobeamDisplayDefaults]),
  ),
});

/** Full scope2d defaults for a module type (global + optional overrides). */
function nodeGraphScope2dSettingsDefaultsForModuleType(type) {
  const overrides = type
    ? nodeGraphModuleScope2dDisplayDefaultOverrides[type]
    : null;
  if (!overrides) {
    return nodeGraphScope2dSettingsDefaults;
  }
  return Object.freeze({
    ...nodeGraphScope2dSettingsDefaults,
    ...overrides,
  });
}


const nodeGraphXyPadDisplaySettingsDefaults = Object.freeze({
  background: nodeGraphScopePhosphorLookDefaults.background,
  // Ghost = super-exp hang; Trail = linear blend; Burn = sticky floor (off).
  ghost: nodeGraphScopePhosphorLookDefaults.ghost,
  trail: nodeGraphScopePhosphorLookDefaults.trail,
  burn: 0,
  burnAmount: 1,
  residualSchema: 3,
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
  dot1Brightness: nodeGraphScopePhosphorLookDefaults.brightness,
  dot1Color: nodeGraphScopePhosphorLookDefaults.peakColor,
  dot1Enabled: true,
  dot1Size: nodeGraphScopePhosphorLookDefaults.size,
  // Closed X/Y orbits (RoundShape, attractors) need ≥1 period on screen.
  // 0.05s only drew a sliver of a 1 Hz Lissajous and looked “broken up”.
  historySeconds: 1,
  lineThickness: nodeGraphScopePhosphorLookDefaults.blur,
  // Vector stroke; density scales face buffer for lo-fi/chunky look (default 1).
  pixelDensity: nodeGraphScopePhosphorLookDefaults.pixelDensity,
  scale: nodeGraphScopePhosphorLookDefaults.scale,
});

/** Optional per-type 2D Trace defaults (e.g. longer history for closed shapes). */
const nodeGraphModuleScope2dTraceDisplayDefaultOverrides = Object.freeze({
  // RoundShape: full closed sine→square orbit; keep a couple of cycles.
  ellipsoid: Object.freeze({
    historySeconds: 2,
  }),
  ellipsoidOsc: Object.freeze({
    historySeconds: 2,
  }),
});

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


