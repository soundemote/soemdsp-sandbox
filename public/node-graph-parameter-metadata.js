// normalizeNodeSliderCurve now lives in node-graph-slider-metadata.js
// (this file's copy was byte-for-byte identical).

function normalizeNodeSliderCurveAmount(value, fallback = 0) {
  const number = Number(value);
  const safe = Number.isFinite(number) ? number : Number(fallback);
  return clampNodeSliderValue(Number.isFinite(safe) ? safe : 0, -1, 1);
}

function normalizeNodeGraphMetadataSmoothingSeconds(value) {
  // null/undefined both mean "unset -> defer to the global auto-smoothing
  // time". Number(null) is 0 in JS (unlike Number(undefined), which is NaN),
  // so without this check a value that was already correctly normalized to
  // null upstream (e.g. normalizeNodeGraphPatchParameterMetadata falling back
  // to a definition's already-null smoothingSeconds) would get silently
  // coerced into 0 -- "smooth over exactly zero seconds" -- right here in the
  // one function every metadata-building path funnels through.
  if (value === null || value === undefined) {
    return null;
  }
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    return 0;
  }
  // (0, 1) = seconds (e.g. 0.0333). ≥ 1 = sample count. Matches the worklet.
  if (number > 0 && number < 1) {
    return number;
  }
  return Math.round(number);
}

// global          -- always use the global smoothing time (default: matches
//                    this app's pre-existing behavior for parameters that
//                    never set an explicit smoothingSeconds)
// internal        -- this parameter's own smoothingSeconds sample count
//                    (0 samples bypasses smoothing for this parameter only)
// internalGlobal  -- internal samples PLUS the global smoothing time
// off             -- always instant, ignoring both internal and global
// (blockSize retired — was under construction; maps to global on load)
const nodeGraphMetadataSmoothingModes = Object.freeze(["global", "internal", "internalGlobal", "off"]);

function normalizeNodeGraphMetadataSmoothingMode(value) {
  if (value === "blockSize") {
    return "global";
  }
  return nodeGraphMetadataSmoothingModes.includes(value) ? value : "global";
}

// Smoothing TYPE = filter kernel:
//   linear   — time-based linear lerp (UI L): full smoothing time to target
//   onePole  — classic exponential chase (1P)
//   twoPole  — cascaded one-poles (2P); between 1P and Papoulis
//   papoulis — Optimum-L order-3 (Π)
//   none     — instant snap (legacy linearSmoothing=false)
// Distinct from smoothing SOURCE (global/internal/off — the time constant).
const nodeGraphMetadataSmoothingTypes = Object.freeze(
  typeof nodeGraphParameterSmootherFilterTypes !== "undefined"
    ? nodeGraphParameterSmootherFilterTypes
    : ["linear", "onePole", "twoPole", "papoulis", "none"],
);

function normalizeNodeGraphMetadataSmoothingType(value) {
  if (typeof normalizeNodeGraphParameterSmootherFilterType === "function") {
    return normalizeNodeGraphParameterSmootherFilterType(value);
  }
  const key = String(value || "").trim();
  if (key === "none" || key === "off" || key === "instant" || key === "0") {
    return "none";
  }
  if (key === "L" || key === "l" || key === "linear" || key === "lerp") {
    return "linear";
  }
  if (key === "2P" || key === "2p" || key === "twoPole" || key === "two-pole" || key === "2pole") {
    return "twoPole";
  }
  if (key === "1P" || key === "1p") {
    return "onePole";
  }
  return nodeGraphMetadataSmoothingTypes.includes(key) ? key : "onePole";
}

/** linearSmoothing flag kept for older scripts; derived from smoothingType. */
function nodeGraphMetadataLinearSmoothingFromType(smoothingType) {
  return normalizeNodeGraphMetadataSmoothingType(smoothingType) !== "none";
}

function nodeGraphDefaultParamsForType(type) {
  const params = {};
  const definition = typeof nodeGraphModuleDefinition === "function"
    ? nodeGraphModuleDefinition(type)
    : nodeGraphModuleDefinitions[type];
  for (const parameter of definition?.parameters || []) {
    // spawnValue = first instance only. defaultValue stays paramMeta.def (reset).
    const value = Object.hasOwn(parameter, "spawnValue")
      ? Number(parameter.spawnValue)
      : Number(parameter.defaultValue);
    params[parameter.key] = Number.isFinite(value) ? value : 0;
  }
  return params;
}

function nodeGraphModuleOutputPorts(type) {
  const definition = typeof nodeGraphModuleDefinition === "function"
    ? nodeGraphModuleDefinition(type)
    : nodeGraphModuleDefinitions[type];
  if (!definition) {
    return [];
  }
  return [
    ...(definition.outputs || []),
    ...(definition.dataOutputs || []),
    ...(definition.parameters || []).map((parameter) => parameter.key),
  ];
}

function nodeGraphPatchNodeParameterDefinitions(node) {
  const patchNode = typeof node === "string" ? nodeGraphPatchNode(node) : node;
  const definition = typeof nodeGraphModuleDefinition === "function"
    ? nodeGraphModuleDefinition(patchNode?.type)
    : nodeGraphModuleDefinitions[patchNode?.type];
  if (!definition) {
    return [];
  }
  const parameters = (definition.parameters || []).map((parameter) => {
    const alias = normalizeNodeGraphPatchMetadataAlias(patchNode?.paramMeta?.[parameter.key]?.alias);
    return alias
      ? { ...parameter, defaultLabel: parameter.label, label: alias }
      : { ...parameter, defaultLabel: parameter.label };
  });
  return parameters;
}
const nodeGraphCodeblockDefaultCode = "Out1 = In1;";
const nodeGraphCodeblockPortNamePattern = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const nodeGraphCodeblockShadowedGlobals = Object.freeze([
  "window",
  "document",
  "fetch",
  "Function",
  "eval",
  "globalThis",
  "self",
]);
const nodeGraphCodeblockReservedNames = Object.freeze(new Set([
  ...nodeGraphCodeblockShadowedGlobals,
  "__context",
  "__ctx",
  "__inputs",
  "__outputs",
  "__state",
  "arguments",
  "await",
  "break",
  "case",
  "catch",
  "class",
  "const",
  "continue",
  "debugger",
  "default",
  "delete",
  "do",
  "else",
  "export",
  "extends",
  "false",
  "finally",
  "frame",
  "frames",
  "for",
  "if",
  "import",
  "in",
  "instanceof",
  "let",
  "new",
  "null",
  "return",
  "sampleRate",
  "super",
  "switch",
  "state",
  "this",
  "throw",
  "time",
  "true",
  "try",
  "typeof",
  "var",
  "void",
  "while",
  "with",
  "yield",
  "dt",
]));

function nodeGraphCodeblockIdentifierIsValid(name) {
  const value = String(name || "").trim();
  return nodeGraphCodeblockPortNamePattern.test(value) &&
    !nodeGraphCodeblockReservedNames.has(value);
}

function normalizeNodeGraphCodeblockPortList(value, fallbackPrefix = "In") {
  const raw = Array.isArray(value)
    ? value
    : String(value ?? "").split(/[\s,]+/);
  const ports = [];
  const seen = new Set();
  for (const item of raw) {
    const name = String(item || "").trim();
    if (!nodeGraphCodeblockIdentifierIsValid(name) || seen.has(name)) {
      continue;
    }
    seen.add(name);
    ports.push(name.slice(0, 32));
  }
  if (!ports.length) {
    ports.push(`${fallbackPrefix}1`);
  }
  return ports;
}

function normalizeNodeGraphCodeblock(value = {}) {
  const source = value && typeof value === "object" ? value : {};
  const inputs = normalizeNodeGraphCodeblockPortList(source.inputs, "In");
  const reserved = new Set(inputs);
  const rawOutputs = normalizeNodeGraphCodeblockPortList(source.outputs, "Out");
  const outputs = rawOutputs.filter((port) => !reserved.has(port));
  if (!outputs.length) {
    let index = 1;
    let name = "Out1";
    while (reserved.has(name)) {
      index += 1;
      name = `Out${index}`;
    }
    outputs.push(name);
  }
  return {
    code: String(source.code ?? nodeGraphCodeblockDefaultCode),
    inputs,
    outputs,
  };
}

function nodeGraphPatchNodeInputPorts(node) {
  const patchNode = typeof node === "string" ? nodeGraphPatchNode(node) : node;
  if (patchNode?.type === "codeblock") {
    return normalizeNodeGraphCodeblock(patchNode.codeblock).inputs;
  }
  if (patchNode?.type === "customDisplay") {
    return normalizeNodeGraphCustomDisplay(patchNode.customDisplay).inputs;
  }
  if (patchNode?.type === "canvas") {
    return normalizeNodeGraphCanvasScript(patchNode.canvasScript).inputs;
  }
  if (patchNode?.type === "screenSpaceShader") {
    return normalizeNodeGraphScreenSpaceShader(patchNode.screenSpaceShader).inputs;
  }
  const definition = typeof nodeGraphModuleDefinition === "function"
    ? nodeGraphModuleDefinition(patchNode?.type)
    : nodeGraphModuleDefinitions[patchNode?.type];
  // Data-plane inlets (e.g. Additive Graph) stack above signal CV so Graph stays on top.
  return [
    ...(definition?.dataInputs || []),
    ...(definition?.inputs || []),
  ];
}

function nodeGraphPatchNodeOutputPorts(node) {
  const patchNode = typeof node === "string" ? nodeGraphPatchNode(node) : node;
  if (patchNode?.type === "codeblock") {
    return normalizeNodeGraphCodeblock(patchNode.codeblock).outputs;
  }
  if (patchNode?.type === "customDisplay") {
    return [];
  }
  return nodeGraphModuleOutputPorts(patchNode?.type);
}
/** Definition `hidden: true` is the default-off visibility, not a permanent skip. */
function nodeGraphParameterDefaultVisible(parameter) {
  return parameter?.hidden !== true;
}

/**
 * Effective slider-row visibility. Patch `paramMeta.visible` overrides the
 * definition default. Shown by default; already-hidden definitions stay hidden
 * until the metaparameter Show toggle is turned on.
 */
function nodeGraphParameterEffectiveVisible(parameter, paramMetaEntry) {
  if (paramMetaEntry && typeof paramMetaEntry === "object" && typeof paramMetaEntry.visible === "boolean") {
    return paramMetaEntry.visible;
  }
  return nodeGraphParameterDefaultVisible(parameter);
}

function applyNodeGraphParameterRowVisibility(rowOrSlider, visible) {
  const row = rowOrSlider?.classList?.contains?.("node-parameter-row")
    ? rowOrSlider
    : rowOrSlider?.closest?.(".node-parameter-row");
  if (!row) {
    return null;
  }
  const shown = visible !== false;
  row.hidden = !shown;
  row.classList.toggle("node-parameter-row-hidden", !shown);
  return row;
}

let nodeGraphParameterVisibilityRefreshDepth = 0;

function refreshNodeGraphModuleParameterVisibility(element, patchNode) {
  if (!element || !patchNode || nodeGraphParameterVisibilityRefreshDepth > 0) {
    return;
  }
  nodeGraphParameterVisibilityRefreshDepth += 1;
  try {
    refreshNodeGraphModuleParameterVisibilityBody(element, patchNode);
  } finally {
    nodeGraphParameterVisibilityRefreshDepth -= 1;
  }
}

function refreshNodeGraphModuleParameterVisibilityBody(element, patchNode) {
  const parameters = nodeGraphModuleDefinitions[patchNode.type]?.parameters || [];
  for (const parameter of parameters) {
    const row = element.querySelector(`.node-parameter-row[data-param="${CSS.escape(parameter.key)}"]`);
    if (!row) {
      continue;
    }
    applyNodeGraphParameterRowVisibility(
      row,
      nodeGraphParameterEffectiveVisible(parameter, patchNode.paramMeta?.[parameter.key]),
    );
  }
  if (typeof syncNodeGraphLayoutBNoParamsClass === "function") {
    syncNodeGraphLayoutBNoParamsClass(element, patchNode.type, patchNode.ui);
  }
  if (typeof syncNodeGraphModuleChromeElement === "function") {
    syncNodeGraphModuleChromeElement(element, patchNode);
  } else if (typeof nodeGraphApplyModuleShellHeightCssVars === "function") {
    nodeGraphApplyModuleShellHeightCssVars(element, patchNode);
  }
  if (typeof markNodeGraphRenderPending === "function") {
    markNodeGraphRenderPending();
  }
}

function nodeGraphParameterOutputPort(typeOrNode, port) {
  const list = typeOrNode && typeof typeOrNode === "object"
    ? nodeGraphPatchNodeParameterDefinitions(typeOrNode)
    : (nodeGraphModuleDefinitions[typeOrNode]?.parameters || []);
  const parameter = list.find((entry) => entry.key === port) || null;
  if (!parameter) {
    return null;
  }
  // Visibility is UI only. `parameterOutput: false` is the no-jack flag.
  if (parameter.parameterOutput === false) {
    return null;
  }
  return parameter;
}

function normalizeNodeGraphMetadataChoices(value, fallback = []) {
  const choices = Array.isArray(value)
    ? value
    : String(value ?? "").split(",");
  const normalized = choices
    .map((choice) => String(choice).trim())
    .filter(Boolean);
  return normalized.length ? normalized : [...fallback];
}

function nodeGraphDefaultMetadataMaxDigits(kind = "decimal") {
  return normalizeNodeMetadataKind(kind) === "frequency" ? 5 : 3;
}

function normalizeNodeGraphMetadataMaxDigits(value, kind = "decimal") {
  // 0 = integer (no fraction). 1…12 = digit budget. Missing → kind default.
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return nodeGraphDefaultMetadataMaxDigits(kind);
  }
  return Math.max(0, Math.min(12, Math.round(number)));
}

function nodeGraphInferParameterMetadataKind(parameter = {}) {
  const explicitKind = normalizeNodeMetadataKind(parameter.kind);
  if (explicitKind && explicitKind !== "decimal") {
    return explicitKind;
  }
  const label = String(parameter.label || parameter.key || "").toLowerCase();
  const unit = String(parameter.unit || "").toLowerCase();
  return unit === "hz" || label.includes("frequency") ? "frequency" : explicitKind;
}

function nodeGraphParameterDefinitionMetadata(parameter) {
  if (!parameter) {
    return null;
  }
  const min = Number(parameter.min);
  const max = Number(parameter.max);
  // Domain min/max come only from the module definition (and later user metaparam
  // edits). Do NOT bake Project Speed Limit into paramMeta — that duplicated the
  // live DSP ceiling and froze wrong ranges when limit was low at spawn.
  // Speed Limit is a single runtime clamp (resolveFrequencyHz / worklet).
  const safeMin = Number.isFinite(min) ? min : 0;
  const safeMax = Number.isFinite(max) && max >= safeMin ? max : safeMin + 1;
  const mid = Number(parameter.mid);
  const def = Number(parameter.defaultValue);
  const step = Number(parameter.step);
  const safeMid = clampNodeSliderValue(Number.isFinite(mid) ? mid : (safeMin + safeMax) / 2, safeMin, safeMax);
  const kind = nodeGraphInferParameterMetadataKind(parameter);
  const midInsideRange = safeMid > safeMin && safeMid < safeMax;
  let smoothingType = "onePole";
  if (Object.hasOwn(parameter, "smoothingType") && parameter.smoothingType != null && String(parameter.smoothingType).trim() !== "") {
    smoothingType = normalizeNodeGraphMetadataSmoothingType(parameter.smoothingType);
  } else if (parameter.linearSmoothing === false) {
    // Legacy checkbox: false meant instant snaps, not linear ramps.
    smoothingType = "none";
  }
  const defined = {
    choices: normalizeNodeGraphMetadataChoices(parameter.choices || []),
    control: String(parameter.control || "").trim() === "number" ? "number" : "",
    curveAmount: normalizeNodeSliderCurveAmount(parameter.curveAmount),
    def: clampNodeSliderValue(Number.isFinite(def) ? def : safeMin, safeMin, safeMax),
    displayChoices: Boolean(parameter.displayChoices),
    // Independent of displayChoices. Default true only when the definition
    // omitted the key and there are choices (legacy modules).
    divideChoicesVisibly: Object.hasOwn(parameter, "divideChoicesVisibly")
      ? Boolean(parameter.divideChoicesVisibly)
      : Boolean(parameter.choices?.length),
    kind,
    bipolar: Object.hasOwn(parameter, "bipolar")
      ? Boolean(parameter.bipolar)
      : (safeMin < 0 && safeMax > 0 && Math.abs(safeMid) <= Number.EPSILON),
    linearSmoothing: nodeGraphMetadataLinearSmoothingFromType(smoothingType),
    max: safeMax,
    maxDigits: normalizeNodeGraphMetadataMaxDigits(parameter.maxDigits, kind),
    mid: safeMid,
    min: safeMin,
    nonlinearSlider: Object.hasOwn(parameter, "nonlinearSlider")
      ? Boolean(parameter.nonlinearSlider)
      : midInsideRange && Math.abs(safeMid - (safeMin + safeMax) / 2) > Number.EPSILON,
    sliderCurve: normalizeNodeSliderCurve(parameter.sliderCurve, Object.hasOwn(parameter, "nonlinearSlider")
      ? Boolean(parameter.nonlinearSlider)
      : midInsideRange && Math.abs(safeMid - (safeMin + safeMax) / 2) > Number.EPSILON),
    showSign: Boolean(parameter.showSign),
    removeTrailingZeros: Boolean(parameter.removeTrailingZeros),
    smoothingMode: normalizeNodeGraphMetadataSmoothingMode(parameter.smoothingMode),
    smoothingSeconds: normalizeNodeGraphMetadataSmoothingSeconds(parameter.smoothingSeconds),
    smoothingType,
    step: Number.isFinite(step) && step > 0 ? step : 0,
    tooltip: String(parameter.tooltip || "").slice(
      0,
      typeof NODE_GRAPH_METADATA_TOOLTIP_MAX_CHARS === "number"
        ? NODE_GRAPH_METADATA_TOOLTIP_MAX_CHARS
        : 2000,
    ),
    // After MOD: hard re-clamp only when requested (default false).
    // Resource params use constraint cpu|gpu|ram; wraparound always wraps.
    modClamp: Object.hasOwn(parameter, "modClamp")
      ? Boolean(parameter.modClamp)
      : false,
    hardClamp: Boolean(parameter.hardClamp),
    constraint: Array.isArray(parameter.constraint)
      ? parameter.constraint.join(" ")
      : (parameter.constraint ? String(parameter.constraint) : ""),
    unit: parameter.unit ?? "",
    wraparound: Boolean(parameter.wraparound),
    // Yellow Graph / explicit: param-out jack emits DOMAIN, not unit 0…1.
    outputDomain: Boolean(parameter.outputDomain),
    visible: nodeGraphParameterDefaultVisible(parameter),
  };
  if (nodeGraphParameterNeedsDefaultModuleSmoothing(defined, parameter)) {
    nodeGraphApplyDefaultModuleSmoothing(defined);
  }
  if (nodeGraphParameterIsSmoothingTimeControl(parameter)) {
    nodeGraphApplySmoothingTimeControlPolicy(defined);
  }
  return defined;
}

/**
 * Continuous params with no time (or 0) get the shared 0.0333 s linear
 * *internal* stash. Source stays Global so they follow the header time.
 * Discrete / off / already-timed params are left alone.
 */
function nodeGraphParameterNeedsDefaultModuleSmoothing(meta, source = {}) {
  if (!meta || typeof meta !== "object") {
    return false;
  }
  if (normalizeNodeGraphMetadataSmoothingMode(meta.smoothingMode) === "off") {
    return false;
  }
  if (normalizeNodeGraphMetadataSmoothingType(meta.smoothingType) === "none") {
    return false;
  }
  if (source.linearSmoothing === false || meta.linearSmoothing === false) {
    return false;
  }
  if (Array.isArray(meta.choices) && meta.choices.length > 0) {
    return false;
  }
  if (String(meta.kind || "") === "seed") {
    return false;
  }
  const seconds = Number(meta.smoothingSeconds);
  return !Number.isFinite(seconds) || seconds <= 0;
}

function nodeGraphApplyDefaultModuleSmoothing(meta) {
  if (!meta || typeof meta !== "object") {
    return meta;
  }
  const seconds = typeof nodeGraphModuleSmoothingDefaultSeconds === "function"
    ? nodeGraphModuleSmoothingDefaultSeconds()
    : 0.0333;
  meta.smoothingType = "linear";
  meta.linearSmoothing = true;
  meta.smoothingMode = "global";
  meta.smoothingSeconds = seconds;
  return meta;
}

function normalizeNodeMetadataKindTemplate(template = {}, kind = "decimal") {
  const choices = normalizeNodeGraphMetadataChoices(template.choices || []);
  const min = Number(template.min);
  const max = Number(template.max);
  const mid = Number(template.mid);
  const hasRange = Number.isFinite(min) && Number.isFinite(max) && max > min;
  const nonlinearSlider = Object.hasOwn(template, "nonlinearSlider")
    ? Boolean(template.nonlinearSlider)
    : hasRange && Number.isFinite(mid) && Math.abs(mid - (min + max) / 2) > Number.EPSILON;
  return {
    ...template,
    choices,
    curveAmount: normalizeNodeSliderCurveAmount(template.curveAmount),
    displayChoices: Boolean(template.displayChoices),
    // Independent of displayChoices (labels vs separators).
    divideChoicesVisibly: Object.hasOwn(template, "divideChoicesVisibly")
      ? Boolean(template.divideChoicesVisibly)
      : Boolean(choices.length),
    maxDigits: normalizeNodeGraphMetadataMaxDigits(template.maxDigits, kind),
    nonlinearSlider,
    sliderCurve: normalizeNodeSliderCurve(template.sliderCurve, nonlinearSlider),
  };
}

function nodeGraphDefaultParamMetaForType(type) {
  const metadata = {};
  for (const parameter of nodeGraphModuleDefinitions[type]?.parameters || []) {
    metadata[parameter.key] = nodeGraphParameterDefinitionMetadata(parameter);
  }
  return metadata;
}
function normalizeNodeGraphPatchMetadataAlias(alias) {
  return String(alias ?? "").trim().slice(0, 64);
}

/** Yellow Graph modules: param-out / readouts / DSP use DOMAIN (real units). */
function nodeGraphModuleUsesYellowGraphDomainParamOut(type) {
  const t = String(type || "");
  if (
    t === "additiveGenerator"
    || t === "additiveLinearFilter"
    || t === "additiveAnalogFilter"
    || t === "additiveLadderFilter"
    || t === "additiveBubble"
    || t === "additiveFrequencySkew"
    || t === "additiveQuantizeFreq"
    || t === "additiveQuantizePhase"
    || t === "additiveHarmonicMath"
    || t === "additiveFrequencyMath"
    || t === "additiveFrequencySlope"
    || t === "additiveNoisyFreq"
    || t === "additiveNoisyPhase"
    || t === "additiveNoisyPan"
    || t === "additiveNoisyAmp"
    || t === "additiveImage"
    || t === "additiveOut"
  ) {
    return true;
  }
  const def = typeof nodeGraphModuleDefinitions !== "undefined"
    ? nodeGraphModuleDefinitions[t]
    : null;
  if (!def) {
    return false;
  }
  const dataIns = Array.isArray(def.dataInputs) ? def.dataInputs : [];
  const dataOuts = Array.isArray(def.dataOutputs) ? def.dataOutputs : [];
  return dataIns.includes("Graph") || dataOuts.includes("Graph");
}

function normalizeNodeGraphPatchParameterMetadata(type, key, metadata = {}) {
  const parameter = nodeGraphModuleDefinitions[type]?.parameters?.find(
    (candidate) => candidate.key === key,
  );
  const fallback = parameter
    ? nodeGraphParameterDefinitionMetadata(parameter)
    : null;
  if (!fallback) {
    return null;
  }
  const definitionLocked = type === "audioPlayer" && key === "transport";
  const source = !definitionLocked && metadata && typeof metadata === "object" ? metadata : {};
  let min = Number(Object.hasOwn(source, "min") ? source.min : fallback.min);
  let max = Number(Object.hasOwn(source, "max") ? source.max : fallback.max);
  if (!Number.isFinite(min)) {
    min = fallback.min;
  }
  if (!Number.isFinite(max)) {
    max = fallback.max;
  }
  if (min > max) {
    [min, max] = [max, min];
  }
  if (max <= min) {
    max = min + 1;
  }
  let mid = Number(Object.hasOwn(source, "mid") ? source.mid : fallback.mid);
  let def = Number(Object.hasOwn(source, "def") ? source.def : fallback.def);
  const step = Number(Object.hasOwn(source, "step") ? source.step : fallback.step);
  const kind = normalizeNodeMetadataKind(source.kind || fallback.kind);
  // Frequency metaparam accidentally saved as 0…1 (unit mistaken for Hz): restore
  // the module’s full-band default range so EQ/filter faces show real Hz.
  const unitStr = String(Object.hasOwn(source, "unit") ? source.unit ?? "" : fallback.unit || "")
    .trim()
    .toLowerCase();
  if (
    kind === "frequency"
    && (unitStr === "hz" || unitStr === "")
    && Number.isFinite(fallback.max)
    && fallback.max >= 1000
    && max <= 1
    && min >= 0
  ) {
    min = Number.isFinite(fallback.min) ? fallback.min : 0;
    max = fallback.max;
    if (!Number.isFinite(mid) || mid <= 1) {
      mid = Number.isFinite(fallback.mid) ? fallback.mid : Math.min(1000, max);
    }
    if (!Number.isFinite(def) || def <= 1) {
      def = Number.isFinite(fallback.def) ? fallback.def : mid;
    }
  }
  const choices = normalizeNodeGraphMetadataChoices(
    Object.hasOwn(source, "choices") ? source.choices : fallback.choices,
    fallback.choices,
  );
  const normalized = {
    alias: normalizeNodeGraphPatchMetadataAlias(
      Object.hasOwn(metadata || {}, "alias") ? metadata.alias : fallback.alias,
    ),
    choices,
    curveAmount: normalizeNodeSliderCurveAmount(
      Object.hasOwn(source, "curveAmount") ? source.curveAmount : fallback.curveAmount,
      fallback.curveAmount,
    ),
    def: clampNodeSliderValue(Number.isFinite(def) ? def : fallback.def, min, max),
    // Independent flags: display = choice labels; divide = visible separators.
    // Never derive one from the other (that coupled the two checkboxes in UI).
    displayChoices: Object.hasOwn(source, "displayChoices")
      ? Boolean(source.displayChoices)
      : Boolean(fallback.displayChoices),
    divideChoicesVisibly: Object.hasOwn(source, "divideChoicesVisibly")
      ? Boolean(source.divideChoicesVisibly)
      : Boolean(fallback.divideChoicesVisibly),
    kind,
    bipolar: Object.hasOwn(source, "bipolar")
      ? Boolean(source.bipolar)
      : Boolean(fallback.bipolar),
    max,
    maxDigits: normalizeNodeGraphMetadataMaxDigits(
      Object.hasOwn(source, "maxDigits") ? source.maxDigits : fallback.maxDigits,
      kind,
    ),
    mid: clampNodeSliderValue(Number.isFinite(mid) ? mid : fallback.mid, min, max),
    min,
    nonlinearSlider: Object.hasOwn(source, "nonlinearSlider")
      ? Boolean(source.nonlinearSlider)
      : fallback.nonlinearSlider,
    sliderCurve: normalizeNodeSliderCurve(
      Object.hasOwn(source, "sliderCurve") ? source.sliderCurve : fallback.sliderCurve,
      Object.hasOwn(source, "nonlinearSlider") ? Boolean(source.nonlinearSlider) : fallback.nonlinearSlider,
    ),
    showSign: Object.hasOwn(source, "showSign") ? Boolean(source.showSign) : fallback.showSign,
    removeTrailingZeros: Object.hasOwn(source, "removeTrailingZeros")
      ? Boolean(source.removeTrailingZeros)
      : Boolean(fallback.removeTrailingZeros),
    smoothingMode: normalizeNodeGraphMetadataSmoothingMode(
      Object.hasOwn(source, "smoothingMode") ? source.smoothingMode : fallback.smoothingMode,
    ),
    smoothingSeconds: normalizeNodeGraphMetadataSmoothingSeconds(
      Object.hasOwn(source, "smoothingSeconds") ? source.smoothingSeconds : fallback.smoothingSeconds,
    ),
    smoothingType: (() => {
      if (Object.hasOwn(source, "smoothingType") && source.smoothingType != null && String(source.smoothingType).trim() !== "") {
        return normalizeNodeGraphMetadataSmoothingType(source.smoothingType);
      }
      // Migrate legacy linearSmoothing=false → instant type (not UI L).
      // Continuous “no smooth” is SMOOTHING SOURCE ❌ (mode off), not type L.
      if (Object.hasOwn(source, "linearSmoothing") && source.linearSmoothing === false) {
        return "none";
      }
      if (Object.hasOwn(source, "linearSmoothing") && source.linearSmoothing === true) {
        return normalizeNodeGraphMetadataSmoothingType(fallback.smoothingType || "onePole");
      }
      return normalizeNodeGraphMetadataSmoothingType(fallback.smoothingType || "onePole");
    })(),
    step: Number.isFinite(step) && step > 0 ? step : 0,
    tooltip: String(Object.hasOwn(source, "tooltip") ? source.tooltip ?? "" : fallback.tooltip || "").slice(
      0,
      typeof NODE_GRAPH_METADATA_TOOLTIP_MAX_CHARS === "number"
        ? NODE_GRAPH_METADATA_TOOLTIP_MAX_CHARS
        : 2000,
    ),
    modClamp: (() => {
      if (Object.hasOwn(source, "modClamp")) {
        return Boolean(source.modClamp);
      }
      // Legacy paramMeta used unboundedMax/Min for “mod may leave domain”.
      if (Object.hasOwn(source, "unboundedMax") || Object.hasOwn(source, "unboundedMin")) {
        return false;
      }
      return Boolean(fallback.modClamp);
    })(),
    hardClamp: Object.hasOwn(source, "hardClamp")
      ? Boolean(source.hardClamp)
      : Boolean(fallback.hardClamp),
    constraint: Object.hasOwn(source, "constraint")
      ? String(source.constraint ?? "")
      : String(fallback.constraint || ""),
    unit: String(Object.hasOwn(source, "unit") ? source.unit ?? "" : fallback.unit),
    wraparound: fallback.wraparound && Object.hasOwn(source, "wraparound")
      ? Boolean(source.wraparound)
      : fallback.wraparound,
    visible: Object.hasOwn(source, "visible")
      ? Boolean(source.visible)
      : nodeGraphParameterDefaultVisible(parameter),
  };
  normalized.linearSmoothing = nodeGraphMetadataLinearSmoothingFromType(normalized.smoothingType);
  if (nodeGraphParameterNeedsDefaultModuleSmoothing(normalized, source)) {
    nodeGraphApplyDefaultModuleSmoothing(normalized);
  }
  // User-facing smoothing-time params must not themselves be smoothed.
  if (nodeGraphParameterIsSmoothingTimeControl({ key })) {
    nodeGraphApplySmoothingTimeControlPolicy(normalized);
  }
  // XY pad mouse/phase targets are instant UI only (audio path owns Papoulis).
  if (
    type === "xyPad"
    && (
      (typeof nodeGraphXyPadDspIsUnsmoothedParamKey === "function"
        && nodeGraphXyPadDspIsUnsmoothedParamKey(key))
      || ["x", "y", "xPhase", "yPhase"].includes(String(key || ""))
    )
  ) {
    normalized.smoothingType = "linear";
    normalized.linearSmoothing = false;
    normalized.smoothingMode = "off";
    normalized.smoothingSeconds = 0;
  }
  // Input / Output volume: always 0.0333s linear. Saved paramMeta cannot change it.
  if (nodeGraphIsHardcodedIoVolumeParam(type, key)) {
    nodeGraphApplyHardcodedIoVolumeSmoothing(normalized);
  }
  // Yellow Graph: param-out jacks emit DOMAIN (e.g. Phase Skew 0…1000), not 0…1.
  if (nodeGraphModuleUsesYellowGraphDomainParamOut(type)) {
    normalized.outputDomain = true;
  } else if (Object.hasOwn(source, "outputDomain")) {
    normalized.outputDomain = Boolean(source.outputDomain);
  } else {
    normalized.outputDomain = Boolean(fallback.outputDomain);
  }
  return normalized;
}

const NODE_GRAPH_IO_VOLUME_SMOOTHING_SECONDS = typeof nodeGraphModuleSmoothingDefaultSeconds === "function"
  ? nodeGraphModuleSmoothingDefaultSeconds()
  : 0.0333;

function nodeGraphIsHardcodedIoVolumeParam(type, key) {
  const t = String(type || "");
  const k = String(key || "");
  if ((t === "output") && k === "volume") {
    return true;
  }
  if ((t === "audioInput") && (k === "amplitude" || k === "level")) {
    return true;
  }
  return false;
}

/** Params whose *value* is a smoothing time (Toggle/Momentary/Knob Smooth, …). */
function nodeGraphParameterIsSmoothingTimeControl(parameter = {}) {
  const key = String(parameter?.key || "").trim();
  return key === "smoothingSeconds";
}

/**
 * App-wide: a parameter that sets smoothing time must not be smoothed.
 * Smoothing TYPE = linear, SOURCE = off (disabled). Saved paramMeta cannot override.
 */
function nodeGraphApplySmoothingTimeControlPolicy(meta) {
  if (!meta || typeof meta !== "object") {
    return meta;
  }
  meta.smoothingType = "linear";
  meta.linearSmoothing = false;
  meta.smoothingMode = "off";
  meta.smoothingSeconds = 0;
  return meta;
}

function nodeGraphApplyHardcodedIoVolumeSmoothing(normalized) {
  if (!normalized || typeof normalized !== "object") {
    return normalized;
  }
  normalized.smoothingType = "linear";
  normalized.linearSmoothing = true;
  normalized.smoothingMode = "internal";
  normalized.smoothingSeconds = NODE_GRAPH_IO_VOLUME_SMOOTHING_SECONDS;
  return normalized;
}
