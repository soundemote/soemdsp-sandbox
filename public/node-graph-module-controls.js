// Module control-surface helpers.
//
// Goals:
// 1) Keep `inputs` vs `parameters` explicit (see MODULE_PATTERN_REFERENCE
//    "Three control surfaces") without forcing every module's pitch/phase/amp
//    math into one shared scheme — each module stays its own universe.
// 2) Optional `controls[]` on a definition expands into inputs/parameters so
//    new modules can declare knob + jack roles in one place.
// 3) Project Speed Limit: single max Hz for frequency domains, f-jack clamp,
//    and DSP caps. No project minimum frequency (0 is allowed). Header + patch
//    audio field; default 20000 (user-adjustable).

const nodeGraphModuleDefinitionCache = new Map();

/** Default project speed limit (Hz). Full-band frequency knobs use this. */
const NODE_GRAPH_PROJECT_SPEED_LIMIT_DEFAULT_HZ = 20000;
/** Upper bound for the Speed Limit control itself (not signal Hz floor). */
const NODE_GRAPH_PROJECT_SPEED_LIMIT_CONTROL_MAX_HZ = 192000;

function nodeGraphProjectSpeedLimitDefaultHz() {
  return NODE_GRAPH_PROJECT_SPEED_LIMIT_DEFAULT_HZ;
}

/**
 * Project maximum frequency (Hz). Prefer live session value, then patch.audio,
 * then default. No minimum frequency for signals — only this maximum.
 */
function nodeGraphProjectSpeedLimitHz() {
  const live = Number(nodeGraphMvp?.live?.speedLimit);
  if (Number.isFinite(live) && live > 0) {
    return live;
  }
  const fromPatch = Number(nodeGraphMvp?.patch?.audio?.speedLimitHz);
  if (Number.isFinite(fromPatch) && fromPatch > 0) {
    return fromPatch;
  }
  return NODE_GRAPH_PROJECT_SPEED_LIMIT_DEFAULT_HZ;
}

/** Alias used by f-jack / live transport path. */
function nodeGraphLiveSpeedLimitHz() {
  return nodeGraphProjectSpeedLimitHz();
}

/**
 * Domain max for a frequency parameter declaration.
 * Full-band params (declared max ≥ default speed limit) track the live project
 * limit so raising Speed Limit widens knobs; smaller intentional maxes stay put
 * but never exceed the project limit.
 */
function nodeGraphFrequencyParamDomainMaxHz(declaredMax) {
  const limit = nodeGraphProjectSpeedLimitHz();
  const d = Number(declaredMax);
  const fullBand = NODE_GRAPH_PROJECT_SPEED_LIMIT_DEFAULT_HZ;
  if (Number.isFinite(d) && d > 0) {
    if (d >= fullBand - 1e-9) {
      return limit;
    }
    return Math.min(d, limit);
  }
  return limit;
}

/** Clamp unsigned Hz into [0, project speed limit]. No positive minimum. */
function nodeGraphClampHzToProjectSpeedLimit(hz) {
  const limit = nodeGraphProjectSpeedLimitHz();
  const n = Number(hz);
  if (!Number.isFinite(n) || n <= 0) {
    return 0;
  }
  return n > limit ? limit : n;
}

/** Clamp signed Hz into [−limit, +limit] (through-zero). */
function nodeGraphClampSignedHzToProjectSpeedLimit(hz) {
  const limit = nodeGraphProjectSpeedLimitHz();
  const n = Number(hz);
  if (!Number.isFinite(n)) {
    return 0;
  }
  if (n > limit) return limit;
  if (n < -limit) return -limit;
  return n;
}

/**
 * Set project speed limit. Persists to patch.audio.speedLimitHz by default and
 * pushes to the audio worklet.
 */
function setNodeGraphProjectSpeedLimitHz(value, options = {}) {
  const persist = options.persist !== false;
  const n = Number(value);
  const next = Number.isFinite(n) && n > 0
    ? Math.min(NODE_GRAPH_PROJECT_SPEED_LIMIT_CONTROL_MAX_HZ, n)
    : NODE_GRAPH_PROJECT_SPEED_LIMIT_DEFAULT_HZ;
  const prev = Number(nodeGraphMvp?.live?.speedLimit);
  if (nodeGraphMvp?.live) {
    nodeGraphMvp.live.speedLimit = next;
  }
  if (persist && nodeGraphMvp?.patch) {
    const audio = typeof normalizeNodeGraphPatchAudio === "function"
      ? normalizeNodeGraphPatchAudio({
        ...(nodeGraphMvp.patch.audio || {}),
        speedLimitHz: next,
      })
      : {
        ...(nodeGraphMvp.patch.audio || {}),
        speedLimitHz: next,
      };
    nodeGraphMvp.patch.audio = audio;
  }
  if (prev === next && options.force !== true) {
    // Still refresh UI if asked
  } else {
    if (typeof sendNodeGraphLiveSpeedLimit === "function") {
      sendNodeGraphLiveSpeedLimit();
    }
  }
  if (typeof renderNodeGraphSpeedLimitReadout === "function") {
    renderNodeGraphSpeedLimitReadout();
  }
  // Keep patch-settings field in sync when present.
  const patchField = document.getElementById("patchSpeedLimitHzValue");
  if (patchField && String(patchField.value) !== String(next)) {
    patchField.value = String(next);
  }
}

/** Alias for header / existing call sites. */
function setNodeGraphLiveSpeedLimit(value) {
  setNodeGraphProjectSpeedLimitHz(value, { persist: true });
}

/** Apply patch.audio.speedLimitHz → live (patch load / sync). */
function syncNodeGraphProjectSpeedLimitFromPatch() {
  const fromPatch = Number(nodeGraphMvp?.patch?.audio?.speedLimitHz);
  const next = Number.isFinite(fromPatch) && fromPatch > 0
    ? fromPatch
    : NODE_GRAPH_PROJECT_SPEED_LIMIT_DEFAULT_HZ;
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
    : nodeGraphProjectSpeedLimitHz();
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
