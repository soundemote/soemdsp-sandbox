NodeLiveAudioProcessor.prototype.visualHslToRgb = function visualHslToRgb(hue, saturation, lightness) {
    const h = ((nodeGraphFiniteNumber(hue)) % 1 + 1) % 1;
    const s = this.clampValue(nodeGraphFiniteNumber(saturation), 0, 1);
    const l = this.clampValue(nodeGraphFiniteNumber(lightness), 0, 1);
    if (s <= 0) {
      return [l, l, l];
    }
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const channel = (offset) => {
      let t = h + offset;
      if (t < 0) {
        t += 1;
      }
      if (t > 1) {
        t -= 1;
      }
      if (t < 1 / 6) {
        return p + (q - p) * 6 * t;
      }
      if (t < 1 / 2) {
        return q;
      }
      if (t < 2 / 3) {
        return p + (q - p) * (2 / 3 - t) * 6;
      }
      return p;
    };
    return [channel(1 / 3), channel(0), channel(-1 / 3)];
  };

