// Evolve Field display — under construction (no live fractal paint).
// Future: noise flow-field experiment (see evolve-field-register.js NOTE).

const nodeGraphEvolveFieldSettingsDefaults = Object.freeze({
  background: "#0a0a10",
  gradientStops: Object.freeze([
    Object.freeze({ t: 0, color: "#0a0a10" }),
    Object.freeze({ t: 1, color: "#dcdcf0" }),
  ]),
});

function normalizeNodeGraphEvolveFieldSettings(settings = {}) {
  const source = settings && typeof settings === "object" ? settings : {};
  const defaults = nodeGraphEvolveFieldSettingsDefaults;
  const peak = defaults.gradientStops[defaults.gradientStops.length - 1].color;
  let gradientStops;
  if (typeof nodeGraphPhosphorGradientStopsFromSettings === "function") {
    if (source.gradientStops || source.gradient) {
      gradientStops = nodeGraphPhosphorGradientStopsFromSettings(source, peak);
    } else {
      gradientStops = defaults.gradientStops.map((s) => ({ t: s.t, color: s.color }));
    }
  } else {
    gradientStops = Array.isArray(source.gradientStops) && source.gradientStops.length >= 2
      ? source.gradientStops
      : defaults.gradientStops.map((s) => ({ t: s.t, color: s.color }));
  }
  const background = typeof normalizeNodeGraphTraceDisplayColor === "function"
    ? normalizeNodeGraphTraceDisplayColor(source.background ?? source.backgroundColor, defaults.background)
    : String(source.background || defaults.background);
  return { background, gradientStops };
}

function nodeGraphEvolveFieldSettingsForNode(node) {
  if (!node) return normalizeNodeGraphEvolveFieldSettings();
  return normalizeNodeGraphEvolveFieldSettings(node.traceDisplaySettings);
}

function drawNodeGraphEvolveFieldFaceItem() {
  // UC: face is static DOM (createBody). No scope paint loop.
}

if (typeof nodeGraphModuleScopeCustomRenderers === "object" && nodeGraphModuleScopeCustomRenderers) {
  nodeGraphModuleScopeCustomRenderers.evolveFieldFace = drawNodeGraphEvolveFieldFaceItem;
}
