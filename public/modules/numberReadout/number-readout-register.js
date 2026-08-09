// Number Readout — solid-module layout (same shell family as XY Pad):
// short input on the left, LCD face in the center, → thru on the right.
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
    // Dry passthrough so the face can sit in-line (In → face + Thru).
    outputs: ["Thru"],
    outputLabels: { Thru: "→" },
    parameters: [],
    visualInputs: [
      { key: "numberReadout", label: "In", port: "In" },
    ],
    visualSink: true,
  },
  catalog: {
    category: "multimeter",
    description: "Solid LCD number face: hard DSEG digits with residual ghosts of previous values. Side-mounted input, → thru for chaining. Search: value, numeric display, LCD.",
    notes: [
      "value",
      "value display",
      "latest value",
      "numeric display",
      "numeric value",
      "digital readout",
      "solid module",
      "LCD readout",
      "decay ghosts",
      "DSEG7",
      "multimeter",
    ],
  },
});
