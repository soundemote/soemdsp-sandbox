// 4-point 3rd-order Hermite (x-form) for sample playback.
// Better than linear for varispeed / scratch. Not band-limited (no sinc).

function nodeGraphSampleReadHermite(channel, frameIndex) {
  if (!channel?.length) {
    return 0;
  }
  const maxIndex = channel.length - 1;
  let index = Number(frameIndex) || 0;
  if (index < 0) {
    index = 0;
  } else if (index > maxIndex) {
    index = maxIndex;
  }
  const i1 = Math.floor(index);
  const t = index - i1;
  const i0 = i1 > 0 ? i1 - 1 : 0;
  const i2 = i1 < maxIndex ? i1 + 1 : maxIndex;
  const i3 = i2 < maxIndex ? i2 + 1 : maxIndex;
  const y0 = Number(channel[i0]) || 0;
  const y1 = Number(channel[i1]) || 0;
  const y2 = Number(channel[i2]) || 0;
  const y3 = Number(channel[i3]) || 0;
  const c1 = 0.5 * (y2 - y0);
  const c2 = y0 - 2.5 * y1 + 2 * y2 - 0.5 * y3;
  const c3 = 0.5 * (y3 - y0) + 1.5 * (y1 - y2);
  return ((c3 * t + c2) * t + c1) * t + y1;
}
