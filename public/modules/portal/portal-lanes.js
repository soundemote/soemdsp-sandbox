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

function nodeGraphPortalLaneDefinition(kind, spec) {
  const ports = spec.ports.slice();
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
    aliases[NODE_GRAPH_THRU_SYMBOL] = "Mono";
    aliases[inArrow] = "Mono";
    aliases.Thru = "Mono";
  }
  if (spec.hasLeft) {
    aliases.L = "Left";
  }
  if (spec.hasRight) {
    aliases.R = "Right";
  }
  const isInlet = kind !== "outlet";
  return {
    chrome: "LayoutC",
    planRole: isInlet ? "source" : "sink",
    planFreeRun: true,
    defaultWidthGu: 4,
    defaultHeightGu: 2,
    defaultUi: { buttonsHidden: true, titleHidden: true },
    inputAliases: isInlet ? {} : aliases,
    inputLabels: isInlet ? {} : inLabels,
    inputs: isInlet ? [] : ports.slice(),
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
  const role = isOutlet
    ? "Patch into the speaker bus."
    : "Live input into the patch.";
  for (const spec of NODE_GRAPH_PORTAL_LANE_SPECS) {
    registerNodeGraphChromelessModule(nodeGraphPortalTypeName(kind, spec), {
      label: `${noun} ${spec.label}`,
      definition: nodeGraphPortalLaneDefinition(kind, spec),
      catalog: {
        category: "portal",
        description: `${role} ${spec.label}.`,
        notes: ["portal", isOutlet ? "outlet" : "inlet", spec.key, "mono", "left", "right"],
      },
    });
  }
}
