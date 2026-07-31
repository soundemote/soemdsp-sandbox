// Self-registration for "fully custom UI" modules -- the third UI tier
// (generic knob/slider rows / generic + custom / fully custom, see the
// comment on nodeGraphChromelessModuleLayouts below). A chromeless module's
// own folder calls registerNodeGraphChromelessModule() with its definition
// and catalog metadata, and (from its own UI file, loaded later)
// registerNodeGraphChromelessModuleUi() with its body factory. The shared
// files (node-graph-module-definitions.js, node-graph-module-store.js,
// node-graph-module-rendering.js, node-graph-module-sizing.js) read from
// this registry instead of needing a hardcoded per-module entry each --
// add a new 100%-custom module by writing a new public/modules/<Type>/
// folder that registers itself, nothing else needs editing.
//
// This file must load before node-graph-module-definitions.js and
// node-graph-module-store.js (which read the registry while building their
// own frozen objects), so registerNodeGraphChromelessModule() calls need to
// happen early too -- see public/modules/stepGrid/step-grid-register.js
// and public/modules/led/led-register.js for the pattern. UI registration
// (registerNodeGraphChromelessModuleUi) only needs to happen before the
// app actually renders a node of that type, so it can live in the same
// file as the rest of the module's UI code and load whenever.

const nodeGraphChromelessModuleRegistrations = new Map();

function registerNodeGraphChromelessModule(type, config) {
  const existing = nodeGraphChromelessModuleRegistrations.get(type) || {};
  nodeGraphChromelessModuleRegistrations.set(type, { ...existing, ...config, type });
}

function registerNodeGraphChromelessModuleUi(type, uiConfig) {
  const existing = nodeGraphChromelessModuleRegistrations.get(type) || {};
  nodeGraphChromelessModuleRegistrations.set(type, { ...existing, ...uiConfig, type });
}

// "layout" always equals the module's own type for this tier (see
// nodeGraphModuleDefinitions entries below) -- has() takes a layout string
// since that's what callers already have on hand (node-graph-module-sizing.js,
// node-graph-module-rendering.js), and layout/type being interchangeable
// here is exactly what "chromeless" means: no separate shared layout to
// dispatch on, every chromeless module IS its own layout.
const nodeGraphChromelessModuleLayouts = Object.freeze({
  has(layout) {
    return nodeGraphChromelessModuleRegistrations.has(layout);
  },
});

function nodeGraphChromelessModuleDefinitionEntries() {
  const entries = {};
  const layoutA = typeof NodeGraphModuleChromeLayout !== "undefined"
    ? NodeGraphModuleChromeLayout.LayoutA
    : "LayoutA";
  const layoutB = typeof NodeGraphModuleChromeLayout !== "undefined"
    ? NodeGraphModuleChromeLayout.LayoutB
    : "LayoutB";
  for (const [type, config] of nodeGraphChromelessModuleRegistrations) {
    // Custom UI modules always declare chrome explicitly:
    //   solidModule (ports beside face) → LayoutB
    //   otherwise (ports under / compact tile) → LayoutA
    // definition.chrome may still override when intentional.
    const fromDef = config.definition && typeof config.definition === "object"
      ? config.definition
      : {};
    const chrome = typeof normalizeNodeGraphModuleChromeLayout === "function"
      ? (normalizeNodeGraphModuleChromeLayout(fromDef.chrome)
        || (config.solidModule ? layoutB : layoutA))
      : (fromDef.chrome || (config.solidModule ? layoutB : layoutA));
    entries[type] = {
      layout: type,
      ...fromDef,
      chrome,
    };
  }
  return entries;
}

function nodeGraphChromelessModuleLabelEntries() {
  const entries = {};
  for (const [type, config] of nodeGraphChromelessModuleRegistrations) {
    if (config.label) {
      entries[type] = config.label;
    }
  }
  return entries;
}

function nodeGraphChromelessModuleCatalogEntries() {
  const entries = {};
  for (const [type, config] of nodeGraphChromelessModuleRegistrations) {
    entries[type] = { label: config.label, ...config.catalog };
  }
  return entries;
}

// Opt-in flag for chromeless modules that are a fixed 1gu tile (e.g. led) --
// not every chromeless module is compact (stepGrid isn't), so this reads a
// per-module registration field rather than assuming all chromeless types
// share the same sizing behavior.
function nodeGraphChromelessModuleIsCompactTile(type) {
  return Boolean(nodeGraphChromelessModuleRegistrations.get(type)?.compactTile);
}

function nodeGraphChromelessModuleHasCustomDisplayArea(type) {
  return Boolean(nodeGraphChromelessModuleRegistrations.get(type)?.customDisplayArea);
}

// True when this chromeless type registered solidModule (LayoutB shell DOM).
// Prefer nodeGraphModuleUsesLayoutB() for port placement; this flag remains
// for registration-time checks (e.g. always-evaluate interactive faces).
function nodeGraphChromelessModuleUsesSolidShell(type) {
  return Boolean(nodeGraphChromelessModuleRegistrations.get(type)?.solidModule);
}

// CSS layout class for a registered chromeless module -- always the
// kebab-case of its own type (which is also its layout, see
// nodeGraphChromelessModuleLayouts) plus "-layout", matching the convention
// every other layoutClasses entry in node-graph-module-rendering.js follows.
function nodeGraphChromelessModuleLayoutClassEntries() {
  const entries = {};
  for (const type of nodeGraphChromelessModuleRegistrations.keys()) {
    const kebab = type.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
    entries[type] = `${kebab}-layout`;
  }
  return entries;
}
