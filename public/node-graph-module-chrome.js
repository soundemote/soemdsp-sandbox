// Module chrome — one place every module uses for port placement.
//
//   LayoutA            — ports under the face (display + optional params)
//   LayoutB            — ports beside the face (display + optional params)
//   MetamoduleLayout    — ports in a top strip; dedicated full-width face below
//                        (I/O labels never shrink the display)
//   InletOutletLayout  — title + I/O only (no display, no param sliders)
//                        for portals / Meta In-Out / voice jacks and similar
//                        IO-only modules. Formerly TitleBarAndPorts / LayoutC.
//
// Face content (graph, scope, knobs, …) is still definition.layout for A/B/Meta.
// InletOutletLayout has no face: definition still may list ports only.
//
// Height policy (SSOT: node-graph-module-sizing.js):
//   - FACE / Display Height 0…60gu → --node-module-display-height-units / LayoutB shell.
//     0 = Off (no face track). Displays hard-hide also zeros the face track.
//   - OUTER grid cells → --node-grid-height-units via nodeGraphModuleOuterHeightGu.
//     Face modules: contentMin(face=0) + faceTrack (ignores stored heightGu).
//   - Module Settings: "Display Height" for face modules; "Height" for freehand only.
//   - LayoutB shell = face when face>0; jack-floor plate when faceTrack is 0.
//   - MetamoduleLayout: IO band + face are separate tracks (IO cannot crush face).
//   - InletOutletLayout: freehand heightGu, no face (title + I/O only).
//   - Visibility flips must refresh chrome so outer height recomputes.
//
// Authority: definition.chrome (default LayoutA).
// Call nodeGraphModuleChromeLayoutForType() / nodeGraphModuleChrome().

/** String enum for port chrome layouts. Prefer these over bare strings. */
const NodeGraphModuleChromeLayout = Object.freeze({
  LayoutA: "LayoutA",
  LayoutB: "LayoutB",
  MetamoduleLayout: "MetamoduleLayout",
  InletOutletLayout: "InletOutletLayout",
  /** @deprecated use InletOutletLayout — same canonical value */
  TitleBarAndPorts: "InletOutletLayout",
  /** @deprecated use InletOutletLayout — same canonical value */
  LayoutC: "InletOutletLayout",
});

const nodeGraphModuleChromeLayoutA = NodeGraphModuleChromeLayout.LayoutA;
const nodeGraphModuleChromeLayoutB = NodeGraphModuleChromeLayout.LayoutB;
const nodeGraphModuleChromeLayoutMetamodule = NodeGraphModuleChromeLayout.MetamoduleLayout;
const nodeGraphModuleChromeLayoutInletOutlet = NodeGraphModuleChromeLayout.InletOutletLayout;
/** @deprecated use nodeGraphModuleChromeLayoutInletOutlet */
const nodeGraphModuleChromeLayoutTitleBarAndPorts = nodeGraphModuleChromeLayoutInletOutlet;
/** @deprecated use nodeGraphModuleChromeLayoutInletOutlet */
const nodeGraphModuleChromeLayoutC = nodeGraphModuleChromeLayoutInletOutlet;

/** @deprecated use NodeGraphModuleChromeLayout */
const nodeGraphModuleChromeLayouts = NodeGraphModuleChromeLayout;

const nodeGraphModuleChromeLayoutCssByLayout = Object.freeze({
  [NodeGraphModuleChromeLayout.LayoutA]: "chrome-layout-a",
  [NodeGraphModuleChromeLayout.LayoutB]: "chrome-layout-b",
  [NodeGraphModuleChromeLayout.MetamoduleLayout]: "chrome-layout-metamodule",
  [NodeGraphModuleChromeLayout.InletOutletLayout]: "chrome-layout-inlet-outlet",
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

function nodeGraphModuleChromeLayoutIsInletOutlet(value) {
  return value === NodeGraphModuleChromeLayout.InletOutletLayout;
}

function nodeGraphModuleChromeLayoutIsMetamodule(value) {
  return value === NodeGraphModuleChromeLayout.MetamoduleLayout;
}

/** @deprecated use nodeGraphModuleChromeLayoutIsInletOutlet */
function nodeGraphModuleChromeLayoutIsTitleBarAndPorts(value) {
  return nodeGraphModuleChromeLayoutIsInletOutlet(value);
}

/** @deprecated use nodeGraphModuleChromeLayoutIsInletOutlet */
function nodeGraphModuleChromeLayoutIsC(value) {
  return nodeGraphModuleChromeLayoutIsInletOutlet(value);
}

function nodeGraphModuleChromeLayoutCssClass(layout) {
  return nodeGraphModuleChromeLayoutCssByLayout[layout]
    || nodeGraphModuleChromeLayoutCssByLayout[NodeGraphModuleChromeLayout.LayoutA];
}

/** @returns {"LayoutA"|"LayoutB"|"MetamoduleLayout"|"InletOutletLayout"|null} */
function normalizeNodeGraphModuleChromeLayout(value) {
  if (
    value === NodeGraphModuleChromeLayout.LayoutA
    || value === NodeGraphModuleChromeLayout.LayoutB
    || value === NodeGraphModuleChromeLayout.MetamoduleLayout
    || value === NodeGraphModuleChromeLayout.InletOutletLayout
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
    || raw === NodeGraphModuleChromeLayout.MetamoduleLayout
    || raw === NodeGraphModuleChromeLayout.InletOutletLayout
  ) {
    return raw;
  }
  // Deprecated aliases — TitleBarAndPorts / LayoutC always meant title + ports only.
  if (raw === "TitleBarAndPorts" || raw === "LayoutC") {
    return NodeGraphModuleChromeLayout.InletOutletLayout;
  }
  const key = raw.toLowerCase().replace(/[\s_-]+/g, "");
  if (key === "layouta" || key === "a") {
    return NodeGraphModuleChromeLayout.LayoutA;
  }
  if (key === "layoutb" || key === "b") {
    return NodeGraphModuleChromeLayout.LayoutB;
  }
  if (key === "metamodulelayout" || key === "metamodule") {
    return NodeGraphModuleChromeLayout.MetamoduleLayout;
  }
  if (
    key === "inletoutletlayout"
    || key === "inletoutlet"
    || key === "titlebarandports"
    || key === "layoutc"
    || key === "c"
  ) {
    return NodeGraphModuleChromeLayout.InletOutletLayout;
  }
  return null;
}

/**
 * Resolve LayoutA / LayoutB / InletOutletLayout for a module type.
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
 * Seal every module definition with an explicit chrome:
 * LayoutA | LayoutB | MetamoduleLayout | InletOutletLayout.
 * Call once when building nodeGraphModuleDefinitions so no type relies on an
 * implicit default at read time (inventory / debugging stays honest).
 *
 * Face content (scope, graph, filter curve, chromeless body, …) is still
 * definition.layout / customDisplayArea for A/B/Meta — chrome places ports
 * under (A), beside (B), top strip + face (Metamodule), or title+I/O only.
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

function nodeGraphModuleUsesMetamoduleLayout(type) {
  return nodeGraphModuleChromeLayoutIsMetamodule(nodeGraphModuleChromeLayoutForType(type));
}

function nodeGraphModuleUsesInletOutletLayout(type) {
  return nodeGraphModuleChromeLayoutIsInletOutlet(nodeGraphModuleChromeLayoutForType(type));
}

/** @deprecated use nodeGraphModuleUsesInletOutletLayout */
function nodeGraphModuleUsesTitleBarAndPorts(type) {
  return nodeGraphModuleUsesInletOutletLayout(type);
}

/** @deprecated use nodeGraphModuleUsesInletOutletLayout */
function nodeGraphModuleUsesLayoutC(type) {
  return nodeGraphModuleUsesInletOutletLayout(type);
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
 *   layout: "LayoutA"|"LayoutB"|"MetamoduleLayout"|"InletOutletLayout",
 *   portsBeside: boolean,
 *   portsUnder: boolean,
 *   portsAboveFace: boolean,
 *   headerless: boolean,
 *   titleIoOnly: boolean,
 *   cssLayoutClass: string,
 * }}
 */
function nodeGraphModuleChrome(type) {
  const layout = nodeGraphModuleChromeLayoutForType(type);
  const portsBeside = nodeGraphModuleChromeLayoutIsB(layout);
  const portsAboveFace = nodeGraphModuleChromeLayoutIsMetamodule(layout);
  const titleIoOnly = nodeGraphModuleChromeLayoutIsInletOutlet(layout);
  return Object.freeze({
    layout,
    portsBeside,
    portsAboveFace,
    // InletOutletLayout stacks I/O under the title (not beside a face).
    // MetamoduleLayout puts I/O above the face (not under).
    portsUnder: !portsBeside && !portsAboveFace,
    // MetamoduleLayout still mounts an optional title bar (headerless path).
    headerless: portsAboveFace || nodeGraphModuleIsHeaderlessLayoutB(type),
    titleIoOnly,
    cssLayoutClass: nodeGraphModuleChromeLayoutCssClass(layout),
  });
}