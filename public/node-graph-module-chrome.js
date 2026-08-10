// Module chrome — one place every module uses for port placement.
//
//   LayoutA  — ports under the face (display + optional params)
//   LayoutB  — ports beside the face (display + optional params)
//   LayoutC  — title + I/O only (no display, no param sliders) — compact thrus
//
// Face content (graph, scope, knobs, …) is still definition.layout for A/B.
// LayoutC has no face: definition still may list ports only.
//
// Height policy (SSOT: node-graph-module-sizing.js):
//   - FACE 1…60gu → --node-module-display-height-units / LayoutB shell track.
//   - OUTER grid cells → --node-grid-height-units (Module Settings Height).
//   - Min outer for face modules is when face = 1gu.
//   - LayoutB shell = face; side jacks share face height (never inflate shell).
//   - LayoutC: freehand heightGu, no face (title + I/O only).
//
// Authority: definition.chrome (default LayoutA).
// Call nodeGraphModuleChromeLayoutForType() / nodeGraphModuleChrome().

/** String enum for port chrome layouts. Prefer these over bare strings. */
const NodeGraphModuleChromeLayout = Object.freeze({
  LayoutA: "LayoutA",
  LayoutB: "LayoutB",
  LayoutC: "LayoutC",
});

const nodeGraphModuleChromeLayoutA = NodeGraphModuleChromeLayout.LayoutA;
const nodeGraphModuleChromeLayoutB = NodeGraphModuleChromeLayout.LayoutB;
const nodeGraphModuleChromeLayoutC = NodeGraphModuleChromeLayout.LayoutC;

/** @deprecated use NodeGraphModuleChromeLayout */
const nodeGraphModuleChromeLayouts = NodeGraphModuleChromeLayout;

const nodeGraphModuleChromeLayoutCssByLayout = Object.freeze({
  [NodeGraphModuleChromeLayout.LayoutA]: "chrome-layout-a",
  [NodeGraphModuleChromeLayout.LayoutB]: "chrome-layout-b",
  [NodeGraphModuleChromeLayout.LayoutC]: "chrome-layout-c",
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

function nodeGraphModuleChromeLayoutIsC(value) {
  return value === NodeGraphModuleChromeLayout.LayoutC;
}

function nodeGraphModuleChromeLayoutCssClass(layout) {
  return nodeGraphModuleChromeLayoutCssByLayout[layout]
    || nodeGraphModuleChromeLayoutCssByLayout[NodeGraphModuleChromeLayout.LayoutA];
}

/** @returns {"LayoutA"|"LayoutB"|"LayoutC"|null} */
function normalizeNodeGraphModuleChromeLayout(value) {
  if (
    value === NodeGraphModuleChromeLayout.LayoutA
    || value === NodeGraphModuleChromeLayout.LayoutB
    || value === NodeGraphModuleChromeLayout.LayoutC
  ) {
    return value;
  }
  const raw = String(value || "").trim();
  if (!raw) {
    return null;
  }
  if (
    raw === NodeGraphModuleChromeLayout.LayoutA
    || raw === NodeGraphModuleChromeLayout.LayoutB
    || raw === NodeGraphModuleChromeLayout.LayoutC
  ) {
    return raw;
  }
  const key = raw.toLowerCase();
  if (key === "layouta" || key === "a") {
    return NodeGraphModuleChromeLayout.LayoutA;
  }
  if (key === "layoutb" || key === "b") {
    return NodeGraphModuleChromeLayout.LayoutB;
  }
  if (key === "layoutc" || key === "c") {
    return NodeGraphModuleChromeLayout.LayoutC;
  }
  return null;
}

/**
 * Resolve LayoutA / LayoutB / LayoutC for a module type.
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
 * Seal every module definition with an explicit chrome: LayoutA | LayoutB | LayoutC.
 * Call once when building nodeGraphModuleDefinitions so no type relies on an
 * implicit default at read time (inventory / debugging stays honest).
 *
 * Face content (scope, graph, filter curve, chromeless body, …) is still
 * definition.layout / customDisplayArea for A/B — chrome places ports under
 * (A), beside (B), or title+I/O only (C).
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

function nodeGraphModuleUsesLayoutC(type) {
  return nodeGraphModuleChromeLayoutIsC(nodeGraphModuleChromeLayoutForType(type));
}

/**
 * Headerless LayoutB: solid-module-layout class (optional title + shell + params).
 * Headered LayoutB (graph, LayoutB filter-curve): same article grid via
 * chrome-layout-b; title bar is permanent unless ui.titleHidden.
 * All LayoutB modules share one CSS grid contract (shell @ display 1…60gu).
 */
function nodeGraphModuleIsHeaderlessLayoutB(type) {
  if (!nodeGraphModuleUsesLayoutB(type)) {
    return false;
  }
  const definition = typeof nodeGraphModuleDefinitions === "object"
    ? nodeGraphModuleDefinitions[type]
    : null;
  const face = String(definition?.layout || "").trim();
  // Graph keeps a normal header (not the headerless solid-module chrome class).
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
 *   layout: "LayoutA"|"LayoutB"|"LayoutC",
 *   portsBeside: boolean,
 *   portsUnder: boolean,
 *   headerless: boolean,
 *   titleIoOnly: boolean,
 *   cssLayoutClass: string,
 * }}
 */
function nodeGraphModuleChrome(type) {
  const layout = nodeGraphModuleChromeLayoutForType(type);
  const portsBeside = nodeGraphModuleChromeLayoutIsB(layout);
  const titleIoOnly = nodeGraphModuleChromeLayoutIsC(layout);
  return Object.freeze({
    layout,
    portsBeside,
    // LayoutC still stacks I/O under the title (not beside a face).
    portsUnder: !portsBeside,
    headerless: nodeGraphModuleIsHeaderlessLayoutB(type),
    titleIoOnly,
    cssLayoutClass: nodeGraphModuleChromeLayoutCssClass(layout),
  });
}
