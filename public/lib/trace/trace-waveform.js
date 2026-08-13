// Time-stable waveform path for Instant Trace.
//
// Instant Trace used to sample a uniform i/(n-1) lattice and remap it
// 0..width every frame. Rounding the window and changing n made the
// stroke hop (the "rounding error" jitter). A real drawer:
//   • pins x to sample index: x = (i - viewStart) / span * width
//   • draws every sample when they fit
//   • otherwise keeps min+max of each time bucket in chronological order
// The stroke translates / envelopes. It does not remesh a progress lattice.

(function initTraceWaveform(global) {
  const MAX_SAMPLES_PER_BUCKET = 256;

  function clampUnit(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) {
      return 0;
    }
    if (n < -1) {
      return -1;
    }
    if (n > 1) {
      return 1;
    }
    return n;
  }

  function interpolatedSample(buffer, position) {
    const last = Math.max(0, (buffer?.length || 1) - 1);
    const p = Math.max(0, Math.min(last, Number(position) || 0));
    const i0 = Math.floor(p);
    const i1 = Math.min(last, i0 + 1);
    const t = p - i0;
    const a = Number(buffer[i0]) || 0;
    const b = Number(buffer[i1]) || a;
    return a + (b - a) * t;
  }

  function bucketHasDiscontinuity(buffer, from, to, threshold) {
    if (!(to > from) || !(threshold > 0)) {
      return false;
    }
    const last = (buffer?.length || 1) - 1;
    for (let i = from; i < to; i += 1) {
      const a = Number(buffer[i]) || 0;
      const b = Number(buffer[Math.min(last, i + 1)]) || 0;
      if (Math.abs(b - a) > threshold) {
        return true;
      }
    }
    return false;
  }

  /**
   * @param {object} options
   * @param {ArrayLike<number>} options.buffer
   * @param {number} options.start  fractional buffer index (inclusive)
   * @param {number} options.end    fractional buffer index (exclusive)
   * @param {number} options.width
   * @param {number} options.height
   * @param {number} [options.midY]
   * @param {number} [options.halfHeight]
   * @param {number} [options.gain]
   * @param {number} [options.offset]
   * @param {boolean} [options.skipDiscontinuities]
   * @param {number} [options.discontinuityThreshold]
   * @returns {Array<{x:number,y:number}|null>}
   */
  function buildPoints(options) {
    const buffer = options?.buffer;
    const width = Math.max(1, Number(options?.width) || 1);
    const height = Math.max(1, Number(options?.height) || 1);
    if (!buffer?.length || !(width > 0) || !(height > 0)) {
      return [];
    }
    const start = Number(options.start);
    const end = Number(options.end);
    if (!Number.isFinite(start) || !Number.isFinite(end) || !(end > start)) {
      return [];
    }
    const span = end - start;
    const gain = Number.isFinite(Number(options.gain)) ? Number(options.gain) : 1;
    const offset = Number(options.offset) || 0;
    const midY = Number.isFinite(Number(options.midY)) ? Number(options.midY) : height * 0.5;
    const halfHeight = Number.isFinite(Number(options.halfHeight))
      ? Number(options.halfHeight)
      : height * 0.42;
    const skipDisc = options.skipDiscontinuities === true;
    const discThreshold = Number.isFinite(Number(options.discontinuityThreshold))
      ? Number(options.discontinuityThreshold)
      : 0.85;

    const mapX = (sampleIndex) => ((sampleIndex - start) / span) * width;
    const mapY = (raw) => midY - clampUnit(raw * gain + offset) * halfHeight;

    const first = Math.max(0, Math.floor(start));
    const last = Math.min(buffer.length - 1, Math.ceil(end) - 1);
    if (last < first) {
      return [];
    }

    const points = [];
    const push = (x, y, breakBefore) => {
      if (breakBefore && points.length && points[points.length - 1] !== null) {
        points.push(null);
      }
      points.push({ x, y });
    };

    const sampleCount = last - first + 1;
    // ~3 verts/pixel: enough for min+max plus a join, cheap enough live.
    const maxVertices = Math.max(2, Math.floor(width) * 3);

    if (sampleCount <= maxVertices) {
      if (start < first) {
        push(mapX(start), mapY(interpolatedSample(buffer, start)), false);
      }
      let prev = first;
      for (let i = first; i <= last; i += 1) {
        push(
          mapX(i),
          mapY(Number(buffer[i]) || 0),
          skipDisc && i > prev && bucketHasDiscontinuity(buffer, prev, i, discThreshold),
        );
        prev = i;
      }
      if (end - 1 > last) {
        const tail = Math.min(end, buffer.length - 1);
        push(mapX(tail), mapY(interpolatedSample(buffer, tail)), false);
      }
      return points;
    }

    const buckets = Math.max(1, Math.floor(maxVertices / 2));
    let prevIndex = first;
    for (let b = 0; b < buckets; b += 1) {
      const t0 = start + (b / buckets) * span;
      const t1 = start + ((b + 1) / buckets) * span;
      const rangeStart = Math.max(first, Math.floor(t0));
      const rangeEnd = Math.min(last + 1, Math.max(rangeStart + 1, Math.ceil(t1)));
      const rangeLen = rangeEnd - rangeStart;
      const stride = Math.max(1, Math.floor(rangeLen / MAX_SAMPLES_PER_BUCKET));
      let minV = Infinity;
      let maxV = -Infinity;
      let minI = rangeStart;
      let maxI = rangeStart;
      for (let i = rangeStart; i < rangeEnd; i += stride) {
        const value = Number(buffer[i]) || 0;
        if (value < minV) {
          minV = value;
          minI = i;
        }
        if (value > maxV) {
          maxV = value;
          maxI = i;
        }
      }
      if (stride > 1) {
        const i = rangeEnd - 1;
        const value = Number(buffer[i]) || 0;
        if (value < minV) {
          minV = value;
          minI = i;
        }
        if (value > maxV) {
          maxV = value;
          maxI = i;
        }
      }
      if (!(minV <= maxV)) {
        minV = 0;
        maxV = 0;
        minI = rangeStart;
        maxI = rangeStart;
      }
      const broke = skipDisc && bucketHasDiscontinuity(
        buffer,
        prevIndex,
        Math.min(minI, maxI),
        discThreshold,
      );
      if (minI === maxI) {
        push(mapX(minI), mapY(minV), broke);
        prevIndex = minI;
      } else if (minI < maxI) {
        push(mapX(minI), mapY(minV), broke);
        push(mapX(maxI), mapY(maxV), false);
        prevIndex = maxI;
      } else {
        push(mapX(maxI), mapY(maxV), broke);
        push(mapX(minI), mapY(minV), false);
        prevIndex = minI;
      }
    }
    return points;
  }

  global.TraceWaveform = {
    MAX_SAMPLES_PER_BUCKET,
    buildPoints,
    interpolatedSample,
  };
})(typeof window !== "undefined" ? window : globalThis);
