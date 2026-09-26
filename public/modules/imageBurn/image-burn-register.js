// Image Ghost — residual stamp. Bright is the level; modulate that knob. 📺 is the picture.
registerNodeGraphChromelessModule("imageBurn", {
  label: "Image Ghost",
  solidModule: false,
  customDisplayArea: true,
  definition: {
    chrome: "LayoutA",
    planRole: "monitor",
    bufferedInputs: [],
    defaultWidthGu: 6,
    displayHeightGu: 4,
    displayType: "imageBurnFace",
    displayRenderer: "imageBurnFace",
    displayModes: [
      {
        key: "face",
        label: "Face",
        renderer: "imageBurnFace",
        settingsSchema: "imageBurnFace",
      },
    ],
    defaultDisplayMode: "face",
    inputs: ["rgba"],
    inputLabels: { rgba: "📺" },
    inputTooltips: {
      rgba: "Picture in. Replaces the loaded file while connected. Same shared picture context.",
    },
    outputs: ["rgba"],
    outputLabels: { rgba: "📺" },
    outputTooltips: {
      rgba: "Residual picture out, after Hang / Burn / Blur.",
    },
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
        tooltip: "Stamp level. 0 is dark, 1 is full. Modulation adds to this and stays inside 0…1.",
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
    visualSink: true,
  },
  catalog: {
    category: "rgb",
    description:
      "Load an image and print it into a Hang/Burn residual. "
      + "Bright is the stamp level (modulate that knob). 📺 in replaces the file; 📺 out is the residual. "
      + "Feedback 0 max-blends, >0 accumulates, <0 stamps dimmer.",
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
      "LayoutA",
    ],
  },
});
