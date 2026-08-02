// Number Readout — solid-module layout (same shell family as XY Pad):
// short input on the left, LCD face in the center, no outputs.
// Scope/draw path stays in node-graph-module-scopes.js (displayType numberReadout).

registerNodeGraphChromelessModule("numberReadout", {
  label: "Number Readout",
  customDisplayArea: true,
  solidModule: true,
  definition: {
    bufferedInputs: ["In"],
    defaultWidthGu: 7,
    displayHeightGu: 2,
    displayType: "numberReadout",
    inputLabels: {
      In: "In",
    },
    inputs: ["In"],
    outputs: [],
    parameters: [],
    visualInputs: [
      { key: "numberReadout", label: "In", port: "In" },
    ],
    visualSink: true,
  },
  catalog: {
    category: "multimeter",
    description: "Solid LCD number face: hard DSEG digits with residual ghosts of previous values. Side-mounted input, no header chrome.",
    notes: ["solid module", "LCD readout", "decay ghosts", "DSEG7", "multimeter"],
  },
});
