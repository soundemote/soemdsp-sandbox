// Value LCD — reflective seven-segment plate (grey glass, dark ink).
// Shares the number-readout draw path (displayType numberReadout) with faceStyle lcd.
// Ghost + Trail use the app-wide residual policy (same settings as Value LED).

registerNodeGraphChromelessModule("valueLcd", {
  label: "Value LCD",
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
    description: "Value LCD: grey plate, dark ink DSEG digits, faint always-on segments (Ghost) + previous-value Trail. Cheap reflective LCD look. Search: value, LCD, multimeter.",
    notes: [
      "value",
      "value lcd",
      "lcd readout",
      "value display",
      "numeric display",
      "digital readout",
      "seven-segment",
      "reflective",
      "ghost",
      "trail",
      "DSEG7",
      "multimeter",
    ],
  },
});
