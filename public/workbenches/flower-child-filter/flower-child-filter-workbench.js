const canvas = document.getElementById("flowerCanvas");
const ctx = canvas.getContext("2d");
const packet = document.getElementById("flowerPacket");
const auditionButton = document.getElementById("flowerAuditionButton");

const controls = {
  source: document.getElementById("flowerSource"),
  cutoff: document.getElementById("flowerCutoff"),
  resonance: document.getElementById("flowerResonance"),
  chaos: document.getElementById("flowerChaos"),
  input: document.getElementById("flowerInput"),
  output: document.getElementById("flowerOutput"),
  dryWet: document.getElementById("flowerDryWet"),
  oversampling: document.getElementById("flowerOversampling"),
};

let audioContext = null;
let preview = [];
let phase = 0;
let noiseSeed = 845;
let state = createFlowerChildRev1State();

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, nodeGraphFiniteNumber(value)));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function pitchToFrequency(pitch) {
  return 440 * 2 ** ((pitch - 69) / 12);
}

function rationalShape(t, shape) {
  const x = clamp(t, 0, 1);
  const k = clamp(shape, -0.99, 0.99);
  return k >= 0
    ? x / (1 + k * (1 - x))
    : (x * (1 + k)) / (1 + k * x);
}

function exponentialShape(t, shape) {
  const x = clamp(t, 0, 1);
  const k = clamp(shape, -0.99, 0.99);
  if (Math.abs(k) < 0.001) {
    return x;
  }
  const curve = k < 0 ? 1 + Math.abs(k) * 7 : 1 / (1 + k * 7);
  return x ** curve;
}

function graphValue(nodes, x) {
  const sorted = [...nodes].sort((a, b) => a.x - b.x);
  if (x <= sorted[0].x) {
    return sorted[0].y;
  }
  for (let index = 1; index < sorted.length; index += 1) {
    const left = sorted[index - 1];
    const right = sorted[index];
    if (x <= right.x) {
      const span = Math.max(0.000001, right.x - left.x);
      let t = (x - left.x) / span;
      if (right.shape === "rational") {
        t = rationalShape(t, right.c || 0);
      } else if (right.shape === "exponential") {
        t = exponentialShape(t, right.c || 0);
      }
      return lerp(left.y, right.y, t);
    }
  }
  return sorted[sorted.length - 1].y;
}

const flowerChildRev1Graphs = Object.freeze({
  fmPmCrossfade: [
    { x: 0, y: 0.21 },
    { x: 1, y: 0, shape: "exponential", c: 0.53 },
  ],
  resonanceVsFrequency: [
    { x: 0, y: 0 },
    { x: 0.732441, y: 0 },
    { x: 1, y: 0, shape: "rational", c: -0.38 },
  ],
});

function readSettings() {
  return {
    source: controls.source.value,
    cutoff: clamp(controls.cutoff.value, 0, 1),
    resonance: clamp(controls.resonance.value, 0, 1),
    chaos: clamp(controls.chaos.value, 0, 1),
    input: clamp(controls.input.value, 0, 10),
    output: clamp(controls.output.value, 0, 10),
    dryWet: clamp(controls.dryWet.value, 0, 1),
    oversampling: Math.round(clamp(controls.oversampling.value, 1, 8)),
  };
}

function createOnePoleLowpass() {
  return { value: 0 };
}

function onePoleLowpassSample(filter, input, cutoff, sampleRate) {
  const safeCutoff = clamp(cutoff, 0.0001, sampleRate * 0.45);
  const coefficient = 1 - Math.exp((-2 * Math.PI * safeCutoff) / sampleRate);
  filter.value += coefficient * (input - filter.value);
  return filter.value;
}

function createFlowerChildRev1State() {
  return {
    phasor: 0,
    lpf1: createOnePoleLowpass(),
    lpf2: createOnePoleLowpass(),
    noiseFilter: createOnePoleLowpass(),
    selfMod: 0,
  };
}

function seededNoise() {
  noiseSeed = (noiseSeed * 1664525 + 1013904223) >>> 0;
  return (noiseSeed / 0xffffffff) * 2 - 1;
}

function sourceSample(settings, sampleRate) {
  phase = (phase + 110 / sampleRate) % 1;
  if (settings.source === "noise") {
    return seededNoise() * 0.52;
  }
  if (settings.source === "pulse") {
    return phase < 0.18 ? 0.85 : -0.32;
  }
  return phase * 2 - 1;
}

function curve(value, amount) {
  return rationalShape(value, amount);
}

function flowerChildRev1Sample(input, settings, sampleRate) {
  const inputAmplitude = settings.input * 2.3;
  const maxNormFreq = sampleRate <= 44100 ? 0.928 : 1;
  const frequencyNormalized = Math.min(settings.cutoff, maxNormFreq);
  const pitch = lerp(3, 161, frequencyNormalized);
  const frequency = pitchToFrequency(pitch);
  const fmPmCrossfade = graphValue(flowerChildRev1Graphs.fmPmCrossfade, frequencyNormalized);
  const cutoff1 = frequency * 0.164312;
  const cutoff2 = frequency * 0.366131;

  const resonanceGraph = [
    { x: 0, y: settings.resonance },
    { x: 0.732441, y: settings.resonance },
    { x: 1, y: Math.min(settings.resonance, 0.649123), shape: "rational", c: -0.38 },
  ];
  const selfModAmp = lerp(0.0368, 0.6333, curve(graphValue(resonanceGraph, settings.resonance), 0.4));
  const noise = onePoleLowpassSample(state.noiseFilter, seededNoise(), 20000, sampleRate) * settings.chaos;
  let inputSignal = clamp(inputAmplitude * -input, -1, 1) + noise;
  inputSignal = state.selfMod + 0.0358487 * inputSignal;

  const mod = 1.4 * inputSignal;
  const fm = Math.cos((Math.PI * 0.5) * fmPmCrossfade) * mod;
  const pm = Math.sin((Math.PI * 0.5) * fmPmCrossfade) * mod;
  state.phasor = (state.phasor + (frequency * fm) / sampleRate + pm) % 1;
  if (state.phasor < 0) {
    state.phasor += 1;
  }

  let oscillator = Math.sin(2 * Math.PI * state.phasor) * 1.3;
  oscillator = onePoleLowpassSample(state.lpf1, oscillator, cutoff1, sampleRate);
  oscillator = onePoleLowpassSample(state.lpf2, oscillator, cutoff2, sampleRate);
  state.selfMod = oscillator * selfModAmp;
  return oscillator * 1.31;
}

function processPreview(settings, seconds = 1.1, sampleRate = 44100) {
  state = createFlowerChildRev1State();
  preview = [];
  const frames = Math.round(seconds * sampleRate);
  const stride = Math.max(1, Math.floor(frames / 720));
  const wet = Math.sin(settings.dryWet * Math.PI * 0.5);
  const dry = Math.cos(settings.dryWet * Math.PI * 0.5);
  let peak = 0;
  for (let frame = 0; frame < frames; frame += 1) {
    const drySample = sourceSample(settings, sampleRate);
    let wetSample = 0;
    for (let over = 0; over < settings.oversampling; over += 1) {
      wetSample = flowerChildRev1Sample(drySample, settings, sampleRate * settings.oversampling);
    }
    const out = clamp((wetSample * wet + drySample * dry) * settings.output, -1.4, 1.4);
    peak = Math.max(peak, Math.abs(out));
    if (frame % stride === 0) {
      preview.push(out);
    }
  }
  return peak;
}

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const width = Math.max(1, Math.round(rect.width * dpr));
  const height = Math.max(1, Math.round(rect.height * dpr));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
}

function drawPreview() {
  resizeCanvas();
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "rgba(3, 6, 5, 0.72)";
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = "rgba(128, 213, 154, 0.12)";
  ctx.lineWidth = 1;
  for (let x = 0; x < width; x += width / 16) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = 0; y < height; y += height / 10) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  if (!preview.length) {
    return;
  }
  ctx.lineWidth = Math.max(1, width / 900);
  ctx.strokeStyle = "rgba(255, 242, 138, 0.92)";
  ctx.shadowColor = "rgba(128, 213, 154, 0.56)";
  ctx.shadowBlur = 16;
  ctx.beginPath();
  preview.forEach((sample, index) => {
    const x = (index / Math.max(1, preview.length - 1)) * width;
    const y = height * 0.5 - sample * height * 0.28;
    if (index === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });
  ctx.stroke();
  ctx.shadowBlur = 0;
}

function updateOutputs() {
  const settings = readSettings();
  const peak = processPreview(settings);
  document.getElementById("flowerCutoffValue").textContent = settings.cutoff.toFixed(3);
  document.getElementById("flowerResonanceValue").textContent = settings.resonance.toFixed(3);
  document.getElementById("flowerChaosValue").textContent = settings.chaos.toFixed(3);
  document.getElementById("flowerInputValue").textContent = settings.input.toFixed(3);
  document.getElementById("flowerOutputValue").textContent = settings.output.toFixed(3);
  document.getElementById("flowerDryWetValue").textContent = settings.dryWet.toFixed(3);
  document.getElementById("flowerOversamplingValue").textContent = `${settings.oversampling}x`;
  packet.textContent = JSON.stringify({
    workbench: "flower-child-filter",
    source: "C:/Users/argit/Desktop/backup/oldcode/old stuff se_framework/Modules/FlowerChildFilter",
    oldClass: "FlowerChildRev1",
    sandboxModuleDraft: {
      type: "flowerChildFilter1",
      label: "Flower Child Filter 1",
      category: "Filter",
      layout: "filterCurve",
      inputs: ["In", "Cutoff", "Resonance", "Chaos"],
      outputs: ["Out"],
      parameters: {
        cutoff: { kind: "decimal", min: 0, max: 1, def: settings.cutoff },
        resonance: { kind: "decimal", min: 0, max: 1, def: settings.resonance },
        chaos: { kind: "decimal", min: 0, max: 1, def: settings.chaos },
        input: { kind: "decimal", min: 0, max: 10, def: settings.input },
        output: { kind: "decimal", min: 0, max: 10, def: settings.output },
        dryWet: { kind: "decimal", min: 0, max: 1, def: settings.dryWet },
        oversampling: { kind: "integer", min: 1, max: 8, def: settings.oversampling },
      },
      graphMarionette: {
        fmPmCrossfade: flowerChildRev1Graphs.fmPmCrossfade,
        resonanceVsFrequency: "sample-rate-aware graph; node 2 clamps resonance near Nyquist",
        cutoffMapping: "normalized cutoff -> pitch 3..161 -> Hz",
      },
    },
    currentProbe: {
      source: settings.source,
      peak: Number(peak.toFixed(4)),
      approximation: "Browser workbench uses two one-pole LP stages in place of RAPT LP6 ladder pairs.",
    },
  }, null, 2);
  drawPreview();
}

function ensureAudioContext() {
  audioContext ||= new AudioContext();
  return audioContext;
}

function audition() {
  const settings = readSettings();
  const context = ensureAudioContext();
  const sampleRate = context.sampleRate;
  const seconds = 1.1;
  state = createFlowerChildRev1State();
  const buffer = context.createBuffer(1, Math.round(seconds * sampleRate), sampleRate);
  const data = buffer.getChannelData(0);
  for (let index = 0; index < data.length; index += 1) {
    const drySample = sourceSample(settings, sampleRate);
    let wetSample = 0;
    for (let over = 0; over < settings.oversampling; over += 1) {
      wetSample = flowerChildRev1Sample(drySample, settings, sampleRate * settings.oversampling);
    }
    const wet = Math.sin(settings.dryWet * Math.PI * 0.5);
    const dry = Math.cos(settings.dryWet * Math.PI * 0.5);
    data[index] = clamp((wetSample * wet + drySample * dry) * settings.output * 0.22, -0.92, 0.92);
  }
  const src = context.createBufferSource();
  const gain = context.createGain();
  gain.gain.value = 0.8;
  src.buffer = buffer;
  src.connect(gain).connect(context.destination);
  src.start();
}

for (const control of Object.values(controls)) {
  control.addEventListener("input", updateOutputs);
  control.addEventListener("change", updateOutputs);
}
auditionButton.addEventListener("click", audition);
window.addEventListener("resize", drawPreview);
updateOutputs();
