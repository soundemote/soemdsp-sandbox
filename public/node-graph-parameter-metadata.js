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
  return Number.isFinite(number) && number >= 0 ? Math.round(number) : 0;
}

// global          -- always use the global smoothing time (default: matches
//                    this app's pre-existing behavior for parameters that
//                    never set an explicit smoothingSeconds)
// blockSize       -- always smooth over exactly one audio block
// internal        -- this parameter's own smoothingSeconds sample count
//                    (0 samples bypasses smoothing for this parameter only)
// internalGlobal  -- internal samples PLUS the global smoothing time
// off             -- always instant, ignoring both internal and global
const nodeGraphMetadataSmoothingModes = Object.freeze(["global", "blockSize", "internal", "internalGlobal", "off"]);

function normalizeNodeGraphMetadataSmoothingMode(value) {
  return nodeGraphMetadataSmoothingModes.includes(value) ? value : "global";
}

function nodeGraphDefaultParamsForType(type) {
  const params = {};
  for (const parameter of nodeGraphModuleDefinitions[type]?.parameters || []) {
    const value = Number(parameter.defaultValue);
    params[parameter.key] = Number.isFinite(value) ? value : 0;
  }
  return params;
}

function nodeGraphModuleOutputPorts(type) {
  const definition = nodeGraphModuleDefinitions[type];
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
  const definition = nodeGraphModuleDefinitions[patchNode?.type];
  if (!definition) {
    return [];
  }
  const parameters = (definition.parameters || []).map((parameter) => {
    const alias = normalizeNodeGraphPatchMetadataAlias(patchNode?.paramMeta?.[parameter.key]?.alias);
    return alias
      ? { ...parameter, defaultLabel: parameter.label, label: alias }
      : { ...parameter, defaultLabel: parameter.label };
  });
  if (patchNode?.type === "clapPlugin") {
    for (const [key, sourceMetadata] of Object.entries(patchNode.paramMeta || {})) {
      if (parameters.some((parameter) => parameter.key === key)) {
        continue;
      }
      const metadata = normalizeNodeGraphPatchParameterMetadata(patchNode.type, key, sourceMetadata);
      if (!metadata?.clapParamId && metadata?.clapParamId !== 0) {
        continue;
      }
      parameters.push({
        ...metadata,
        defaultValue: metadata.def,
        key,
        label: metadata.clapParamName || metadata.label || key,
      });
    }
  }
  return parameters;
}

function nodeGraphClapAudioPortLaneNames(ports = [], fallback = []) {
  if (!Array.isArray(ports) || ports.length === 0) {
    return [...fallback];
  }
  const used = new Set();
  const names = [];
  const unique = (base) => {
    const cleanBase = String(base || "").trim() || "Port";
    let name = cleanBase;
    let index = 2;
    while (used.has(name)) {
      name = `${cleanBase} ${index}`;
      index += 1;
    }
    used.add(name);
    return name;
  };
  for (const port of ports) {
    const source = port && typeof port === "object" ? port : {};
    const base = String(source.name || "").trim() || `Port ${names.length + 1}`;
    const channelCount = Math.max(1, Math.min(64, Math.round(Number(source.channelCount) || 1)));
    if (channelCount === 1) {
      names.push(unique(base));
    } else if (channelCount === 2) {
      names.push(unique(`${base} L`));
      names.push(unique(`${base} R`));
    } else {
      for (let channel = 1; channel <= channelCount; channel += 1) {
        names.push(unique(`${base} ${channel}`));
      }
    }
  }
  return names.length ? names : [...fallback];
}

function nodeGraphModuleGroupEndpointName(node, fallback, used = new Set()) {
  const base = normalizeNodeGraphPatchNodeAlias(node?.alias) ||
    String(node?.label || "").trim() ||
    fallback;
  let name = base || fallback;
  let index = 2;
  while (used.has(name)) {
    name = `${base || fallback} ${index}`;
    index += 1;
  }
  used.add(name);
  return name;
}

function nodeGraphModuleGroupInterfaceFromPatch(sourcePatch = {}) {
  const inputs = [];
  const outputs = [];
  const inputNames = new Set();
  const outputNames = new Set();
  for (const node of sourcePatch.nodes || []) {
    if (node.type === "groupInput") {
      inputs.push({
        name: nodeGraphModuleGroupEndpointName(node, inputs.length ? `In ${inputs.length + 1}` : "In", inputNames),
        nodeId: node.id,
        port: "Out",
      });
    } else if (node.type === "groupOutput") {
      outputs.push({
        name: nodeGraphModuleGroupEndpointName(node, outputs.length ? `Out ${outputs.length + 1}` : "Out", outputNames),
        nodeId: node.id,
        port: "Out",
      });
    }
  }
  return { inputs, outputs };
}

function normalizeNodeGraphModuleGroup(value = {}) {
  const source = value && typeof value === "object" ? value : {};
  const sourcePatch = source.sourcePatch && typeof source.sourcePatch === "object"
    ? cloneNodeGraphPatch(source.sourcePatch)
    : null;
  const inferred = nodeGraphModuleGroupInterfaceFromPatch(sourcePatch || {});
  return {
    defaultSize: {
      heightGu: Math.max(4, Number(source.defaultSize?.heightGu) || 6),
      widthGu: Math.max(5, Number(source.defaultSize?.widthGu) || 8),
    },
    description: String(source.description || ""),
    id: String(source.id || `group-${nodeGraphStableSeed(source.name || "module-group").toString(16)}`),
    inputs: Array.isArray(source.inputs) && source.inputs.length ? source.inputs.map((input) => ({ ...input })) : inferred.inputs,
    kind: "moduleGroup",
    name: String(source.name || "Module Group"),
    outputs: Array.isArray(source.outputs) && source.outputs.length ? source.outputs.map((output) => ({ ...output })) : inferred.outputs,
    parameters: Array.isArray(source.parameters) ? source.parameters.map((parameter) => ({ ...parameter })) : [],
    preview: source.preview && typeof source.preview === "object" ? { ...source.preview } : {},
    sourcePatch,
  };
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
  if (patchNode?.type === "scriptBox") {
    return normalizeNodeGraphScriptBox(patchNode.scriptBox).inputs;
  }
  if (patchNode?.type === "customDisplay") {
    return normalizeNodeGraphCustomDisplay(patchNode.customDisplay).inputs;
  }
  if (patchNode?.type === "moduleGroup") {
    return normalizeNodeGraphModuleGroup(patchNode.moduleGroup).inputs.map((input) => input.name);
  }
  if (patchNode?.type === "clapPlugin") {
    return nodeGraphClapAudioPortLaneNames(
      patchNode.clap?.audioInputs,
      nodeGraphModuleDefinitions.clapPlugin?.inputs || [],
    );
  }
  if (patchNode?.type === "canvas") {
    return normalizeNodeGraphCanvasScript(patchNode.canvasScript).inputs;
  }
  if (patchNode?.type === "screenSpaceShader") {
    return normalizeNodeGraphScreenSpaceShader(patchNode.screenSpaceShader).inputs;
  }
  const definition = nodeGraphModuleDefinitions[patchNode?.type];
  return [
    ...(definition?.inputs || []),
    ...(definition?.dataInputs || []),
  ];
}

function nodeGraphPatchNodeOutputPorts(node) {
  const patchNode = typeof node === "string" ? nodeGraphPatchNode(node) : node;
  if (patchNode?.type === "codeblock") {
    return normalizeNodeGraphCodeblock(patchNode.codeblock).outputs;
  }
  if (patchNode?.type === "scriptBox") {
    return normalizeNodeGraphScriptBox(patchNode.scriptBox).outputs;
  }
  if (patchNode?.type === "customDisplay") {
    return [];
  }
  if (patchNode?.type === "moduleGroup") {
    return normalizeNodeGraphModuleGroup(patchNode.moduleGroup).outputs.map((output) => output.name);
  }
  if (patchNode?.type === "clapPlugin") {
    return [
      ...nodeGraphClapAudioPortLaneNames(
        patchNode.clap?.audioOutputs,
        nodeGraphModuleDefinitions.clapPlugin?.outputs || [],
      ),
      ...nodeGraphPatchNodeParameterDefinitions(patchNode).map((parameter) => parameter.key),
    ];
  }
  return nodeGraphModuleOutputPorts(patchNode?.type);
}

function nodeGraphPatchNodeClapAudioInputPorts(node) {
  const patchNode = typeof node === "string" ? nodeGraphPatchNode(node) : node;
  return nodeGraphClapAudioPortLaneNames(
    patchNode?.clap?.audioInputs,
    nodeGraphModuleDefinitions.clapPlugin?.inputs || [],
  );
}

function nodeGraphPatchNodeClapAudioOutputPorts(node) {
  const patchNode = typeof node === "string" ? nodeGraphPatchNode(node) : node;
  return nodeGraphClapAudioPortLaneNames(
    patchNode?.clap?.audioOutputs,
    nodeGraphModuleDefinitions.clapPlugin?.outputs || [],
  );
}

function nodeGraphParameterOutputPort(typeOrNode, port) {
  if (typeOrNode && typeof typeOrNode === "object") {
    return nodeGraphPatchNodeParameterDefinitions(typeOrNode).find(
      (parameter) => parameter.key === port,
    ) || null;
  }
  return nodeGraphModuleDefinitions[typeOrNode]?.parameters?.find(
    (parameter) => parameter.key === port,
  ) || null;
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
  const safeMin = Number.isFinite(min) ? min : 0;
  const safeMax = Number.isFinite(max) && max >= safeMin ? max : safeMin + 1;
  const mid = Number(parameter.mid);
  const def = Number(parameter.defaultValue);
  const step = Number(parameter.step);
  const safeMid = clampNodeSliderValue(Number.isFinite(mid) ? mid : (safeMin + safeMax) / 2, safeMin, safeMax);
  const kind = nodeGraphInferParameterMetadataKind(parameter);
  const midInsideRange = safeMid > safeMin && safeMid < safeMax;
  return {
    choices: normalizeNodeGraphMetadataChoices(parameter.choices || []),
    control: String(parameter.control || "").trim() === "number" ? "number" : "",
    curveAmount: normalizeNodeSliderCurveAmount(parameter.curveAmount),
    def: clampNodeSliderValue(Number.isFinite(def) ? def : safeMin, safeMin, safeMax),
    displayChoices: Boolean(parameter.displayChoices),
    divideChoicesVisibly: Object.hasOwn(parameter, "divideChoicesVisibly")
      ? Boolean(parameter.divideChoicesVisibly)
      : Boolean(parameter.choices?.length),
    kind,
    linearSmoothing: parameter.linearSmoothing !== false,
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
    smoothingMode: normalizeNodeGraphMetadataSmoothingMode(parameter.smoothingMode),
    smoothingSeconds: normalizeNodeGraphMetadataSmoothingSeconds(parameter.smoothingSeconds),
    step: Number.isFinite(step) && step > 0 ? step : 0,
    tooltip: String(parameter.tooltip || "").slice(0, 240),
    unboundedMax: Boolean(parameter.unboundedMax),
    unboundedMin: Boolean(parameter.unboundedMin),
    unit: parameter.unit ?? "",
    wraparound: Boolean(parameter.wraparound),
  };
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

function nodeGraphClapPatchParameterFallbackMetadata(key, metadata = {}) {
  const source = metadata && typeof metadata === "object" ? metadata : {};
  const min = Number.isFinite(Number(source.min)) ? Number(source.min) : 0;
  const max = Number.isFinite(Number(source.max)) && Number(source.max) > min
    ? Number(source.max)
    : min + 1;
  const def = Number.isFinite(Number(source.def)) ? Number(source.def) : min;
  return {
    choices: Array.isArray(source.choices) ? source.choices : [],
    curveAmount: normalizeNodeSliderCurveAmount(source.curveAmount),
    def,
    displayChoices: Boolean(source.displayChoices),
    divideChoicesVisibly: Boolean(source.divideChoicesVisibly),
    kind: normalizeNodeMetadataKind(source.kind || "decimal"),
    linearSmoothing: Object.hasOwn(source, "linearSmoothing") ? Boolean(source.linearSmoothing) : true,
    max,
    maxDigits: normalizeNodeGraphMetadataMaxDigits(source.maxDigits, source.kind || "decimal"),
    mid: Number.isFinite(Number(source.mid)) ? Number(source.mid) : (min + max) / 2,
    min,
    nonlinearSlider: Boolean(source.nonlinearSlider),
    sliderCurve: normalizeNodeSliderCurve(source.sliderCurve, source.nonlinearSlider),
    showSign: Boolean(source.showSign),
    smoothingMode: normalizeNodeGraphMetadataSmoothingMode(source.smoothingMode),
    smoothingSeconds: normalizeNodeGraphMetadataSmoothingSeconds(source.smoothingSeconds),
    step: Number.isFinite(Number(source.step)) && Number(source.step) > 0 ? Number(source.step) : 0,
    tooltip: String(source.tooltip || "").slice(0, 240),
    unboundedMax: Boolean(source.unboundedMax),
    unboundedMin: Boolean(source.unboundedMin),
    unit: String(source.unit || ""),
    wraparound: Boolean(source.wraparound),
  };
}

function normalizeNodeGraphPatchMetadataAlias(alias) {
  return String(alias ?? "").trim().slice(0, 64);
}

function normalizeNodeGraphPatchParameterMetadata(type, key, metadata = {}) {
  const parameter = nodeGraphModuleDefinitions[type]?.parameters?.find(
    (candidate) => candidate.key === key,
  );
  const fallback = parameter
    ? nodeGraphParameterDefinitionMetadata(parameter)
    : type === "clapPlugin"
      ? nodeGraphClapPatchParameterFallbackMetadata(key, metadata)
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
  const mid = Number(Object.hasOwn(source, "mid") ? source.mid : fallback.mid);
  const def = Number(Object.hasOwn(source, "def") ? source.def : fallback.def);
  const step = Number(Object.hasOwn(source, "step") ? source.step : fallback.step);
  const kind = normalizeNodeMetadataKind(source.kind || fallback.kind);
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
    displayChoices: Object.hasOwn(source, "displayChoices")
      ? Boolean(source.displayChoices)
      : fallback.displayChoices,
    divideChoicesVisibly: Object.hasOwn(source, "divideChoicesVisibly")
      ? Boolean(source.divideChoicesVisibly)
      : Boolean(fallback.divideChoicesVisibly || (choices.length && fallback.displayChoices)),
    kind,
    linearSmoothing: Object.hasOwn(source, "linearSmoothing")
      ? Boolean(source.linearSmoothing)
      : fallback.linearSmoothing,
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
    smoothingMode: normalizeNodeGraphMetadataSmoothingMode(
      Object.hasOwn(source, "smoothingMode") ? source.smoothingMode : fallback.smoothingMode,
    ),
    smoothingSeconds: normalizeNodeGraphMetadataSmoothingSeconds(
      Object.hasOwn(source, "smoothingSeconds") ? source.smoothingSeconds : fallback.smoothingSeconds,
    ),
    step: Number.isFinite(step) && step > 0 ? step : 0,
    tooltip: String(Object.hasOwn(source, "tooltip") ? source.tooltip ?? "" : fallback.tooltip || "").slice(0, 240),
    unboundedMax: Object.hasOwn(source, "unboundedMax")
      ? Boolean(source.unboundedMax)
      : Boolean(fallback.unboundedMax),
    unboundedMin: Object.hasOwn(source, "unboundedMin")
      ? Boolean(source.unboundedMin)
      : Boolean(fallback.unboundedMin),
    unit: String(Object.hasOwn(source, "unit") ? source.unit ?? "" : fallback.unit),
    wraparound: fallback.wraparound && Object.hasOwn(source, "wraparound")
      ? Boolean(source.wraparound)
      : fallback.wraparound,
  };
  if (type === "clapPlugin") {
    const clapParamId = Number(source.clapParamId);
    const clapParamIndex = Number(source.clapParamIndex);
    return {
      ...normalized,
      ...(Number.isFinite(clapParamId) ? { clapParamId: Math.round(clapParamId) } : {}),
      ...(Number.isFinite(clapParamIndex) ? { clapParamIndex: Math.round(clapParamIndex) } : {}),
      clapParamName: String(source.clapParamName || key).slice(0, 128),
    };
  }
  return normalized;
}
