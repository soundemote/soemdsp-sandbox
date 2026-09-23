// LCD Dot — reflective plate + ink stamp (Vector Dot shape, LCD Value look).
registerNodeGraphChromelessModule("lcdDot", {
  label: "LCD Dot",
  customDisplayArea: true,
  solidModule: true,
  definition: {
    planRole: "monitor",
    bufferedInputs: ["In"],
    defaultWidthGu: 2,
    displayHeightGu: 2,
    displayType: "lcdDot",
    displayRenderer: "lcdDot",
    displayModes: [
      { key: "lcdDot", label: "LCD Dot", renderer: "lcdDot", source: { value: "In" } },
    ],
    inputs: ["In"],
    // Digital inlet — white jack / white cable.
    digitalInputs: ["In"],
    outputs: ["Thru"],
    outputLabels: { Thru: "←" },
    parameters: [],
    visualInputs: [
      { key: "lcdDot", label: "In", port: "In" },
    ],
    visualSink: true,
  },
  catalog: {
    category: "multimeter",
    description: "LCD Dot: glass plate, ink shape (circle/pill/squircle). LCD Value plate/ink/shadow + LED Dot stamps. Search: lcd, led, dot, blink, indicator.",
    notes: [
      "lcd",
      "lcd dot",
      "vector dot",
      "blink",
      "indicator",
      "reflective",
      "squircle",
      "pill",
      "multimeter",
    ],
  },
});
