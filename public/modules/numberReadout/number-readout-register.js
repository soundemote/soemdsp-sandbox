// LED Value — solid-module layout (same shell family as XY Pad):
// short input on the left, lit seven-segment face in the center, → thru on the right.
// Scope/draw path stays in node-graph-module-scope-number-readout.js (displayType numberReadout).
// Internal type id remains numberReadout for patch compatibility.

registerNodeGraphChromelessModule("numberReadout", {
  label: "LED Value",
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
    outputLabels: { Thru: "←" },
    parameters: [],
    visualInputs: [
      { key: "numberReadout", label: "In", port: "In" },
    ],
    visualSink: true,
  },
  catalog: {
    category: "multimeter",
    description: "LED Value: lit DSEG digits with Ghost/Trail residual hang + Burn sticky floor (app-wide residual policy). Side-mounted input, → thru for chaining. Search: LED Value, LED, numeric display.",
    notes: [
      "led value",
      "led readout",
      "number readout",
      "latest value",
      "numeric display",
      "numeric value",
      "digital readout",
      "solid module",
      "ghost",
      "trail",
      "burn",
      "burnAmount",
      "DSEG7",
      "multimeter",
    ],
  },
});
