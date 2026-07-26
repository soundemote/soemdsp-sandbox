// LED's definition/catalog metadata -- see
// node-graph-chromeless-module-registry.js for why this lives here instead
// of node-graph-module-definitions.js / node-graph-module-store.js, and
// why this file has to load early (before those two build their frozen
// objects).
registerNodeGraphChromelessModule("led", {
  label: "LED",
  compactTile: true,
  solidModule: true,
  solidPortLabels: false,
  // The lit face IS the module's display area. Declaring it as a custom
  // display area is what gives LED the displayHeight sizing capability
  // (nodeGraphModuleSizingCapabilities), so the height arrows / keyboard
  // shortcut grow it in whole grid units the same way width already grew.
  customDisplayArea: true,
  definition: {
    bufferedInputs: ["In"],
    // Not the shared "dot" (0D Burn) renderer any more: LED draws its own
    // lamp face from public/modules/led/led-display.js, which paints the
    // element in CSS so the squircle/rounding controls can shape it.
    displayType: "ledLamp",
    displayHeightGu: 1,
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
    description: "Signal light. Patch any gate or control signal into In and use it as an in-world indicator -- one grid unit by default, resizable in both directions, with its own color/blur/rounding/brightness settings.",
    notes: ["resizable tile", "input light", "visual indicator"],
  },
});
