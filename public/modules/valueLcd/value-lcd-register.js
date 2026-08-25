// LCD Value — reflective seven-segment plate (grey glass, dark ink).
// Shares the number-readout draw path (displayType numberReadout) with faceStyle lcd.
// Ghost + Trail use the app-wide residual policy (same settings as LED Value).

registerNodeGraphChromelessModule("valueLcd", {
  label: "LCD Value",
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
    // Digital inlet — white jack / white cable (numeric readout).
    digitalInputs: ["In"],
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
    description: "LCD Value: grey plate, dark ink DSEG digits, faint always-on segments (Ghost) + previous-value Trail. Cheap reflective LCD look. Search: LCD Value, LCD, multimeter.",
    notes: [
      "lcd value",
      "lcd",
      "lcd readout",
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
