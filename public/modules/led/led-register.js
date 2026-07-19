// LED's definition/catalog metadata -- see
// node-graph-chromeless-module-registry.js for why this lives here instead
// of node-graph-module-definitions.js / node-graph-module-store.js, and
// why this file has to load early (before those two build their frozen
// objects).
registerNodeGraphChromelessModule("led", {
  label: "LED",
  compactTile: true,
  definition: {
    bufferedInputs: ["In"],
    displayType: "dot",
    inputs: ["In"],
    outputs: ["Out"],
    parameters: [],
    visualInputs: [
      { key: "led", label: "In", port: "In" },
    ],
    visualSink: true,
  },
  catalog: {
    category: "LED",
    description: "One-grid-unit signal light. Patch any gate or control signal into In and use it as a compact in-world indicator.",
    notes: ["1 GU tile", "input light", "visual indicator"],
  },
});
