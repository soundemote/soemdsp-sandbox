const nodeGraphGpuAdditiveState = {
  adapterInfo: null,
  device: null,
  deviceLostReason: "",
  initError: "",
  pipeline: null,
  renderTargets: new Map(),
  shaderModule: null,
  supported: null,
};
const nodeGraphGpuAdditiveMaxRenderTargets = 48;

const nodeGraphGpuAdditiveShader = `
struct Params {
  sampleRate: f32,
  frequency: f32,
  phase: f32,
  level: f32,
  harmonics: u32,
  waveform: u32,
  frameCount: u32,
  harmonicPhaseAlgorithm: u32,
  morph: f32,
  harmonicPhaseAdd: f32,
  harmonicPhaseMultiply: f32,
  harmonicPhaseCurve: f32,
  dampingCurve: f32,
  dampingFilterFrequency: f32,
  dampingAlgorithm: u32,
  _pad: u32,
};

@group(0) @binding(0) var<storage, read> params: Params;
@group(0) @binding(1) var<storage, read_write> outSamples: array<f32>;

fn rationalCurveValue(value: f32, skew: f32) -> f32 {
  let t = clamp(value, 0.0, 1.0);
  if (t <= 0.0) {
    return 0.0;
  }
  if (t >= 1.0) {
    return 1.0;
  }
  let safeSkew = clamp(skew, -0.999999, 0.999999);
  return clamp(((1.0 + safeSkew) * t) / (1.0 - safeSkew + 2.0 * safeSkew * t), 0.0, 1.0);
}

fn dampingAmplitude(harmonic: u32, maxHarmonics: u32, ratio: f32, curveValue: f32, algorithm: u32) -> f32 {
  let curve = clamp(curveValue, 0.0, 1.0);
  let t = clamp(ratio, 0.0, 1.0);
  if (t <= 0.0) {
    return 1.0;
  }
  if (t >= 1.0) {
    return 0.0;
  }
  if (algorithm == 1u) {
    return clamp(pow(1.0 - t, 1.0 + curve * 7.0), 0.0, 1.0);
  }
  if (algorithm == 2u) {
    let amount = 0.5 + curve * 12.0;
    let end = exp(-amount);
    return clamp((exp(-t * amount) - end) / max(0.0001, 1.0 - end), 0.0, 1.0);
  }
  if (algorithm == 3u) {
    let cutoff = clamp(0.95 - curve * 0.82, 0.08, 0.95);
    let order = 1.0 + f32(round(curve * 5.0));
    let raw = 1.0 / sqrt(1.0 + pow(t / cutoff, 2.0 * order));
    let end = 1.0 / sqrt(1.0 + pow(1.0 / cutoff, 2.0 * order));
    return clamp((raw - end) / max(0.0001, 1.0 - end), 0.0, 1.0);
  }
  if (algorithm == 4u) {
    let knee = clamp(0.78 - curve * 0.68, 0.04, 0.78);
    if (t <= knee) {
      return 1.0;
    }
    let local = (t - knee) / max(0.0001, 1.0 - knee);
    return clamp(pow(1.0 - local, 1.0 + curve * 7.0), 0.0, 1.0);
  }
  if (algorithm == 5u) {
    let tilt = curve * 4.0;
    if (tilt <= 0.0) {
      return 1.0 - t;
    }
    let h = max(1.0, f32(harmonic));
    let maxH = max(h, f32(maxHarmonics));
    let raw = 1.0 / pow(h, tilt);
    let end = 1.0 / pow(maxH, tilt);
    return clamp((raw - end) / max(0.0001, 1.0 - end), 0.0, 1.0);
  }
  return clamp(1.0 - rationalCurveValue(t, curve), 0.0, 1.0);
}

fn harmonicCurveAmount(harmonic: u32, maxHarmonics: u32, ratio: f32, curveValue: f32, algorithm: u32) -> f32 {
  return clamp(1.0 - dampingAmplitude(harmonic, maxHarmonics, ratio, curveValue, algorithm), 0.0, 1.0);
}

fn harmonicAmplitude(harmonic: u32, waveform: u32, morph: f32) -> f32 {
  let h = f32(harmonic);
  let n = harmonic;
  let mod = clamp(morph, 0.0, 1.0);
  if (waveform == 0u) {
    let target = max(1u, u32(floor(99.0 * mod + 1.0)));
    return select(0.0, 1.0, n == target);
  }
  if (waveform == 2u) {
    return select(0.0, 1.0 / h, (harmonic % 2u) == 1u);
  }
  if (waveform == 3u) {
    return select(0.0, 1.0 / (h * h), (harmonic % 2u) == 1u);
  }
  if (waveform == 4u) {
    return select((1.0 / h) * (1.0 - mod), 1.0 / h, (harmonic % 2u) == 1u);
  }
  if (waveform == 5u) {
    return cos(h * mod * 0.5) / h;
  }
  if (waveform == 6u) {
    let peak = clamp(mod, 0.001, 0.999);
    return (sin(0.5 * h * peak) / (peak * (1.0 - peak) * h * h)) * 0.2;
  }
  if (waveform == 7u) {
    let octaves = max(2u, u32(floor(2.0 + mod * 11.0)));
    var target = 1u;
    loop {
      if (target >= n) {
        break;
      }
      target = target * octaves;
    }
    return select(0.0, 1.0 / h, target == n);
  }
  return 1.0 / h;
}

fn harmonicBasePhase(harmonic: u32, waveform: u32, morph: f32) -> f32 {
  let mod = clamp(morph, 0.0, 1.0);
  if (waveform == 1u) {
    return select(0.0, 0.5, (harmonic % 2u) == 1u);
  }
  if (waveform == 2u) {
    return mod * 0.5;
  }
  if (waveform == 3u) {
    return select(0.5, 0.0, (harmonic % 4u) == 1u);
  }
  return 0.0;
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let frame = gid.x;
  if (frame >= params.frameCount) {
    return;
  }
  let t = f32(frame) / max(params.sampleRate, 1.0);
  let basePhase = params.phase + 6.28318530718 * params.frequency * t;
  let safeFrequency = max(params.frequency, 0.0);
  let safeRate = max(params.sampleRate, 1.0);
  let harmonicCount = max(1u, min(params.harmonics, u32(floor(min(20000.0, safeRate * 0.45) / max(1.0, safeFrequency)))));
  let filterFrequency = clamp(params.dampingFilterFrequency, 1.0, safeRate * 0.5);
  let filterMaxHarmonics = max(1u, u32(floor(filterFrequency / max(1.0, safeFrequency))));
  var total = 0.0;
  var norm = 0.0;
  for (var harmonic = 1u; harmonic <= harmonicCount; harmonic = harmonic + 1u) {
    let harmonicRatio = f32(harmonic - 1u) / max(1.0, f32(harmonicCount - 1u));
    let filterRatio = clamp((f32(harmonic) * safeFrequency) / filterFrequency, 0.0, 1.0);
    let damping = 1.0;
    let amp = harmonicAmplitude(harmonic, params.waveform, params.morph) * damping;
    if (amp != 0.0) {
      let phaseCurve = 0.0;
      let phaseMultiplier = 1.0 + phaseCurve * params.harmonicPhaseMultiply;
      let phaseOffset = harmonicBasePhase(harmonic, params.waveform, params.morph) + phaseCurve * params.harmonicPhaseAdd;
      total = total + sin(basePhase * f32(harmonic) * phaseMultiplier + phaseOffset * 6.28318530718) * amp;
      norm = norm + abs(amp);
    }
  }
  let normalized = select(0.0, total / max(1.0, norm * 0.72), norm > 0.0);
  outSamples[frame] = clamp(normalized * params.amplitude, -1.0, 1.0);
}
`;

function nodeGraphGpuAdditiveAvailable() {
  return typeof navigator !== "undefined" && Boolean(navigator.gpu);
}

function nodeGraphResetGpuAdditiveBackend(reason = "") {
  for (const target of nodeGraphGpuAdditiveState.renderTargets.values()) {
    nodeGraphDestroyGpuAdditiveRenderTarget(target);
  }
  nodeGraphGpuAdditiveState.adapterInfo = null;
  nodeGraphGpuAdditiveState.device = null;
  nodeGraphGpuAdditiveState.initError = String(reason || "");
  nodeGraphGpuAdditiveState.pipeline = null;
  nodeGraphGpuAdditiveState.renderTargets.clear();
  nodeGraphGpuAdditiveState.shaderModule = null;
  nodeGraphGpuAdditiveState.supported = false;
}

async function nodeGraphEnsureGpuAdditiveBackend() {
  if (!nodeGraphGpuAdditiveAvailable()) {
    nodeGraphGpuAdditiveState.supported = false;
    nodeGraphGpuAdditiveState.initError = "WebGPU unavailable";
    return null;
  }
  if (nodeGraphGpuAdditiveState.device && nodeGraphGpuAdditiveState.pipeline) {
    return nodeGraphGpuAdditiveState;
  }
  try {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
      throw new Error("No WebGPU adapter");
    }
    const device = await adapter.requestDevice();
    if (device?.lost && typeof device.lost.then === "function") {
      device.lost.then((info) => {
        const reason = info?.message || info?.reason || "WebGPU device lost";
        nodeGraphGpuAdditiveState.deviceLostReason = reason;
        nodeGraphResetGpuAdditiveBackend(reason);
      }).catch((error) => {
        const reason = error?.message || String(error);
        nodeGraphGpuAdditiveState.deviceLostReason = reason;
        nodeGraphResetGpuAdditiveBackend(reason);
      });
    }
    const shaderModule = device.createShaderModule({
      code: nodeGraphGpuAdditiveShader,
      label: "Soundemote GPU Additive Shader",
    });
    const pipeline = device.createComputePipeline({
      compute: {
        entryPoint: "main",
        module: shaderModule,
      },
      label: "Soundemote GPU Additive Pipeline",
      layout: "auto",
    });
    nodeGraphGpuAdditiveState.adapterInfo = typeof adapter.requestAdapterInfo === "function"
      ? await adapter.requestAdapterInfo().catch(() => null)
      : null;
    nodeGraphGpuAdditiveState.deviceLostReason = "";
    nodeGraphGpuAdditiveState.device = device;
    nodeGraphGpuAdditiveState.initError = "";
    nodeGraphGpuAdditiveState.pipeline = pipeline;
    nodeGraphGpuAdditiveState.shaderModule = shaderModule;
    nodeGraphGpuAdditiveState.supported = true;
    return nodeGraphGpuAdditiveState;
  } catch (error) {
    nodeGraphResetGpuAdditiveBackend(error?.message || String(error));
    return null;
  }
}

function nodeGraphGpuAdditiveCpuRender(params = {}, frameCount = 128, sampleRate = nodeGraphMvp?.sampleRate || 44100) {
  const frames = Math.max(1, Math.floor(Number(frameCount) || 1));
  const safeRate = Math.max(1, Number(sampleRate) || nodeGraphMvp?.sampleRate || 44100);
  const out = new Float32Array(frames);
  const frequency = Math.max(0, Number(params.frequency) || 0);
  const phase = Number(params.phase) || 0;
  const phaseIncrement = (frequency / safeRate) * Math.PI * 2;
  for (let frame = 0; frame < frames; frame += 1) {
    out[frame] = nodeGraphAdditiveOscillatorSample(
      null,
      "gpuAdditiveCpuRender",
      phase + phaseIncrement * frame,
      params,
      safeRate,
    );
  }
  return out;
}

function nodeGraphCreateGpuAdditiveRenderTarget(device, pipeline, frameCount, cacheKey = "") {
  const outputByteLength = frameCount * Float32Array.BYTES_PER_ELEMENT;
  const paramsBuffer = device.createBuffer({
    label: `Soundemote GPU Additive Params ${cacheKey || "transient"}`,
    size: 64,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  const outputBuffer = device.createBuffer({
    label: `Soundemote GPU Additive Output ${cacheKey || "transient"}`,
    size: outputByteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
  });
  const readbackBuffer = device.createBuffer({
    label: `Soundemote GPU Additive Readback ${cacheKey || "transient"}`,
    size: outputByteLength,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });
  const bindGroup = device.createBindGroup({
    entries: [
      { binding: 0, resource: { buffer: paramsBuffer } },
      { binding: 1, resource: { buffer: outputBuffer } },
    ],
    label: `Soundemote GPU Additive BindGroup ${cacheKey || "transient"}`,
    layout: pipeline.getBindGroupLayout(0),
  });
  return {
    bindGroup,
    cacheKey,
    frameCount,
    outputBuffer,
    outputByteLength,
    paramsBuffer,
    readbackBuffer,
  };
}

function nodeGraphDestroyGpuAdditiveRenderTarget(target) {
  for (const buffer of [
    target?.paramsBuffer,
    target?.outputBuffer,
    target?.readbackBuffer,
  ]) {
    if (typeof buffer?.destroy === "function") {
      buffer.destroy();
    }
  }
}

function nodeGraphTrimGpuAdditiveRenderTargets() {
  while (nodeGraphGpuAdditiveState.renderTargets.size > nodeGraphGpuAdditiveMaxRenderTargets) {
    const firstKey = nodeGraphGpuAdditiveState.renderTargets.keys().next().value;
    if (!firstKey) {
      break;
    }
    const target = nodeGraphGpuAdditiveState.renderTargets.get(firstKey);
    nodeGraphGpuAdditiveState.renderTargets.delete(firstKey);
    nodeGraphDestroyGpuAdditiveRenderTarget(target);
  }
}

function nodeGraphGpuAdditiveRenderTarget(device, pipeline, frameCount, cacheKey = "") {
  const safeKey = String(cacheKey || "");
  if (!safeKey) {
    return nodeGraphCreateGpuAdditiveRenderTarget(device, pipeline, frameCount);
  }
  const targetKey = `${safeKey}:${frameCount}`;
  let target = nodeGraphGpuAdditiveState.renderTargets.get(targetKey);
  if (!target) {
    target = nodeGraphCreateGpuAdditiveRenderTarget(device, pipeline, frameCount, safeKey);
    nodeGraphGpuAdditiveState.renderTargets.set(targetKey, target);
    nodeGraphTrimGpuAdditiveRenderTargets();
  }
  return target;
}

async function nodeGraphRenderGpuAdditiveChunk(params = {}, options = {}) {
  const frameCount = Math.max(1, Math.min(65536, Math.floor(Number(options.frameCount) || 128)));
  const sampleRate = Math.max(1, Number(options.sampleRate) || nodeGraphMvp?.sampleRate || 44100);
  const cacheKey = String(options.cacheKey || "");
  const backend = await nodeGraphEnsureGpuAdditiveBackend();
  if (!backend?.device || !backend?.pipeline) {
    return {
      backend: "cpu-fallback",
      diagnostics: {
        deviceLostReason: nodeGraphGpuAdditiveState.deviceLostReason || "",
        reason: nodeGraphGpuAdditiveState.initError || "WebGPU unavailable",
        supported: nodeGraphGpuAdditiveState.supported === true,
      },
      samples: nodeGraphGpuAdditiveCpuRender(params, frameCount, sampleRate),
    };
  }

  const device = backend.device;
  const paramsArray = new ArrayBuffer(64);
  const paramsFloat = new Float32Array(paramsArray);
  const paramsUint = new Uint32Array(paramsArray);
  paramsFloat[0] = sampleRate;
  paramsFloat[1] = Math.max(0, Number(params.frequency) || 0);
  paramsFloat[2] = Number(params.phase) || 0;
  paramsFloat[3] = clampNodeSliderValue(Number(params.amplitude) || 0, 0, 1);
  paramsUint[4] = Math.max(1, Math.min(nodeGraphAdditiveHardMaxHarmonics, Math.round(Number(params.harmonics) || 32)));
  paramsUint[5] = Math.max(0, Math.min(7, Math.round(Number(params.waveform) || 1)));
  paramsUint[6] = frameCount;
  paramsUint[7] = 0;
  paramsFloat[8] = clampNodeSliderValue(Number(params.morph) || 0, 0, 1);
  paramsFloat[9] = clampNodeSliderValue(Number(params.harmonicPhaseAdd) || 0, 0, 1);
  paramsFloat[10] = clampNodeSliderValue(Number(params.harmonicPhaseMultiply) || 0, 0, 4);
  paramsFloat[11] = 0;
  paramsFloat[12] = 0;
  paramsFloat[13] = Math.max(1, Number(params.dampingFilterFrequency) || 20000);
  paramsUint[14] = 0;
  paramsUint[15] = 0;

  const target = nodeGraphGpuAdditiveRenderTarget(device, backend.pipeline, frameCount, cacheKey);
  device.queue.writeBuffer(target.paramsBuffer, 0, paramsArray);
  const commandEncoder = device.createCommandEncoder();
  const pass = commandEncoder.beginComputePass();
  pass.setPipeline(backend.pipeline);
  pass.setBindGroup(0, target.bindGroup);
  pass.dispatchWorkgroups(Math.ceil(frameCount / 64));
  pass.end();
  commandEncoder.copyBufferToBuffer(target.outputBuffer, 0, target.readbackBuffer, 0, target.outputByteLength);
  device.queue.submit([commandEncoder.finish()]);
  await target.readbackBuffer.mapAsync(GPUMapMode.READ);
  const samples = new Float32Array(target.readbackBuffer.getMappedRange().slice(0));
  target.readbackBuffer.unmap();
  return {
    backend: "webgpu",
    diagnostics: {
      cachedTarget: Boolean(cacheKey),
      frameCount,
      gpuRecipe: "full-additive-v1",
      harmonics: paramsUint[4],
      adapter: nodeGraphGpuAdditiveState.adapterInfo || null,
      renderTargetCount: nodeGraphGpuAdditiveState.renderTargets.size,
      sampleRate,
      supported: true,
      waveform: paramsUint[5],
    },
    samples,
  };
}

if (typeof window !== "undefined") {
  window.nodeGraphGpuAdditive = {
    available: nodeGraphGpuAdditiveAvailable,
    renderChunk: nodeGraphRenderGpuAdditiveChunk,
    state: nodeGraphGpuAdditiveState,
  };
}
