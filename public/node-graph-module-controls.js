// Module control-surface helpers.
//
// Goals:
// 1) Keep `inputs` vs `parameters` explicit (see MODULE_PATTERN_REFERENCE
//    "Three control surfaces") without forcing every module's pitch/phase/amp
//    math into one shared scheme — each module stays its own universe.
// 2) Optional `controls[]` on a definition expands into inputs/parameters so
//    new modules can declare knob + jack roles in one place.
// 3) Universal linear frequency jack `f`: absolute Hz in [0, speedLimit].
//    Speed Limit lives next to Speed in the header (default 20000).

const nodeGraphModuleDefinitionCache = new Map();

function nodeGraphLiveSpeedLimitHz() {
  const n = Number(nodeGraphMvp?.live?.speedLimit);
  if (Number.isFinite(n) && n > 0) {
    return n;
  }
  return 20000;
}

function setNodeGraphLiveSpeedLimit(value) {
  const n = Number(value);
  const next = Number.isFinite(n) && n > 0 ? n : 20000;
  if (Number(nodeGraphMvp?.live?.speedLimit) === next) {
    return;
  }
  if (nodeGraphMvp?.live) {
    nodeGraphMvp.live.speedLimit = next;
  }
  if (typeof sendNodeGraphLiveSpeedLimit === "function") {
    sendNodeGraphLiveSpeedLimit();
  }
  if (typeof renderNodeGraphSpeedLimitReadout === "function") {
    renderNodeGraphSpeedLimitReadout();
  }
}

/**
 * Optional definition.controls[] entries:
 *   { key, label, knob?, signalInput?, signalInputPort?, signalInputLabel?,
 *     defaultValue, min, max, mid, step, kind, unit, ...param fields }
 * signalInput:true → left jack (port name = signalInputPort || key)
 * knob !== false with param-ish fields → parameters[] entry
 * Existing inputs/parameters are preserved and merged (no duplicates).
 */
function expandNodeGraphModuleControls(definition) {
  if (!definition || typeof definition !== "object") {
    return definition;
  }
  const controls = Array.isArray(definition.controls) ? definition.controls : null;
  if (!controls || !controls.length) {
    return definition;
  }
  const inputs = [...(definition.inputs || [])];
  const inputLabels = { ...(definition.inputLabels || {}) };
  const parameters = [...(definition.parameters || [])];
  for (const control of controls) {
    if (!control || typeof control !== "object") {
      continue;
    }
    if (control.signalInput) {
      const port = String(control.signalInputPort || control.key || "").trim();
      if (port && !inputs.includes(port)) {
        inputs.push(port);
      }
      if (port && (control.signalInputLabel || control.label)) {
        inputLabels[port] = String(control.signalInputLabel || control.label);
      }
    }
    const wantsKnob = control.knob !== false && control.key && (
      Object.hasOwn(control, "defaultValue") ||
      Object.hasOwn(control, "min") ||
      Object.hasOwn(control, "max")
    );
    if (wantsKnob && !parameters.some((parameter) => parameter.key === control.key)) {
      const { signalInput, signalInputPort, signalInputLabel, knob, signalCombine, ...paramFields } = control;
      parameters.push(paramFields);
    }
  }
  return {
    ...definition,
    inputs,
    inputLabels,
    parameters,
  };
}

function nodeGraphModuleDefinition(type) {
  const key = String(type || "");
  if (!key) {
    return null;
  }
  if (nodeGraphModuleDefinitionCache.has(key)) {
    return nodeGraphModuleDefinitionCache.get(key);
  }
  const raw = typeof nodeGraphModuleDefinitions !== "undefined"
    ? nodeGraphModuleDefinitions[key]
    : null;
  const expanded = expandNodeGraphModuleControls(raw);
  nodeGraphModuleDefinitionCache.set(key, expanded);
  return expanded;
}

function nodeGraphModuleDefinitionInvalidateCache(type = null) {
  if (type == null) {
    nodeGraphModuleDefinitionCache.clear();
    return;
  }
  nodeGraphModuleDefinitionCache.delete(String(type));
}

/**
 * Read universal linear frequency jack `f` (raw bus sample, Hz scale).
 * Returns null when unwired. Does not apply Speed Limit (that happens after
 * Frequency multiplies in nodeGraphResolveFrequencyHz).
 */
function nodeGraphReadFInputHz(mixInput, hasInput, nodeId, options = {}) {
  const port = options.port || "f";
  if (typeof hasInput !== "function" || !hasInput(nodeId, port)) {
    return null;
  }
  const raw = typeof mixInput === "function" ? Number(mixInput(nodeId, port)) : Number(mixInput);
  if (!Number.isFinite(raw)) {
    return 0;
  }
  return raw;
}

/**
 * Resolve oscillator Hz. Through-zero: signed Hz allowed (negative = reverse).
 * When `f` is wired: hz = f × Frequency (both may be signed).
 * When unwired: baseHz (signed). Result clamped to [−Speed Limit, +Speed Limit].
 */
function nodeGraphResolveFrequencyHz(baseHz, fHzOrNull, options = {}) {
  const limitOpt = Number(options?.limit);
  const maxHz = Number.isFinite(limitOpt) && limitOpt > 0
    ? limitOpt
    : (typeof nodeGraphLiveSpeedLimitHz === "function" ? nodeGraphLiveSpeedLimitHz() : 20000);
  const clampSigned = (hz) => {
    if (!Number.isFinite(hz)) return 0;
    if (hz > maxHz) return maxHz;
    if (hz < -maxHz) return -maxHz;
    return hz;
  };
  if (fHzOrNull != null && Number.isFinite(Number(fHzOrNull))) {
    const mult = Number(baseHz);
    const m = Number.isFinite(mult) ? mult : 0;
    return clampSigned(Number(fHzOrNull) * m);
  }
  const base = Number(baseHz);
  if (!Number.isFinite(base)) return 0;
  return clampSigned(base);
}
