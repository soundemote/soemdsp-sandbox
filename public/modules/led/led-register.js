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
    displayType: "dot",
    defaultDisplayMode: "dot",
    displayModes: [
      {
        key: "dot",
        label: "Phosphor Dot",
        renderer: "dot",
        settingsSchema: "dot",
        source: { value: "In" },
      },
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
    description: "Signal light. Layout B (In | phosphor dot | Out). Wired In drives the shared 0D phosphor-dot face.",
    notes: ["LayoutB", "resizable", "phosphor dot", "input light", "visual indicator"],
  },
});
