// Universal thru mark — inlet M/L/R labels and outlet/out-module jacks.
const NODE_GRAPH_THRU_SYMBOL = "\u2190";

// Portal lane layouts — one table for Inlet and Outlet.
// Types: (portalInlet|portalOutlet) + optional Mono|Left|Right|LeftRight.
// Bare portalInlet / portalOutlet stay Mono+Left+Right (existing patches).

const NODE_GRAPH_PORTAL_LANE_SPECS = Object.freeze([
  Object.freeze({
    key: "mono",
    typeSuffix: "Mono",
    label: "Mono",
    ports: Object.freeze(["Mono"]),
    hasMono: true,
    hasLeft: false,
    hasRight: false,
    heightGu: 2,
  }),
  Object.freeze({
    key: "left",
    typeSuffix: "Left",
    label: "Left",
    ports: Object.freeze(["Left"]),
    hasMono: false,
    hasLeft: true,
    hasRight: false,
    heightGu: 2,
  }),
  Object.freeze({
    key: "right",
    typeSuffix: "Right",
    label: "Right",
    ports: Object.freeze(["Right"]),
    hasMono: false,
    hasLeft: false,
    hasRight: true,
    heightGu: 2,
  }),
  Object.freeze({
    key: "leftRight",
    typeSuffix: "LeftRight",
    label: "Left Right",
    ports: Object.freeze(["Left", "Right"]),
    hasMono: false,
    hasLeft: true,
    hasRight: true,
    heightGu: 3,
  }),
  Object.freeze({
    key: "trio",
    typeSuffix: "",
    label: "Mono Left Right",
    ports: Object.freeze(["Mono", "Left", "Right"]),
    hasMono: true,
    hasLeft: true,
    hasRight: true,
    heightGu: 4,
  }),
]);

const NODE_GRAPH_PORTAL_LANE_SPEC_BY_SUFFIX = Object.freeze(
  Object.fromEntries(NODE_GRAPH_PORTAL_LANE_SPECS.map((spec) => [spec.typeSuffix, spec])),
);

function nodeGraphPortalKindFromType(type) {
  const t = String(type || "");
  if (t === "portalInlet" || t.startsWith("portalInlet")) {
    return "inlet";
  }
  if (t === "portalOutlet" || t.startsWith("portalOutlet")) {
    return "outlet";
  }
  return "";
}

function nodeGraphPortalIsInletType(type) {
  return nodeGraphPortalKindFromType(type) === "inlet";
}

function nodeGraphPortalIsOutletType(type) {
  return nodeGraphPortalKindFromType(type) === "outlet";
}

function nodeGraphPortalLaneSpecFromType(type) {
  const t = String(type || "");
  const prefix = nodeGraphPortalIsInletType(t)
    ? "portalInlet"
    : (nodeGraphPortalIsOutletType(t) ? "portalOutlet" : "");
  if (!prefix) {
    return NODE_GRAPH_PORTAL_LANE_SPEC_BY_SUFFIX[""];
  }
  const suffix = t.slice(prefix.length);
  return NODE_GRAPH_PORTAL_LANE_SPEC_BY_SUFFIX[suffix] || NODE_GRAPH_PORTAL_LANE_SPEC_BY_SUFFIX[""];
}

function nodeGraphPortalTypeName(kind, spec) {
  const head = kind === "outlet" ? "portalOutlet" : "portalInlet";
  return spec?.typeSuffix ? `${head}${spec.typeSuffix}` : head;
}

function nodeGraphPortalInletTypes() {
  return NODE_GRAPH_PORTAL_LANE_SPECS.map((spec) => nodeGraphPortalTypeName("inlet", spec));
}

function nodeGraphPortalOutletTypes() {
  return NODE_GRAPH_PORTAL_LANE_SPECS.map((spec) => nodeGraphPortalTypeName("outlet", spec));
}

function nodeGraphPortalAllTypes() {
  return nodeGraphPortalInletTypes().concat(nodeGraphPortalOutletTypes());
}

function nodeGraphPortalLaneLetters(spec) {
  const labels = {};
  if (spec?.hasMono) {
    labels.Mono = "M";
  }
  if (spec?.hasLeft) {
    labels.Left = "L";
  }
  if (spec?.hasRight) {
    labels.Right = "R";
  }
  return labels;
}

function nodeGraphPortalLaneDefinition(kind, spec) {
  const ports = spec.ports.slice();
  // → = into the module (in), ← = thru out of the module.
  const inArrow = "\u2192";
  const outLabels = {};
  const inLabels = {};
  if (spec.hasMono) {
    outLabels.Mono = NODE_GRAPH_THRU_SYMBOL;
    inLabels.Mono = inArrow;
  }
  if (spec.hasLeft) {
    outLabels.Left = NODE_GRAPH_THRU_SYMBOL;
    inLabels.Left = inArrow;
  }
  if (spec.hasRight) {
    outLabels.Right = NODE_GRAPH_THRU_SYMBOL;
    inLabels.Right = inArrow;
  }
  const aliases = {};
  if (spec.hasMono) {
    aliases.In = "Mono";
    aliases.M = "Mono";
    aliases.Out = "Mono";
    aliases.Thru = "Mono";
    aliases[NODE_GRAPH_THRU_SYMBOL] = "Mono";
    aliases[inArrow] = "Mono";
  }
  if (spec.hasLeft) {
    aliases.L = "Left";
  }
  if (spec.hasRight) {
    aliases.R = "Right";
  }
  const isInlet = kind !== "outlet";
  return {
    // LayoutC keeps inlet + outlet columns so → / ← thru jacks stay visible.
    chrome: "LayoutC",
    planRole: isInlet ? "source" : "sink",
    planFreeRun: true,
    defaultWidthGu: 4,
    defaultHeightGu: spec.heightGu || (ports.length === 1 ? 2 : Math.max(2, ports.length + 1)),
    defaultUi: { buttonsHidden: true, titleHidden: true },
    hasFace: false,
    // Both sides: in (→) and thru (←) for every portal lane module.
    inputAliases: aliases,
    inputLabels: inLabels,
    inputs: ports.slice(),
    outputAliases: aliases,
    outputLabels: outLabels,
    outputs: ports.slice(),
    parameters: [],
  };
}

function registerNodeGraphPortalLaneFamily(kind) {
  if (typeof registerNodeGraphChromelessModule !== "function") {
    return;
  }
  const isOutlet = kind === "outlet";
  const noun = isOutlet ? "Out" : "In";
  for (const spec of NODE_GRAPH_PORTAL_LANE_SPECS) {
    registerNodeGraphPortalLaneFamilyEntry(kind, noun, spec);
  }
}

function registerNodeGraphPortalLaneFamilyEntry(kind, noun, spec) {
  const isOutlet = kind === "outlet";
  registerNodeGraphChromelessModule(nodeGraphPortalTypeName(kind, spec), {
    label: `${noun} ${spec.label}`,
    compactTile: false,
    customDisplayArea: false,
    definition: nodeGraphPortalLaneDefinition(kind, spec),
    catalog: {
      category: "portal",
      description: isOutlet
        ? `Patch ${spec.label} out of the graph (→ in, ← thru to speakers).`
        : `Live input ${spec.label} into the patch (→ in, ← thru).`,
      notes: [
        "portal",
        isOutlet ? "outlet" : "inlet",
        "input",
        "in",
        "thru",
        spec.key,
        spec.label,
        `in ${spec.label}`,
        "mono",
        "left",
        "right",
        "m",
        "l",
        "r",
      ],
    },
  });
}
