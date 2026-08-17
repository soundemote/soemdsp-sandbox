registerNodeGraphChromelessModule("simulationTime", {
  label: "⏱ Sim Time",
  customDisplayArea: true,
  solidModule: true,
  definition: {
    planRole: "source",
    planFreeRun: true,
    bufferedInputs: ["In"],
    defaultWidthGu: 7,
    defaultHeightGu: 3,
    displayHeightGu: 2,
    displayType: "numberReadout",
    defaultAlias: "⏱",
    defaultDisplaySettings: {
      digits: 12,
      decimals: 7,
      polarity: "unipolar",
      decimalBudget: true,
      removeTrailingZeros: false,
    },
    inputLabels: {
      In: "In",
    },
    inputTooltips: {
      In: "(does nothing, will implement later)",
    },
    inputs: ["In"],
    outputs: ["A", "Time"],
    outputLabels: { A: "A", Time: "t" },
    digitalOutputs: ["A"],
    parameters: [],
    visualInputs: [
      { key: "simulationTime", label: "Time", port: "Time" },
    ],
    visualSink: true,
    displayModes: [
      {
        key: "numberReadout",
        renderer: "numberReadout",
        settingsSchema: "numberReadout",
        source: { value: "Time" },
      },
    ],
    displaySignals: [
      { key: "Time", kind: "scalar" },
      { key: "A", kind: "scalar" },
    ],
  },
  catalog: {
    category: "clock",
    description: "Shows how many sample-rate seconds have been processed (Planck 1e-7). A is a per-sample gate.",
    notes: ["simulation time", "sim time", "seconds", "planck", "gate"],
  },
});
