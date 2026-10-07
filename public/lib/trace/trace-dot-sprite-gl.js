// LED / LCD Dot / RGB Shape — SDF evaluated per pixel in GLSL on the shared
// picture device. Live frames do not bake JS sprites (JS bake kept as fallback).

(function initTraceDotSpriteGl(global) {
  const REV = 2;
  let shared = null;

  const VERT = `
    attribute vec2 aPos;
    void main() {
      gl_Position = vec4(aPos, 0.0, 1.0);
    }
  `;

  // shapeId: 0 circle/oval, 1 pill, 2 squircle, 3 ngon, 4 star, 5 heart,
  // 6 trapezoid, 7 diamond, 8 cross, 9 ring, 10 teardrop, 11 flower
  const FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 uResolution;
uniform vec2 uCenter;
uniform vec2 uHalf; // rx, ry
uniform float uBlur;
uniform float uShape;
uniform float uParam;
uniform float uAmount;
uniform sampler2D uLut;
uniform float uFlat;
uniform vec4 uFlatColor;
uniform vec4 uDestRect; // x,y,w,h in dest pixels (scissor already set)

float hermite(float t) {
  float x = clamp(t, 0.0, 1.0);
  return x * x * (3.0 - 2.0 * x);
}

float sdfBox(vec2 p, vec2 b) {
  vec2 q = abs(p) - b;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
}

float sdfRoundedBox(vec2 p, vec2 b, float r) {
  float rr = clamp(r, 0.0, min(b.x, b.y));
  return sdfBox(p, max(b - vec2(rr), 0.0)) - rr;
}

float sdfSuperellipse(vec2 p, vec2 r, float n) {
  vec2 a = abs(p) / max(r, vec2(1e-6));
  float pw = pow(a.x, n) + pow(a.y, n);
  float rad = pow(max(pw, 0.0), 1.0 / n);
  return (rad - 1.0) * min(r.x, r.y);
}

float sdfPolygon(vec2 p, float radius, float sides) {
  float n = max(3.0, floor(sides + 0.5));
  float ang = atan(p.y, p.x) + 1.5707963;
  float sector = 6.2831853 / n;
  float a = mod(mod(ang, sector) + sector, sector) - sector * 0.5;
  float r = length(p);
  float edge = radius * cos(3.14159265 / n);
  return r * cos(a) - edge;
}

float sdfStar(vec2 p, float radius, float points, float innerRatio) {
  float n = max(3.0, floor(points + 0.5));
  float ang = atan(p.y, p.x) + 1.5707963;
  float sector = 3.14159265 / n;
  float a = abs(mod(mod(ang, sector * 2.0) + sector * 2.0, sector * 2.0) - sector);
  float r = length(p);
  float t = a / sector;
  float rim = radius * (1.0 - t) + radius * innerRatio * t;
  return r - rim;
}

float sdfHeart(vec2 p, vec2 r, float plump) {
  float radius = min(r.x, r.y);
  float pp = 0.75 + clamp(plump, 0.0, 1.0) * 0.55;
  float x = p.x / max(1e-6, radius);
  float y = -p.y / max(1e-6, radius);
  float sx = x / pp;
  float sx2 = sx * sx;
  float aa = sx2 + y * y - 1.0;
  return (aa * aa * aa - sx2 * y * y * y) * radius * 0.55;
}

float sdfTrapezoid(vec2 p, vec2 r, float ratio) {
  float top = max(0.05, r.x * (0.08 + clamp(ratio, 0.0, 1.0) * 0.92));
  float bottom = r.x;
  float t = (p.y + r.y) / max(1e-6, r.y * 2.0);
  float halfW = bottom + (top - bottom) * clamp(t, 0.0, 1.0);
  return sdfBox(p, vec2(halfW, r.y));
}

float sdfCross(vec2 p, vec2 r, float thick) {
  float t = 0.12 + clamp(thick, 0.0, 1.0) * 0.55;
  return min(sdfBox(p, vec2(r.x, r.y * t)), sdfBox(p, vec2(r.x * t, r.y)));
}

float sdfRing(vec2 p, float radius, float hole) {
  float outer = radius;
  float inner = radius * (0.08 + clamp(hole, 0.0, 1.0) * 0.78);
  float d = length(p);
  return max(d - outer, inner - d);
}

float sdfTeardrop(vec2 p, float radius, float taper) {
  float t = clamp(taper, 0.0, 1.0);
  float bulb = length(p - vec2(0.0, -radius * 0.18)) - radius * (0.72 - t * 0.12);
  float tipY = -radius * (0.55 + t * 0.4);
  float tipR = radius * (0.22 + (1.0 - t) * 0.18);
  float tip = length(p - vec2(0.0, tipY * 0.15)) - tipR;
  float ang = atan(p.x, -(p.y + radius * 0.05));
  float cone = abs(ang) * radius * (0.55 - t * 0.2) - (radius * 0.35 - p.y * 0.2);
  return min(bulb, max(tip, cone));
}

float sdfFlower(vec2 p, float radius, float petalsParam) {
  float petals = floor(3.0 + clamp(petalsParam, 0.0, 1.0) * 5.0 + 0.5);
  float ang = atan(p.y, p.x);
  float r = length(p);
  float wave = 0.55 + 0.45 * cos(ang * petals);
  return r - radius * wave;
}

float squircleN(float rounding) {
  float p = clamp(rounding, 0.0, 1.0);
  float t = p * p;
  return 28.0 + (4.0 - 28.0) * t;
}

float sdfForShape(vec2 p, vec2 r, float shape, float param) {
  float id = floor(shape + 0.5);
  float rad = min(r.x, r.y);
  if (id < 0.5) {
    return sdfSuperellipse(p, r, 2.0); // circle / oval
  }
  if (id < 1.5) {
    if (param <= 1e-4) return sdfBox(p, r);
    return sdfRoundedBox(p, r, rad * param);
  }
  if (id < 2.5) {
    if (param <= 1e-4) return sdfBox(p, r);
    return sdfSuperellipse(p, r, squircleN(param));
  }
  if (id < 3.5) {
    float sides = 3.0 + clamp(param, 0.0, 1.0) * 9.0;
    return sdfPolygon(p, rad, sides);
  }
  if (id < 4.5) {
    float pts = 3.0 + clamp(param, 0.0, 1.0) * 9.0;
    return sdfStar(p, rad, pts, 0.42);
  }
  if (id < 5.5) return sdfHeart(p, r, param);
  if (id < 6.5) return sdfTrapezoid(p, r, param);
  if (id < 7.5) {
    float n = 1.05 + (1.0 - clamp(param, 0.0, 1.0)) * 1.6;
    return sdfSuperellipse(p, r, n);
  }
  if (id < 8.5) return sdfCross(p, r, param);
  if (id < 9.5) return sdfRing(p, rad, param);
  if (id < 10.5) return sdfTeardrop(p, rad, param);
  return sdfFlower(p, rad, param);
}

void main() {
  vec2 frag = gl_FragCoord.xy;
  vec2 p = frag - uCenter;
  vec2 r = max(uHalf, vec2(0.5));
  float charR = min(r.x, r.y);
  float b = clamp(uBlur, 0.0, 1.0);
  float b2 = b * b;
  float inner = max(0.0, charR * (1.0 - b2 * 0.88) - (b2 < 0.004 ? 0.65 : 0.0));
  float outer = charR * (1.0 + b2 * 1.65) + max(1.0, 1.1 - b2);
  float span = max(1e-6, outer - inner);
  float dist = sdfForShape(p, r, uShape, uParam);
  float a = 1.0 - hermite((dist - (inner - charR)) / span);
  a = clamp(a, 0.0, 1.0);
  float amt = clamp(uAmount, 0.0, 1.0);
  float e = clamp(amt * a, 0.0, 1.0);
  vec3 col;
  float alpha;
  if (uFlat > 0.5) {
    col = uFlatColor.rgb;
    alpha = uFlatColor.a * a * (amt <= 0.001 ? 0.0 : 1.0);
  } else {
    vec4 lut = texture2D(uLut, vec2(e, 0.5));
    col = lut.rgb;
    alpha = lut.a * a;
  }
  if (alpha < 0.001) discard;
  gl_FragColor = vec4(col * alpha, alpha);
}
`;

  const SHAPE_IDS = {
    circle: 0, oval: 0, pill: 1, squircle: 2, ngon: 3, star: 4, heart: 5,
    trapezoid: 6, diamond: 7, cross: 8, ring: 9, teardrop: 10, flower: 11,
  };

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
    const lutTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, lutTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const blank = new Uint8Array(256 * 4);
    for (let i = 0; i < 256; i += 1) {
      blank[i * 4] = 255;
      blank[i * 4 + 1] = 255;
      blank[i * 4 + 2] = 255;
      blank[i * 4 + 3] = 255;
    }
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, blank);
    shared = {
      rev: REV,
      gl,
      canvas: picture.canvas,
      quad: picture.quad,
      program,
      lutTex,
      lutKey: "",
      aPos: gl.getAttribLocation(program, "aPos"),
      u: {
        uResolution: gl.getUniformLocation(program, "uResolution"),
        uCenter: gl.getUniformLocation(program, "uCenter"),
        uHalf: gl.getUniformLocation(program, "uHalf"),
        uBlur: gl.getUniformLocation(program, "uBlur"),
        uShape: gl.getUniformLocation(program, "uShape"),
        uParam: gl.getUniformLocation(program, "uParam"),
        uAmount: gl.getUniformLocation(program, "uAmount"),
        uLut: gl.getUniformLocation(program, "uLut"),
        uFlat: gl.getUniformLocation(program, "uFlat"),
        uFlatColor: gl.getUniformLocation(program, "uFlatColor"),
      },
    };
    return shared;
  }

  function parseCssColor(css) {
    if (!css) return [1, 1, 1, 1];
    const s = String(css).trim();
    let m = /^#([0-9a-f]{6})$/i.exec(s);
    if (m) {
      const n = Number.parseInt(m[1], 16);
      return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, 1];
    }
    m = /^#([0-9a-f]{3})$/i.exec(s);
    if (m) {
      const h = m[1];
      const n = Number.parseInt(h[0] + h[0] + h[1] + h[1] + h[2] + h[2], 16);
      return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, 1];
    }
    m = /^rgba?\(([^)]+)\)$/i.exec(s);
    if (m) {
      const body = m[1].trim();
      let parts;
      if (body.includes(",")) {
        parts = body.split(",").map((x) => Number(x.trim()));
      } else {
        // Modern: rgb(R G B) or rgb(R G B / A)
        const slash = body.split("/");
        const rgb = slash[0].trim().split(/\s+/).map(Number);
        const a = slash.length > 1 ? Number(slash[1].trim()) : 1;
        parts = [rgb[0], rgb[1], rgb[2], a];
      }
      return [
        (parts[0] || 0) / 255,
        (parts[1] || 0) / 255,
        (parts[2] || 0) / 255,
        parts.length > 3 && Number.isFinite(parts[3]) ? parts[3] : 1,
      ];
    }
    return [1, 1, 1, 1];
  }

  function uploadLut(device, colorAt) {
    const gl = device.gl;
    const data = new Uint8Array(256 * 4);
    let key = "";
    for (let i = 0; i < 256; i += 1) {
      const b = i / 255;
      const css = colorAt(b);
      const rgba = parseCssColor(css);
      const o = i * 4;
      data[o] = Math.round(rgba[0] * 255);
      data[o + 1] = Math.round(rgba[1] * 255);
      data[o + 2] = Math.round(rgba[2] * 255);
      data[o + 3] = Math.round(rgba[3] * 255);
      if (i === 0 || i === 128 || i === 255) key += css + ";";
    }
    if (device.lutKey === key) return;
    device.lutKey = key;
    gl.bindTexture(gl.TEXTURE_2D, device.lutTex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
  }

  /**
   * Draw one SDF sprite into destCtx via shared picture device present.
   * @returns {boolean}
   */
  function draw(destCtx, cx, cy, rx, ry, blur01, shapeName, shapeParam, amount, colorAt, flat, flatCss, alpha01) {
    const device = getShared();
    if (!device || !destCtx) return false;
    const gl = device.gl;
    const dest = destCtx.canvas;
    const dw = Math.max(1, dest.width | 0);
    const dh = Math.max(1, dest.height | 0);
    const charR = Math.min(rx, ry);
    const b = Math.max(0, Math.min(1, Number(blur01) || 0));
    const b2 = b * b;
    const outer = charR * (1 + b2 * 1.65) + Math.max(1, 1.1 - b2);
    const extra = Math.max(0, outer - charR);
    const halfW = Math.ceil(rx + extra + 1.5);
    const halfH = Math.ceil(ry + extra + 1.5);
    const x0 = Math.max(0, Math.floor(cx - halfW));
    const y0 = Math.max(0, Math.floor(cy - halfH));
    const x1 = Math.min(dw, Math.ceil(cx + halfW));
    const y1 = Math.min(dh, Math.ceil(cy + halfH));
    const bw = Math.max(1, x1 - x0);
    const bh = Math.max(1, y1 - y0);

    // Render sprite into bottom-left scissor of shared canvas, then blit that rect.
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, bw, bh);
    gl.scissor(0, 0, bw, bh);
    gl.enable(gl.SCISSOR_TEST);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(device.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, device.quad);
    gl.enableVertexAttribArray(device.aPos);
    gl.vertexAttribPointer(device.aPos, 2, gl.FLOAT, false, 0, 0);

    const shapeId = SHAPE_IDS[String(shapeName || "circle").toLowerCase()] ?? 0;
    gl.uniform2f(device.u.uResolution, bw, bh);
    // Local centre inside the scissor rect
    gl.uniform2f(device.u.uCenter, cx - x0, (bh - 1) - (cy - y0)); // flip Y for GL
    gl.uniform2f(device.u.uHalf, Math.max(0.5, rx), Math.max(0.5, ry));
    gl.uniform1f(device.u.uBlur, b);
    gl.uniform1f(device.u.uShape, shapeId);
    gl.uniform1f(device.u.uParam, Math.max(0, Math.min(1, Number(shapeParam) || 0)));
    const amt = Math.max(0, Math.min(1, Number(amount)));
    gl.uniform1f(device.u.uAmount, Number.isFinite(amt) ? amt : 1);

    if (flat) {
      const rgba = parseCssColor(flatCss);
      gl.uniform1f(device.u.uFlat, 1);
      gl.uniform4f(device.u.uFlatColor, rgba[0], rgba[1], rgba[2], rgba[3]);
    } else {
      gl.uniform1f(device.u.uFlat, 0);
      uploadLut(device, colorAt || (() => "#ffffff"));
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, device.lutTex);
      gl.uniform1i(device.u.uLut, 0);
    }

    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.disable(gl.BLEND);
    gl.disable(gl.SCISSOR_TEST);

    const a = Math.max(0, Math.min(1, Number(alpha01)));
    const prev = destCtx.globalAlpha;
    destCtx.globalAlpha = prev * (Number.isFinite(a) ? a : 1);
    destCtx.imageSmoothingEnabled = true;
    try {
      const srcY = Math.max(0, device.canvas.height - bh);
      destCtx.drawImage(device.canvas, 0, srcY, bw, bh, x0, y0, bw, bh);
    } catch (_e) {
      destCtx.globalAlpha = prev;
      return false;
    }
    destCtx.globalAlpha = prev;
    return true;
  }

  global.TraceDotSpriteGl = {
    draw,
    available: () => Boolean(getShared()),
    shapeId: (name) => SHAPE_IDS[String(name || "circle").toLowerCase()] ?? 0,
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
