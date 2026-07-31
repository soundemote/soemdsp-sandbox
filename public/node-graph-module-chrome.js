// Module chrome — one place every module uses for port placement.
//
//   LayoutA  — original (ports under the face)
//   LayoutB  — new (ports beside the face)
//
// Face content (graph, scope, knobs, …) is still definition.layout.
// This file only answers: LayoutA or LayoutB?
//
// LayoutA display policy (sizing lives in node-graph-module-sizing.js):
//   - Display row height is --node-module-display-height-units (1…60gu).
//   - definition.customDisplayArea / layout faces (e.g. badvalMonitor) use the
//     same height control as oscilloscopes, but the face cannot be hidden.
//   - definition.slidersAlwaysHidden keeps param rows off (status modules).
//
// Authority: definition.chrome (default LayoutA).
// Call nodeGraphModuleChromeLayoutForType() / nodeGraphModuleChrome().

/** String enum for port chrome layouts. Prefer these over bare strings. */
const NodeGraphModuleChromeLayout = Object.freeze({
  LayoutA: "LayoutA",
  LayoutB: "LayoutB",
});

const nodeGraphModuleChromeLayoutA = NodeGraphModuleChromeLayout.LayoutA;
const nodeGraphModuleChromeLayoutB = NodeGraphModuleChromeLayout.LayoutB;

/** @deprecated use NodeGraphModuleChromeLayout */
const nodeGraphModuleChromeLayouts = NodeGraphModuleChromeLayout;

const nodeGraphModuleChromeLayoutCssByLayout = Object.freeze({
  [NodeGraphModuleChromeLayout.LayoutA]: "chrome-layout-a",
  [NodeGraphModuleChromeLayout.LayoutB]: "chrome-layout-b",
});

function nodeGraphModuleChromeLayoutIs(value, layout) {
  return value === layout;
}

function nodeGraphModuleChromeLayoutIsA(value) {
  return value === NodeGraphModuleChromeLayout.LayoutA;
}

function nodeGraphModuleChromeLayoutIsB(value) {
  return value === NodeGraphModuleChromeLayout.LayoutB;
}

function nodeGraphModuleChromeLayoutCssClass(layout) {
  return nodeGraphModuleChromeLayoutCssByLayout[layout]
    || nodeGraphModuleChromeLayoutCssByLayout[NodeGraphModuleChromeLayout.LayoutA];
}

/** @returns {"LayoutA"|"LayoutB"|null} */
function normalizeNodeGraphModuleChromeLayout(value) {
  if (value === NodeGraphModuleChromeLayout.LayoutA || value === NodeGraphModuleChromeLayout.LayoutB) {
    return value;
  }
  const raw = String(value || "").trim();
  if (!raw) {
    return null;
  }
  if (raw === NodeGraphModuleChromeLayout.LayoutA || raw === NodeGraphModuleChromeLayout.LayoutB) {
    return raw;
  }
  const key = raw.toLowerCase();
  if (key === "layouta" || key === "a") {
    return NodeGraphModuleChromeLayout.LayoutA;
  }
  if (key === "layoutb" || key === "b") {
    return NodeGraphModuleChromeLayout.LayoutB;
  }
  return null;
}

/**
 * Resolve LayoutA vs LayoutB for a module type.
 * Only definition.chrome — every sealed definition must set chrome (see
 * finalizeNodeGraphModuleDefinitionsChrome). Missing → LayoutA.
 */
function nodeGraphModuleChromeLayoutForType(type) {
  const normalizedType = String(type || "").trim();
  if (!normalizedType) {
    return NodeGraphModuleChromeLayout.LayoutA;
  }
  const definition = typeof nodeGraphModuleDefinitions === "object"
    ? nodeGraphModuleDefinitions[normalizedType]
    : null;
  return normalizeNodeGraphModuleChromeLayout(definition?.chrome)
    || NodeGraphModuleChromeLayout.LayoutA;
}

/**
 * Seal every module definition with an explicit chrome: LayoutA | LayoutB.
 * Call once when building nodeGraphModuleDefinitions so no type relies on an
 * implicit default at read time (inventory / debugging stays honest).
 *
 * Face content (scope, graph, filter curve, chromeless body, …) is still
 * definition.layout / customDisplayArea — chrome only places ports under
 * (A) or beside (B) that face.
 *
 * @param {Record<string, object>} entries
 * @returns {Readonly<Record<string, object>>}
 */
function finalizeNodeGraphModuleDefinitionsChrome(entries = {}) {
  const source = entries && typeof entries === "object" ? entries : {};
  const out = {};
  for (const type of Object.keys(source)) {
    const def = source[type] && typeof source[type] === "object" ? source[type] : {};
    const chrome = normalizeNodeGraphModuleChromeLayout(def.chrome)
      || NodeGraphModuleChromeLayout.LayoutA;
    out[type] = Object.freeze({ ...def, chrome });
  }
  return Object.freeze(out);
}

function nodeGraphModuleUsesLayoutA(type) {
  return nodeGraphModuleChromeLayoutIsA(nodeGraphModuleChromeLayoutForType(type));
}

function nodeGraphModuleUsesLayoutB(type) {
  return nodeGraphModuleChromeLayoutIsB(nodeGraphModuleChromeLayoutForType(type));
}

/**
 * Headerless LayoutB modules use the XY Pad grid: optional title + shell +
 * params (class solid-module-layout / chrome-layout-b). Default title is
 * hidden; "Show title" mounts a normal header. I/O hide only removes port
 * labels and expands the face toward the jacks (ports stay).
 * Graph is LayoutB *with* a permanent header — different CSS.
 */
function nodeGraphModuleIsHeaderlessLayoutB(type) {
  if (!nodeGraphModuleUsesLayoutB(type)) {
    return false;
  }
  const definition = typeof nodeGraphModuleDefinitions === "object"
    ? nodeGraphModuleDefinitions[type]
    : null;
  const face = String(definition?.layout || "").trim();
  if (face === "graph") {
    return false;
  }
  if (face === "sliderWidget") {
    return true;
  }
  if (typeof nodeGraphChromelessModuleLayouts !== "undefined"
    && nodeGraphChromelessModuleLayouts.has(face)) {
    return true;
  }
  return false;
}

/**
 * @returns {{
 *   layout: "LayoutA"|"LayoutB",
 *   portsBeside: boolean,
 *   portsUnder: boolean,
 *   headerless: boolean,
 *   cssLayoutClass: string,
 * }}
 */
function nodeGraphModuleChrome(type) {
  const layout = nodeGraphModuleChromeLayoutForType(type);
  const portsBeside = nodeGraphModuleChromeLayoutIsB(layout);
  return Object.freeze({
    layout,
    portsBeside,
    portsUnder: !portsBeside,
    headerless: nodeGraphModuleIsHeaderlessLayoutB(type),
    cssLayoutClass: nodeGraphModuleChromeLayoutCssClass(layout),
  });
}
