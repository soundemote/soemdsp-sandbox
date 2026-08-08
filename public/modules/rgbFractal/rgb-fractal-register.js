// Soft Fractal — pure planetary Julia face + chaotic map outs Hx/Hy.
// No multi-sine wander / harmonic soft c — modulate externally if wanted.
// Detail on the face = Depth (iteration budget). Not a separate hidden "detail" key.
registerNodeGraphChromelessModule("rgbFractal", {
  label: "Soft Fractal",
  solidModule: false,
  customDisplayArea: true,
  definition: {
    chrome: "LayoutA",
    bufferedInputs: [],
    defaultWidthGu: 5,
    displayHeightGu: 5,
    displayType: "rgbFractalFace",
    displayModes: [
      {
        key: "face",
        label: "Face",
        renderer: "rgbFractalFace",
        settingsSchema: "rgbFractalFace",
        source: { value: "Hx" },
      },
    ],
    defaultDisplayMode: "face",
    inputs: [],
    outputs: ["Hx", "Hy"],
    outputLabels: {
      Hx: "Hx",
      Hy: "Hy",
    },
    // Order matches module face strip (top → bottom).
    parameters: [
      {
        defaultValue: "0.45",
        key: "detune",
        label: "Detune Output",
        max: "3",
        mid: "0.5",
        min: "0",
        nonlinearSlider: true,
        step: "any",
        tooltip:
          "Hx/Hy map anti-lock only: skews step rate, reseed, tiny z kick. Does not change the face c path.",
      },
      {
        // Domain 0…10 with mid at 1 for fine control near freeze (MID skew).
        defaultValue: "1",
        key: "speed",
        label: "Speed",
        max: "10",
        mid: "1",
        min: "0",
        nonlinearSlider: true,
        step: "any",
        tooltip:
          "Master rate (× orbit, map step, Rotation Speed, Color Shift Rate). Domain 0…10; mid at 1. 0 freezes time.",
      },
      {
        defaultValue: "1.2",
        key: "scale",
        label: "Scale",
        max: "48",
        mid: "2",
        min: "0.1",
        nonlinearSlider: true,
        step: "any",
        tooltip:
          "Face zoom (half-span). Zooms about the X/Y look-at — pan first, then Scale digs into that point.",
      },
      {
        // Mathematical base of Julia c: family-ring position; live c = C + orbit.
        defaultValue: "0",
        key: "seed",
        label: "C",
        max: "1",
        mid: "0.5",
        min: "0",
        nonlinearSlider: false,
        step: "any",
        wraparound: true,
        tooltip:
          "Julia parameter c base (0…1 wrap along the curated family ring). Live c = C + Orbit Size·(cos θ, sin θ). Key: seed.",
      },
      {
        defaultValue: "1",
        key: "orbitSize",
        label: "Orbit Size",
        max: "16",
        mid: "1",
        min: "0",
        nonlinearSlider: true,
        step: "any",
        tooltip:
          "Radius of pure circular c orbit around C (face + map). 0 = pinned c.",
      },
      {
        defaultValue: "0",
        key: "rotation",
        label: "Rotation",
        max: "1",
        mid: "0.5",
        min: "0",
        nonlinearSlider: false,
        step: "any",
        wraparound: true,
        unit: "cycle",
        tooltip:
          "Static face view angle (0…1 cycle wrap). Adds to the free-running Rotation Speed phasor. Face only.",
      },
      {
        bipolar: true,
        defaultValue: "0",
        key: "rotationSpeed",
        label: "Rotation Speed",
        max: "4",
        mid: "0",
        min: "-4",
        nonlinearSlider: true,
        step: "any",
        tooltip:
          "Face co-rotation *rate* (× Speed). Default 0 = no spin. ±1 = natural lock to orbit rate. Face only.",
      },
      {
        bipolar: true,
        defaultValue: "0",
        key: "panX",
        label: "X",
        max: "5",
        mid: "0",
        min: "-5",
        nonlinearSlider: false,
        step: "any",
        tooltip:
          "Look-at X in the complex plane (±1 ≈ one unit). Scale zooms into (X, Y). Domain −5…+5. Face only.",
      },
      {
        bipolar: true,
        defaultValue: "0",
        key: "panY",
        label: "Y",
        max: "5",
        mid: "0",
        min: "-5",
        nonlinearSlider: false,
        step: "any",
        tooltip:
          "Look-at Y in the complex plane (±1 ≈ one unit). Scale zooms into (X, Y). Domain −5…+5. Face only.",
      },
      {
        defaultValue: "0.85",
        key: "depth",
        label: "Depth",
        max: "4",
        mid: "1",
        min: "0",
        nonlinearSlider: true,
        step: "any",
        tooltip:
          "Julia iteration detail on the face (GPU maxIter). 0 soft blobs, higher = deeper filigree.",
      },
      {
        // Not the same as Color Shift: Soft shapes energy/escape/LUT cream; Color Shift is palette phase.
        defaultValue: "0.48",
        key: "soft",
        label: "Soft",
        max: "1",
        mid: "0.35",
        min: "0",
        nonlinearSlider: false,
        step: "any",
        tooltip:
          "Structure/palette cream (escape softstep, contrast, LUT low-pass). Not Color Shift (that only slides the gradient phase).",
      },
      {
        defaultValue: "1",
        key: "bands",
        label: "Color Bands",
        max: "16",
        mid: "2",
        min: "0.25",
        nonlinearSlider: true,
        step: "any",
        tooltip:
          "1 = one pass through the gradient. Below 1 compresses low stops; above 1 multi-wraps. Soft damps wraps. Face only.",
      },
      {
        defaultValue: "0",
        key: "blur",
        label: "Edge Blur",
        max: "8",
        mid: "1.5",
        min: "0",
        nonlinearSlider: true,
        step: "any",
        tooltip:
          "Dense 1px gaussian on fractal energy (softens filaments/edges). Domain 0…8 maps to a modest max radius (~2px) to limit shimmer. Separate from Screen Blur. Face only.",
      },
      {
        defaultValue: "0",
        key: "screenBlur",
        label: "Screen Blur",
        max: "8",
        mid: "2",
        min: "0",
        nonlinearSlider: true,
        step: "any",
        tooltip:
          "True full-image soft after draw. Domain 0…8 = sub-pixel kiss → light max soft. Face only.",
      },
      {
        defaultValue: "0",
        key: "colorShift",
        label: "Color Shift",
        max: "1",
        mid: "0.5",
        min: "0",
        nonlinearSlider: false,
        step: "any",
        wraparound: true,
        tooltip:
          "Static palette phase offset (wrap 0–1). Scrubs the gradient only — does not reshape Soft/energy. Face only.",
      },
      {
        defaultValue: "1",
        key: "colorShiftRate",
        label: "Color Shift Rate",
        max: "4",
        mid: "1",
        min: "0",
        nonlinearSlider: true,
        step: "any",
        tooltip:
          "How fast the palette walks (× Speed). 0 freezes color motion; 1 = lock to Speed. Face only.",
      },
    ],
    visualSink: true,
  },
  catalog: {
    category: "rgb",
    description:
      "Julia face with pure planetary c(t). Outs Hx/Hy = chaotic map z←z²+c. Depth = face iteration detail. No multi-sine wander — modulate Seed/Orbit/Speed externally.",
    notes: [
      "rgb", "julia", "webgl", "planetary", "orbit", "map oscillator",
      "LayoutA", "hx", "hy", "parameter c", "pan", "soft", "bands",
      "depth", "detail", "rotation", "rotation speed", "color shift", "gradient",
    ],
  },
});
