// LED's definition/catalog metadata -- see
// node-graph-chromeless-module-registry.js for why this lives here instead
// of node-graph-module-definitions.js / node-graph-module-store.js, and
// why this file has to load early (before those two build their frozen
// objects).
registerNodeGraphChromelessModule("led", {
  label: "LED",
  // Same LayoutB solid shell as Number Readout / XY Pad (ports beside face).
  // No compact-tile / no-label special cases — shared LayoutB chrome only.
  solidModule: true,
  customDisplayArea: true,
  definition: {
    planRole: "monitor",
    bufferedInputs: ["In"],
    defaultWidthGu: 2,
    displayType: "vectorDot",
    displayRenderer: "vectorDot",
    displayModes: [
      { key: "vectorDot", label: "Vector Dot", renderer: "vectorDot", source: { value: "In" } },
    ],
    displayHeightGu: 2,
    inputs: ["In"],
    outputs: ["Out"],
    parameters: [],
    visualInputs: [
      { key: "led", label: "In", port: "In" },
    ],
    visualSink: true,
  },
  catalog: {
    category: "object",
    description: "Signal light. Layout B (In | Vector Dot | Out). Buffered In energy drives the shared Vector Dot face.",
    notes: ["LayoutB", "resizable", "input light", "visual indicator", "vector dot"],
  },
});
