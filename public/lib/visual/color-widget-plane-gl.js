// Colour picker saturation/value plane — HSL/HSV from UV + hue uniform on the
// shared picture device. Canvas2D putImageData kept as fallback.

(function initColorWidgetPlaneGl(global) {
  const REV = 1;
  let shared = null;

  const VERT = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

  // modes: 0 = HSV plane (planeRgb), 1 = HSL lamp (hueBrightness), 2 = BW
  const FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 vUv;
uniform float uHue;
uniform float uMode;

vec3 hueUnit(float hueDeg) {
  float h = mod(mod(hueDeg, 360.0) + 360.0, 360.0);
  float hp = h / 60.0;
  float c = 1.0;
  float x = c * (1.0 - abs(mod(hp, 2.0) - 1.0));
  if (hp < 1.0) return vec3(c, x, 0.0);
  if (hp < 2.0) return vec3(x, c, 0.0);
  if (hp < 3.0) return vec3(0.0, c, x);
  if (hp < 4.0) return vec3(0.0, x, c);
  if (hp < 5.0) return vec3(x, 0.0, c);
  return vec3(c, 0.0, x);
}

// Match planeRgb(h, u, v): HSV sat×value square.
vec3 planeRgb(float hueDeg, float u, float v) {
  float s = clamp(u, 0.0, 1.0);
  float value = clamp(v, 0.0, 1.0);
  float c = value * s;
  float h = mod(mod(hueDeg, 360.0) + 360.0, 360.0);
  float hp = h / 60.0;
  float x = c * (1.0 - abs(mod(hp, 2.0) - 1.0));
  vec3 rgb = vec3(0.0);
  if (hp < 1.0) rgb = vec3(c, x, 0.0);
  else if (hp < 2.0) rgb = vec3(x, c, 0.0);
  else if (hp < 3.0) rgb = vec3(0.0, c, x);
  else if (hp < 4.0) rgb = vec3(0.0, x, c);
  else if (hp < 5.0) rgb = vec3(x, 0.0, c);
  else rgb = vec3(c, 0.0, x);
  float m = value - c;
  return rgb + vec3(m);
}

float easeHermite(float t) {
  float x = clamp(t, 0.0, 1.0);
  return x * x * (3.0 - 2.0 * x);
}

// Port of nodeGraphHueBrightnessRgb01(hue, brightness, saturation).
vec3 hueBrightness(float hueDeg, float bright, float sat) {
  vec3 hue = hueUnit(hueDeg);
  float t = clamp(bright, 0.0, 1.0);
  vec3 lin = pow(max(hue, vec3(0.0)), vec3(2.2));
  vec3 outc;
  if (t <= 0.5) {
    float e = easeHermite(t / 0.5);
    outc = pow(lin * e, vec3(1.0 / 2.2));
  } else {
    float e = easeHermite((t - 0.5) / 0.5);
    outc = pow(lin * (1.0 - e) + e, vec3(1.0 / 2.2));
  }
  float s = clamp(sat, 0.0, 1.0);
  if (s < 1.0 - 1e-6) {
    float y = 0.2126 * outc.r + 0.7152 * outc.g + 0.0722 * outc.b;
    outc = outc * s + vec3(y) * (1.0 - s);
  }
  return clamp(outc, 0.0, 1.0);
}

void main() {
  // vUv: x = u (left→right), y = bottom→top in GL. Plane wants v up from bottom.
  float u = vUv.x;
  float v = vUv.y;
  float mode = floor(uMode + 0.5);
  vec3 rgb;
  if (mode < 0.5) {
    rgb = planeRgb(uHue, u, v);
  } else if (mode < 1.5) {
    rgb = hueBrightness(uHue, v, u);
  } else {
    float g = clamp(v, 0.0, 1.0);
    rgb = vec3(g);
  }
  gl_FragColor = vec4(rgb, 1.0);
}
`;

  function compile(gl, type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      gl.deleteShader(sh);
      return null;
    }
    return sh;
  }

  function link(gl, vsSrc, fsSrc) {
    const vs = compile(gl, gl.VERTEX_SHADER, vsSrc);
    const fs = compile(gl, gl.FRAGMENT_SHADER, fsSrc);
    if (!vs || !fs) return null;
    const p = gl.createProgram();
    gl.attachShader(p, vs);
    gl.attachShader(p, fs);
    gl.linkProgram(p);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      gl.deleteProgram(p);
      return null;
    }
    return p;
  }

  function getShared() {
    if (shared?.gl && !shared.gl.isContextLost() && shared.rev === REV) return shared;
    shared = null;
    const picture = typeof nodeGraphPictureDevice === "function" ? nodeGraphPictureDevice() : null;
    if (!picture?.gl) return null;
    const gl = picture.gl;
    const program = link(gl, VERT, FRAG);
    if (!program) return null;
    shared = {
      rev: REV,
      gl,
      canvas: picture.canvas,
      quad: picture.quad,
      program,
      aPos: gl.getAttribLocation(program, "aPos"),
      uHue: gl.getUniformLocation(program, "uHue"),
      uMode: gl.getUniformLocation(program, "uMode"),
    };
    return shared;
  }

  /**
   * Paint colour plane into destCanvas (2D backing). channels: full|hsl|bw.
   * @returns {boolean}
   */
  function paint(destCanvas, width, height, hueDeg, channels) {
    const device = getShared();
    if (!device || !destCanvas) return false;
    const w = Math.max(2, Math.round(width) | 0);
    const h = Math.max(2, Math.round(height) | 0);
    if (w > device.canvas.width || h > device.canvas.height) return false;

    let mode = 0;
    const ch = String(channels || "full");
    if (ch === "hsl" || ch === "hbs") mode = 1;
    else if (ch === "bw") mode = 2;

    const gl = device.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, w, h);
    gl.scissor(0, 0, w, h);
    gl.enable(gl.SCISSOR_TEST);
    gl.disable(gl.BLEND);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(device.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, device.quad);
    gl.enableVertexAttribArray(device.aPos);
    gl.vertexAttribPointer(device.aPos, 2, gl.FLOAT, false, 0, 0);
    gl.uniform1f(device.uHue, Number(hueDeg) || 0);
    gl.uniform1f(device.uMode, mode);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.disable(gl.SCISSOR_TEST);

    if (destCanvas.width !== w) destCanvas.width = w;
    if (destCanvas.height !== h) destCanvas.height = h;
    const ctx = destCanvas.getContext("2d");
    if (!ctx) return false;
    try {
      const srcY = Math.max(0, device.canvas.height - h);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      // GL y-up scissor → drawImage bottom strip: flip so plane v=1 is top.
      ctx.drawImage(device.canvas, 0, srcY, w, h, 0, 0, w, h);
    } catch (_e) {
      return false;
    }
    return true;
  }

  global.ColorWidgetPlaneGl = {
    paint,
    available: () => Boolean(getShared()),
    rev: REV,
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
