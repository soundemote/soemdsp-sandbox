// Bug Button's definition/catalog metadata -- see
// node-graph-chromeless-module-registry.js for why this lives here instead
// of node-graph-module-definitions.js / node-graph-module-store.js, and why
// this file has to load early (before those two build their frozen objects).
//
// A resizable pointer surface with six direct interaction signals. It is
// intentionally its own event source rather than an Impulse Button variant:
// down/up edges, held/hover gates, and bipolar pointer coordinates all need
// to remain coherent within the same audio block.

function normalizeNodeGraphBugButtonGlyph(value) {
  const text = String(value ?? "").trim();
  if (!text) {
    return "\u{1F41E}";
  }
  if (typeof Intl?.Segmenter === "function") {
    const segment = new Intl.Segmenter(undefined, { granularity: "grapheme" })
      .segment(text)[Symbol.iterator]().next().value?.segment;
    return segment || "\u{1F41E}";
  }
  return Array.from(text)[0] || "\u{1F41E}";
}

registerNodeGraphChromelessModule("bugButton", {
  label: "Bug Button",
  compactTile: true,
  customDisplayArea: true,
  solidModule: true,
  definition: {
    planRole: "source",
    defaultWidthGu: 4,
    digitalOutputs: ["Mouse Up", "Mouse Down", "Dn/Up", "Mouse Hover"],
    displayHeightGu: 4,
    inputLabels: {
      Size: "S",
      X: "X",
      Y: "Y",
      Opacity: "O",
    },
    inputs: ["X", "Y", "Size", "Opacity"],
    outputLabels: {
      "Mouse Up": "\u2B06",
      "Mouse Down": "\u2B07",
      "Dn/Up": "G",
      "Mouse Hover": "H",
    },
    outputs: ["Mouse Up", "Mouse Down", "Dn/Up", "Mouse Hover", "X", "Y"],
    parameters: [
      {
        defaultValue: "0",
        key: "xPosition",
        label: "X Position",
        max: "1",
        mid: "0",
        min: "-1",
        nonlinearSlider: false,
        step: "any",
        tooltip: "Moves the character horizontally around center. -1 is left, 0 is center, and +1 is right.",
      },
      {
        defaultValue: "0",
        key: "yPosition",
        label: "Y Position",
        max: "1",
        mid: "0",
        min: "-1",
        nonlinearSlider: false,
        step: "any",
        tooltip: "Moves the character vertically around center. -1 is down, 0 is center, and +1 is up.",
      },
      {
        defaultValue: "1",
        key: "size",
        label: "Size",
        max: "2",
        mid: "1",
        min: "0",
        nonlinearSlider: false,
        step: "any",
        tooltip: "Scales the displayed character or emoji. 0 is invisible; 1 is normal size; 2 is double size.",
      },
      {
        defaultValue: "1",
        key: "opacity",
        label: "Opacity",
        max: "1",
        mid: "0.5",
        min: "0",
        nonlinearSlider: false,
        step: "any",
        tooltip: "Controls character opacity from fully transparent at 0 to fully visible at 1.",
      },
    ],
  },
  catalog: {
    category: "gametrigger",
    description: "Resizable character button with down/up spikes, held and hover gates, and bipolar pointer X/Y outputs.",
    notes: ["editable glyph", "pointer gates", "down/up spikes", "bipolar X/Y"],
  },
});
