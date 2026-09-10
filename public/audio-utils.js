function readAscii(view, offset, length) {
  let value = "";
  for (let index = 0; index < length; index += 1) {
    value += String.fromCharCode(view.getUint8(offset + index));
  }
  return value;
}

function writeAscii(view, offset, text) {
  for (let index = 0; index < text.length; index += 1) {
    view.setUint8(offset + index, text.charCodeAt(index));
  }
}

function nodeGraphRenderedWavBlob(rendered, fallbackSampleRate = 44100) {
  const sampleRate = nodeGraphFiniteNumber(rendered?.sampleRate, fallbackSampleRate);
  const leftSamples = rendered?.leftSamples || rendered?.samples;
  const rightSamples = rendered?.rightSamples || leftSamples;
  const frames = Math.max(leftSamples?.length || 0, rightSamples?.length || 0);
  const channels = 2;
  const bytesPerSample = 2;
  const dataSize = frames * channels * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * bytesPerSample, true);
  view.setUint16(32, channels * bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, dataSize, true);
  let offset = 44;
  for (let frame = 0; frame < frames; frame += 1) {
    const left = leftSamples?.[frame] || 0;
    const right = rightSamples?.[frame] || 0;
    view.setInt16(offset, left < 0 ? left * 0x8000 : left * 0x7fff, true);
    offset += bytesPerSample;
    view.setInt16(offset, right < 0 ? right * 0x8000 : right * 0x7fff, true);
    offset += bytesPerSample;
  }
  return new Blob([buffer], { type: "audio/wav" });
}

function parsePcm16Wav(buffer) {
  const view = new DataView(buffer);
  if (readAscii(view, 0, 4) !== "RIFF" || readAscii(view, 8, 4) !== "WAVE") {
    throw new Error("Expected RIFF/WAVE data");
  }

  let channels = 0;
  let sampleRate = 0;
  let bitsPerSample = 0;
  let audioFormat = 0;
  let dataOffset = 0;
  let dataSize = 0;
  let offset = 12;

  while (offset + 8 <= view.byteLength) {
    const id = readAscii(view, offset, 4);
    const size = view.getUint32(offset + 4, true);
    const dataStart = offset + 8;

    if (id === "fmt ") {
      audioFormat = view.getUint16(dataStart, true);
      channels = view.getUint16(dataStart + 2, true);
      sampleRate = view.getUint32(dataStart + 4, true);
      bitsPerSample = view.getUint16(dataStart + 14, true);
    }

    if (id === "data") {
      dataOffset = dataStart;
      dataSize = size;
    }

    offset = dataStart + size + (size % 2);
  }

  if (audioFormat !== 1 || bitsPerSample !== 16 || channels < 1 || dataSize === 0) {
    throw new Error("Expected PCM 16-bit WAV data");
  }

  const frames = Math.floor(dataSize / (channels * 2));
  const samples = new Float32Array(frames);
  for (let frame = 0; frame < frames; frame += 1) {
    let sum = 0;
    for (let channel = 0; channel < channels; channel += 1) {
      const sampleOffset = dataOffset + (frame * channels + channel) * 2;
      sum += view.getInt16(sampleOffset, true) / 32768;
    }
    samples[frame] = sum / channels;
  }

  return {
    bitsPerSample,
    channels,
    dataBytes: dataSize,
    fileBytes: buffer.byteLength,
    frames,
    sampleRate,
    samples,
  };
}

function analyzeWaveform(samples) {
  if (!samples.length) {
    return {
      dcOffset: 0,
      max: 0,
      min: 0,
      peak: 0,
      rms: 0,
    };
  }

  let max = -Infinity;
  let min = Infinity;
  let sum = 0;
  let squareSum = 0;
  for (const sample of samples) {
    max = Math.max(max, sample);
    min = Math.min(min, sample);
    sum += sample;
    squareSum += sample * sample;
  }

  return {
    dcOffset: sum / samples.length,
    max,
    min,
    peak: Math.max(Math.abs(min), Math.abs(max)),
    rms: Math.sqrt(squareSum / samples.length),
  };
}

function analyzeSampleRange(samples, startFrame, endFrame) {
  const start = Math.max(0, Math.min(samples.length, startFrame));
  const end = Math.max(start, Math.min(samples.length, endFrame));
  if (end <= start) {
    return {
      dcOffset: 0,
      max: 0,
      min: 0,
      peak: 0,
      rms: 0,
    };
  }

  let max = -Infinity;
  let min = Infinity;
  let sum = 0;
  let squareSum = 0;
  for (let frame = start; frame < end; frame += 1) {
    const sample = samples[frame] || 0;
    max = Math.max(max, sample);
    min = Math.min(min, sample);
    sum += sample;
    squareSum += sample * sample;
  }

  const frames = end - start;
  return {
    dcOffset: sum / frames,
    max,
    min,
    peak: Math.max(Math.abs(min), Math.abs(max)),
    rms: Math.sqrt(squareSum / frames),
  };
}

function estimateZeroCrossingFrequency(samples, startFrame, endFrame, sampleRate) {
  const start = Math.max(0, Math.min(samples.length, startFrame));
  const end = Math.max(start, Math.min(samples.length, endFrame));
  if (end - start < 2 || sampleRate <= 0) {
    return null;
  }

  const crossings = [];
  let previous = samples[start] || 0;
  for (let frame = start + 1; frame < end; frame += 1) {
    const current = samples[frame] || 0;
    if (previous < 0 && current >= 0) {
      const span = current - previous;
      const offset = span === 0 ? 0 : -previous / span;
      crossings.push(frame - 1 + offset);
    }
    previous = current;
  }

  if (crossings.length < 2) {
    return null;
  }

  const first = crossings[0];
  const last = crossings[crossings.length - 1];
  const seconds = (last - first) / sampleRate;
  return seconds > 0 ? (crossings.length - 1) / seconds : null;
}

function buildLevelEnvelope(waveform) {
  const windowFrames = Math.max(1, Math.round(waveform.sampleRate * 0.01));
  const windows = [];
  let peak = 0;
  let squareSum = 0;
  let totalFrames = 0;

  for (let startFrame = 0; startFrame < waveform.frames; startFrame += windowFrames) {
    const endFrame = Math.min(waveform.frames, startFrame + windowFrames);
    let windowPeak = 0;
    let windowSquareSum = 0;

    for (let frame = startFrame; frame < endFrame; frame += 1) {
      const value = waveform.samples[frame] || 0;
      const abs = Math.abs(value);
      windowPeak = Math.max(windowPeak, abs);
      windowSquareSum += value * value;
    }

    const frames = Math.max(1, endFrame - startFrame);
    const rms = Math.sqrt(windowSquareSum / frames);
    windows.push({
      endFrame,
      peak: windowPeak,
      rms,
      startFrame,
    });
    peak = Math.max(peak, windowPeak);
    squareSum += windowSquareSum;
    totalFrames += frames;
  }

  return {
    peak,
    rms: totalFrames ? Math.sqrt(squareSum / totalFrames) : 0,
    windowFrames,
    windowMs: (windowFrames / waveform.sampleRate) * 1000,
    windows,
  };
}

Object.assign(window, {
  analyzeSampleRange,
  analyzeWaveform,
  buildLevelEnvelope,
  estimateZeroCrossingFrequency,
  nodeGraphRenderedWavBlob,
  parsePcm16Wav,
  readAscii,
  writeAscii,
});
