// Wireless named buses. Title (alias) matches In ↔ Out. Default title "A".
// Jack I/O labels use effective Display (follows Title until overridden).
// Jack color follows the cable into Portal In; Portal Out mirrors matched In
// for title/bus, color, and wirelessRole (SyncBusAlias unchanged).
// Shop shows a single **Portal IO** entry that places linked In+Out; the
// separate namedPortalIn / namedPortalOut types stay loadable for old patches.
registerNodeGraphChromelessModule("namedPortalIn", {
  label: "Portal \u2192",
  compactTile: false,
  definition: {
    chrome: "InletOutletLayout",
    planRole: "processor",
    planFreeRun: true,
    defaultWidthGu: 4,
    // InletOutletLayout: outer height = content (header+IO); do not pin defaultHeightGu (B-074).
    hasFace: false,
    defaultAlias: "A",
    defaultUi: { buttonsHidden: true, titleHidden: false },
    inputChannels: { In: "gold" },
    inputs: ["In"],
    inputLabels: { In: "\u2192" },
    outputs: [],
    inputAliases: { Mono: "In", "\u2192": "In" },
    parameters: [],
  },
  catalog: {
    category: "portal",
    hidden: true,
    description: "Wireless send (\u2192). Matching Portal \u2190 titles in the same patch (root or this Metamodule) receive the sum. Jack type/color follow the cable plugged in. Does not cross a Metamodule shell.",
    notes: [
      "portal",
      "portal in",
      "wireless",
      "send",
      "bus",
      "named",
    ],
  },
});

registerNodeGraphChromelessModule("namedPortalOut", {
  label: "Portal \u2190",
  compactTile: false,
  definition: {
    chrome: "InletOutletLayout",
    planRole: "source",
    planFreeRun: true,
    defaultWidthGu: 4,
    hasFace: false,
    defaultAlias: "A",
    defaultUi: { buttonsHidden: true, titleHidden: false },
    outputChannels: { Out: "gold" },
    inputs: [],
    outputs: ["Out"],
    outputLabels: { Out: "\u2190" },
    outputAliases: { Mono: "Out", "\u2190": "Out" },
    parameters: [],
  },
  catalog: {
    category: "portal",
    hidden: true,
    description: "Wireless return (\u2190). Plays the sum of every Portal \u2192 with the same title in this patch (root or this Metamodule). Jack label is effective Display (follows Title; matches peer bus Title). Jack color and wireless role follow that In. Does not cross a Metamodule shell.",
    notes: [
      "portal",
      "portal out",
      "wireless",
      "return",
      "bus",
      "named",
    ],
  },
});

// Catalog-only shell: shop / drop expands to namedPortalIn + namedPortalOut.
// Never persisted as a node type — showNodeGraphModule intercepts portalIo.
registerNodeGraphChromelessModule("portalIo", {
  label: "Portal IO",
  compactTile: false,
  definition: {
    chrome: "InletOutletLayout",
    planRole: "processor",
    planFreeRun: true,
    defaultWidthGu: 4,
    hasFace: false,
    defaultAlias: "A",
    defaultUi: { buttonsHidden: true, titleHidden: false },
    inputChannels: { In: "gold" },
    outputChannels: { Out: "gold" },
    inputs: ["In"],
    outputs: ["Out"],
    inputLabels: { In: "\u2192" },
    outputLabels: { Out: "\u2190" },
    parameters: [],
  },
  catalog: {
    category: "portal",
    description: "Place a linked Portal \u2192 + Portal \u2190 pair (same Title bus). Rename either half syncs the other. Jack type/color follow the cable plugged in. Does not cross a Metamodule shell.",
    notes: [
      "portal",
      "portal io",
      "portal in",
      "portal out",
      "wireless",
      "bus",
      "named",
      "pair",
    ],
  },
});
