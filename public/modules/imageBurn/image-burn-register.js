// Image Ghost — energy-driven residual image stamp (In brightness × Feedback deposit).
registerNodeGraphChromelessModule("imageBurn", {
  label: "Image Ghost",
  solidModule: true,
  customDisplayArea: true,
  definition: {
    planRole: "monitor",
    bufferedInputs: ["In"],
    defaultWidthGu: 4,
    displayHeightGu: 4,
    displayType: "imageBurnFace",
    displayRenderer: "imageBurnFace",
    displayModes: [
      {
        key: "face",
        label: "Face",
        renderer: "imageBurnFace",
        settingsSchema: "imageBurnFace",
        source: { value: "In" },
      },
    ],
    defaultDisplayMode: "face",
    inputs: ["In"],
    digitalInputs: ["In"],
    inputLabels: { In: "Brightness" },
    outputs: ["Thru"],
    outputLabels: { Thru: "←" },
    parameters: [
      {
        defaultValue: "1",
        key: "size",
        label: "Size",
        max: "2",
        mid: "1",
        min: "0",
        nonlinearSlider: false,
        step: "any",
        tooltip: "Image scale on the face. 1 ≈ fit; >1 zooms past edges. Dial range is metadata-owned.",
      },
      {
        defaultValue: "1",
        key: "brightness",
        label: "Bright",
        max: "1",
        mid: "0.5",
        min: "0",
        nonlinearSlider: false,
        step: "any",
        tooltip: "Dry image gain on In energy (0…1). Independent of Feedback.",
      },
      {
        defaultValue: "0",
        key: "blacks",
        label: "Blacks",
        max: "2",
        mid: "1",
        min: "0",
        nonlinearSlider: false,
        step: "any",
        tooltip:
          "Crush mid/lows toward black (highs protected). "
          + "0 = unchanged; 2 = max crush. Applied to dry + hang stamp.",
      },
      {
        bipolar: true,
        defaultValue: "0",
        key: "feedback",
        label: "Feedback",
        max: "1",
        mid: "0",
        min: "-1",
        nonlinearSlider: false,
        step: "any",
        tooltip:
          "How hang receives the lit image (Hang always gets pixels). "
          + "0 = max-blend full lit (no stack / no brighten). "
          + ">0 = additive accumulate (brighter over time). "
          + "<0 = max-blend a dimmer stamp (still no stack).",
      },
      {
        defaultValue: "0.55",
        key: "hang",
        label: "Hang",
        max: "1",
        mid: "0.5",
        min: "0",
        nonlinearSlider: false,
        step: "any",
        tooltip: "Residual persistence. 0 = wipe fast; 1 = freeze. Independent of Feedback.",
      },
      {
        defaultValue: "0.75",
        key: "burn",
        label: "Burn",
        max: "1",
        mid: "0.5",
        min: "0",
        nonlinearSlider: false,
        step: "any",
        tooltip:
          "Highlights linger longer than Hang alone. "
          + "0 = whole residual fades at Hang; 1 = peaks nearly freeze. "
          + "Hang is always the floor — Burn never kills darks faster than Hang.",
      },
      {
        defaultValue: "0.45",
        key: "blur",
        label: "Blur",
        max: "1",
        mid: "0.5",
        min: "0",
        nonlinearSlider: true,
        step: "any",
        tooltip: "Bloom recirculation on the residual. Fine near 0; high = soft glow.",
      },
    ],
    visualInputs: [
      { key: "imageBurn", label: "Brightness", port: "In" },
    ],
    visualSink: true,
  },
  catalog: {
    category: "rgb",
    description:
      "Load an image and print it into a dedicated Hang/Burn residual (Image Ghost). "
      + "Params: Size, Bright, Blacks, Feedback, Hang, Burn, Blur. "
      + "Feedback 0 max-blends lit into hang, >0 accumulates, <0 dimmer max-blend. "
      + "Display Settings: image asset, background, Clear residual.",
    notes: [
      "image ghost",
      "image burn",
      "residual",
      "picture",
      "rgb",
      "feedback",
      "hang",
      "blacks",
      "burn",
      "blur",
      "LayoutB",
    ],
  },
});
