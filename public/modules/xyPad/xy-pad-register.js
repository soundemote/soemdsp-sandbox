registerNodeGraphChromelessModule("xyPad", {
  label: "XY Pad",
  customDisplayArea: true,
  solidModule: true,
  definition: {
    displayHeightGu: 4,
    inputAliases: {
      "X In": "X",
      "Y In": "Y",
    },
    inputs: ["X", "Y"],
    outputs: ["X", "Y", "Gate", "Spike"],
    outputLabels: {
      Gate: "G",
      Spike: "P",
    },
    parameters: [
      { defaultValue: "0.5", hidden: true, key: "x", label: "X", max: "1", mid: "0.5", min: "0", nonlinearSlider: false, step: "any" },
      { defaultValue: "0.5", hidden: true, key: "y", label: "Y", max: "1", mid: "0.5", min: "0", nonlinearSlider: false, step: "any" },
      { defaultValue: "0", hidden: true, key: "gate", label: "Gate", max: "1", mid: "0.5", min: "0", nonlinearSlider: false, step: "any" },
      { defaultValue: "0", key: "xQuantize", label: "X Quantize", max: "1", mid: "0.5", min: "0", nonlinearSlider: false, step: "any" },
      { defaultValue: "0", key: "yQuantize", label: "Y Quantize", max: "1", mid: "0.5", min: "0", nonlinearSlider: false, step: "any" },
      { defaultValue: "0", key: "xPhase", label: "X Phase", max: "1", mid: "0.5", min: "0", nonlinearSlider: false, step: "any" },
      { defaultValue: "0", key: "yPhase", label: "Y Phase", max: "1", mid: "0.5", min: "0", nonlinearSlider: false, step: "any" },
    ],
  },
  catalog: {
    category: "controller",
    description: "Interactive XY pad controller with side-mounted X/Y inputs, a custom center surface, right-side outputs, and standard controls below.",
    notes: ["solid custom module", "XY controller", "spike + gate", "quantize grid"],
  },
});
