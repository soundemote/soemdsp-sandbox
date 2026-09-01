// Patch format migrations (Phase C of docs/HIGH_RISK_HIGH_REWARD_PLAN.md).
//
// Load order: after nodeGraphPatchFormat / module definitions, before
// validateNodeGraphPatch (node-graph-patch-core.js).
//
// Pipeline: raw load → migrateNodeGraphPatchToCurrent → validate/normalize.
// Migrators are pure functions: (patch) => patch. Each advances version by 1.

/** Current on-disk / in-memory format version (matches nodeGraphPatchFormat.version). */
function nodeGraphPatchCurrentFormatVersion() {
  if (typeof nodeGraphPatchFormat === "object" && nodeGraphPatchFormat) {
    const v = Number(nodeGraphPatchFormat.version);
    if (Number.isFinite(v)) {
      return v;
    }
  }
  return 2;
}

function nodeGraphPatchFormatKind() {
  if (typeof nodeGraphPatchFormat === "object" && nodeGraphPatchFormat?.kind) {
    return String(nodeGraphPatchFormat.kind);
  }
  return "soemdsp-sandbox-node-patch";
}

/**
 * Read format version from a patch. Missing format → 0 (pre-versioned / legacy).
 */
function nodeGraphPatchReadFormatVersion(patch) {
  if (!patch || typeof patch !== "object") {
    return 0;
  }
  if (patch.format === undefined || patch.format === null) {
    return 0;
  }
  const v = Number(patch.format.version);
  return Number.isFinite(v) ? v : 0;
}

/**
 * Legacy phosphorLight module → scope2d (ports stay X/Y).
 * Kept here so all shape migrations live in one pipeline.
 */
function nodeGraphPatchMigratePhosphorLightNodes(patch) {
  if (!patch || !Array.isArray(patch.nodes)) {
    return patch;
  }
  let changed = false;
  const nodes = patch.nodes.map((node) => {
    if (!node || String(node.type || "").trim() !== "phosphorLight") {
      return node;
    }
    changed = true;
    if (typeof migrateNodeGraphPhosphorLightToScope2d === "function") {
      return migrateNodeGraphPhosphorLightToScope2d(node);
    }
    const src = node.traceDisplaySettings && typeof node.traceDisplaySettings === "object"
      ? node.traceDisplaySettings
      : {};
    return {
      ...node,
      type: "scope2d",
      traceDisplaySettings: {
        ...src,
        background: src.background ?? src.backgroundColor,
        decay: src.decay,
        scale: src.scale,
        dot1Size: src.dot1Size,
        lineThickness: src.lineThickness ?? src.dot1Blur,
        pixelDensity: src.pixelDensity,
        dot1Color: src.dot1Color ?? src.color,
        dot1Brightness: src.dot1Brightness ?? src.brightness,
      },
    };
  });
  return changed ? { ...patch, nodes } : patch;
}

/**
 * SinCos4 (sineWavetable): drop retired Amplitude CV jack wires.
 */
function nodeGraphPatchMigrateSineWavetableDropAmplitudeJack(patch) {
  if (!patch || !Array.isArray(patch.connections) || !Array.isArray(patch.nodes)) {
    return patch;
  }
  const sincosIds = new Set(
    patch.nodes
      .filter((node) => {
        const type = node && String(node.type || "").trim();
        return type === "sineWavetable" || type === "sinCos";
      })
      .map((node) => String(node.id || "").trim())
      .filter(Boolean),
  );
  if (!sincosIds.size) {
    return patch;
  }
  let changed = false;
  const connections = patch.connections.filter((connection) => {
    if (!connection || typeof connection !== "object") {
      return true;
    }
    const dest = String(connection.destinationNode || "").trim();
    const port = String(connection.destinationPort || "").trim();
    if (sincosIds.has(dest) && (port === "Amplitude" || port === "amplitude")) {
      changed = true;
      return false;
    }
    return true;
  });
  return changed ? { ...patch, connections } : patch;
}

/**
 * Butterworth Filter (additiveAnalogFilter) Slope: old 0…1 → dB/oct.
 * Linear Filter keeps 0…1; if it was wrongly migrated to dB (>1), map back.
 */
function nodeGraphPatchMigrateAdditiveFilterSlopeToDbOct(patch) {
  if (!patch || !Array.isArray(patch.nodes)) {
    return patch;
  }
  let changed = false;
  const nodes = patch.nodes.map((node) => {
    const type = node && String(node.type || "").trim();
    if (type !== "additiveLinearFilter" && type !== "additiveAnalogFilter") {
      return node;
    }
    const bump = (bag) => {
      if (!bag || bag.slope == null) return bag;
      const n = Number(bag.slope);
      if (!Number.isFinite(n)) return bag;
      if (type === "additiveAnalogFilter") {
        if (n > 1) return bag; // already dB/oct
        changed = true;
        const db = n <= 0 ? 96 : Math.max(6, Math.min(96, 6 / n));
        return { ...bag, slope: db };
      }
      // Linear: 0…1 rational slope. Undo mistaken dB values.
      if (n > 1) {
        changed = true;
        return { ...bag, slope: Math.max(0, Math.min(1, 6 / n)) };
      }
      return bag;
    };
    const next = { ...node };
    if (node.params && typeof node.params === "object") {
      next.params = bump({ ...node.params });
    }
    if (node.parameters && typeof node.parameters === "object") {
      next.parameters = bump({ ...node.parameters });
    }
    return next;
  });
  return changed ? { ...patch, nodes } : patch;
}

/**
 * NoisyFreq Amount (0…1, hidden ×0.5) → Add (ratio add DOMAIN).
 * add = amount * 0.5 so existing patches keep the same depth.
 */
function nodeGraphPatchMigrateNoisyFreqAmountToAdd(patch) {
  if (!patch || !Array.isArray(patch.nodes)) {
    return patch;
  }
  let changed = false;
  const nodes = patch.nodes.map((node) => {
    if (!node || String(node.type || "").trim() !== "additiveNoisyFreq") {
      return node;
    }
    const params = node.params && typeof node.params === "object" ? { ...node.params } : {};
    const parameters = node.parameters && typeof node.parameters === "object"
      ? { ...node.parameters }
      : null;
    const hasAdd = (params.add != null && Number.isFinite(Number(params.add)))
      || (parameters && parameters.add != null && Number.isFinite(Number(parameters.add)));
    if (hasAdd) return node;
    const src = params.amount != null ? params : parameters;
    if (!src || src.amount == null) return node;
    const n = Number(src.amount);
    if (!Number.isFinite(n)) return node;
    changed = true;
    const add = n * 0.5;
    const next = { ...node };
    if (params.amount != null || Object.keys(params).length) {
      const p = { ...params, add };
      delete p.amount;
      next.params = p;
    }
    if (parameters && (parameters.amount != null || parameters.add == null)) {
      const p = { ...parameters, add };
      delete p.amount;
      next.parameters = p;
    }
    return next;
  });
  return changed ? { ...patch, nodes } : patch;
}

/**
 * NoisyPhase / NoisyPan / NoisyAmp: Amount → Add.
 * Phase/Amp had a hidden ×0.5 in DSP — migrate add = amount * 0.5 to keep depth.
 * Pan had no hidden scale — add = amount.
 */
/**
 * Additive Generator waveforms → compact set:
 * 0 SawSquare, 1 PulseCenter, 2 PulseLeft, 3 PulseRight, 4 Triangle, 5 RectifiedSine.
 * Stamp `_wfBasic` version 3.
 */
function nodeGraphPatchMigrateAdditiveGeneratorWaveformsBasic(patch) {
  if (!patch || !Array.isArray(patch.nodes)) return patch;
  // Original exotic 0…16 → v2 basic (Saw/Sq/Tri/SawSq/Pulse/PL/PR/Rect)
  const fromExoticToV2 = [
    0, 3, 0, 0, 3, 3, 4, 5, 6, 4, 4, 1, 2, 2, 7, 7, 0,
  ];
  // v1 was: 0 Sine, 1 Saw, 2 Sq, 3 Tri, 4 SawSq, 5 Pulse, 6 PL, 7 PR
  // v2 was: 0 Saw, 1 Sq, 2 Tri, 3 SawSq, 4 Pulse, 5 PL, 6 PR, 7 Rect
  const fromBasicV1ToV2 = [0, 0, 1, 2, 3, 4, 5, 6];
  // v2 → v3: keep SawSquare/Pulse*/Tri/Rect; map pure Saw→SawSquare@1, Square→SawSquare@0
  const fromV2ToV3 = [0, 0, 4, 0, 1, 2, 3, 5];
  let changed = false;
  const nodes = patch.nodes.map((node) => {
    if (!node || String(node.type || "").trim() !== "additiveGenerator") return node;
    const params = node.params && typeof node.params === "object" ? { ...node.params } : {};
    const parameters = node.parameters && typeof node.parameters === "object"
      ? { ...node.parameters }
      : null;
    const stamp = Number(params._wfBasic ?? parameters?._wfBasic) || 0;
    if (stamp >= 4) return node;
    // Already on v4 (Saw/Square/Pulse*/Tri/RectSine + PWM) — just stamp.
    if (
      stamp === 0
      && (
        (params.pwm != null && Number.isFinite(Number(params.pwm)))
        || (parameters && parameters.pwm != null && Number.isFinite(Number(parameters.pwm)))
      )
    ) {
      changed = true;
      const stampV4 = (obj) => (obj ? { ...obj, _wfBasic: 4 } : obj);
      return {
        ...node,
        params: stampV4(params) || { _wfBasic: 4 },
        ...(parameters ? { parameters: stampV4(parameters) } : {}),
      };
    }
    if (stamp >= 3) return node;
    const src = params.waveform != null ? params : parameters;
    const raw = src && src.waveform != null ? Number(src.waveform) : 0;
    const n = Math.round(Number.isFinite(raw) ? raw : 0);
    let v2 = 0;
    if (stamp === 2) {
      v2 = n;
    } else if (stamp === 1) {
      v2 = (n >= 0 && n < fromBasicV1ToV2.length) ? fromBasicV1ToV2[n] : 0;
    } else if (n >= 0 && n < fromExoticToV2.length) {
      v2 = fromExoticToV2[n];
    } else {
      v2 = 0;
    }
    const nextWf = (v2 >= 0 && v2 < fromV2ToV3.length) ? fromV2ToV3[v2] : 0;
    // Pure Saw (v2=0) → morph 0 (bipolar center saw); Square (v2=1) → morph −1.
    let nextMorph = null;
    if (stamp < 3 && (v2 === 0 || v2 === 1)) {
      nextMorph = v2 === 0 ? 0 : -1;
    }
    changed = true;
    const apply = (obj) => {
      if (!obj) return null;
      const out = { ...obj, waveform: nextWf, _wfBasic: 3 };
      if (nextMorph != null && (out.morph == null || stamp < 3)) {
        // Only force morph when migrating from dedicated Saw/Square entries.
        if (v2 === 0 || v2 === 1) out.morph = nextMorph;
      }
      return out;
    };
    const next = { ...node };
    if (Object.keys(params).length || params.waveform != null) {
      next.params = apply(params) || { waveform: nextWf, _wfBasic: 3 };
    }
    if (parameters) next.parameters = apply(parameters);
    return next;
  });
  return changed ? { ...patch, nodes } : patch;
}

// v3 SawSquare / Pulse* / Tri / Rect + Morph → v4 Saw / Square / Pulse* / Tri / RectSine + PWM.
// SawSquare @ |morph|≥0.5 → Square; else Saw. morph → pwm (Pulse* keep duty).
// (Keep as // comments: a block comment cannot contain the sequence star-slash.)
function nodeGraphPatchMigrateAdditiveGeneratorWaveformsPwm(patch) {
  if (!patch || !Array.isArray(patch.nodes)) return patch;
  // v3: 0 SawSquare, 1 PulseCenter, 2 PulseLeft, 3 PulseRight, 4 Triangle, 5 RectifiedSine
  // v4: 0 Saw, 1 Square, 2 PulseCenter, 3 PulseLeft, 4 PulseRight, 5 Tri, 6 RectSine
  let changed = false;
  const nodes = patch.nodes.map((node) => {
    if (!node || String(node.type || "").trim() !== "additiveGenerator") return node;
    const params = node.params && typeof node.params === "object" ? { ...node.params } : {};
    const parameters = node.parameters && typeof node.parameters === "object"
      ? { ...node.parameters }
      : null;
    const stamp = Number(params._wfBasic ?? parameters?._wfBasic) || 0;
    if (stamp >= 4) return node;
    if (stamp < 3) return node; // WaveformsBasic runs first

    const apply = (obj) => {
      if (!obj) return null;
      const out = { ...obj, _wfBasic: 4 };
      const wf = Math.round(Number(out.waveform) || 0);
      const morphRaw = out.pwm != null ? out.pwm : out.morph;
      const morph = Number(morphRaw);
      const m = Number.isFinite(morph) ? morph : 0;
      let nextWf = 0;
      if (wf === 0) {
        nextWf = Math.abs(m) >= 0.5 ? 1 : 0; // Square : Saw
      } else if (wf === 1) nextWf = 2;
      else if (wf === 2) nextWf = 3;
      else if (wf === 3) nextWf = 4;
      else if (wf === 4) nextWf = 5;
      else if (wf === 5) nextWf = 6;
      else nextWf = Math.max(0, Math.min(6, wf));
      out.waveform = nextWf;
      // Pulse* keep duty as PWM; non-pulse reset to 0.
      const isPulse = nextWf === 2 || nextWf === 3 || nextWf === 4;
      out.pwm = isPulse ? m : 0;
      delete out.morph;
      return out;
    };

    changed = true;
    const next = { ...node };
    next.params = apply(params) || { waveform: 0, pwm: 0, _wfBasic: 4 };
    if (parameters) next.parameters = apply(parameters);
    return next;
  });
  return changed ? { ...patch, nodes } : patch;
}

/**
 * Growl/Bubble Harmonic Reducer → Cutoff (inverted): old 0=full → cutoff 1; old 1=mute → 0.
 */
function nodeGraphPatchMigrateGrowlHarmonicReduceToCutoff(patch) {
  if (!patch || !Array.isArray(patch.nodes)) return patch;
  let changed = false;
  const nodes = patch.nodes.map((node) => {
    const type = node && String(node.type || "").trim();
    if (type !== "additiveGrowl" && type !== "additiveBubble") return node;
    const params = node.params && typeof node.params === "object" ? { ...node.params } : {};
    const parameters = node.parameters && typeof node.parameters === "object"
      ? { ...node.parameters }
      : null;
    const hasCutoff = (params.cutoff != null && Number.isFinite(Number(params.cutoff)))
      || (parameters && parameters.cutoff != null && Number.isFinite(Number(parameters.cutoff)));
    if (hasCutoff) {
      // Drop legacy key if both somehow exist.
      if (params.harmonicReduce == null && !(parameters && parameters.harmonicReduce != null)) {
        return node;
      }
      changed = true;
      const next = { ...node };
      if (params.harmonicReduce != null) {
        delete params.harmonicReduce;
        next.params = params;
      }
      if (parameters && parameters.harmonicReduce != null) {
        const p2 = { ...parameters };
        delete p2.harmonicReduce;
        next.parameters = p2;
      }
      return next;
    }
    const src = params.harmonicReduce != null ? params : parameters;
    if (!src || src.harmonicReduce == null) return node;
    const n = Number(src.harmonicReduce);
    if (!Number.isFinite(n)) return node;
    changed = true;
    const cutoff = Math.max(0, Math.min(1, 1 - n));
    const apply = (obj) => {
      if (!obj) return null;
      const out = { ...obj, cutoff };
      delete out.harmonicReduce;
      return out;
    };
    const next = { ...node };
    if (Object.keys(params).length || params.harmonicReduce != null) {
      next.params = apply(params) || { cutoff };
    }
    if (parameters) next.parameters = apply(parameters);
    return next;
  });
  return changed ? { ...patch, nodes } : patch;
}

/** additiveFrequencyMath / additiveHarmonicMath → additiveQuantizeFreq. */
function nodeGraphPatchMigrateToQuantizeFreq(patch) {
  if (!patch || !Array.isArray(patch.nodes)) return patch;
  let changed = false;
  const nodes = patch.nodes.map((node) => {
    const type = node && String(node.type || "").trim();
    if (type !== "additiveFrequencyMath" && type !== "additiveHarmonicMath") return node;
    changed = true;
    const params = node.params && typeof node.params === "object" ? { ...node.params } : {};
    const parameters = node.parameters && typeof node.parameters === "object"
      ? { ...node.parameters }
      : null;
    const mapParams = (obj) => {
      if (!obj) return obj;
      const next = { ...obj };
      if (next.quantizeFreq == null && next.quantize != null) {
        next.quantizeFreq = next.quantize;
      }
      if (next.randomFreqAmount == null) next.randomFreqAmount = 0;
      if (next.seed == null) next.seed = 1;
      delete next.multiplyDivide;
      delete next.addSubtract;
      delete next.smoothing;
      delete next.smoothStyle;
      delete next.mulDiv;
      delete next.addSub;
      delete next.quantize;
      return next;
    };
    const out = { ...node, type: "additiveQuantizeFreq", params: mapParams(params) };
    if (parameters) out.parameters = mapParams(parameters);
    return out;
  });
  return changed ? { ...patch, nodes } : patch;
}

/**
 * FrequencyMath: drop Mul/Div & Add/Sub choices; bipolar MultiplyDivide / AddSubtract.
 * Old factor 1…24 + mode → m = ±log2(factor). Stamps _freqMathBipolar.
 */
function nodeGraphPatchMigrateFrequencyMathBipolar(patch) {
  if (!patch || !Array.isArray(patch.nodes)) return patch;
  let changed = false;
  const nodes = patch.nodes.map((node) => {
    const type = node && String(node.type || "").trim();
    if (
      type !== "additiveFrequencyMath"
      && type !== "additiveHarmonicMath"
      && type !== "additiveQuantizeFreq"
    ) return node;
    const params = node.params && typeof node.params === "object" ? { ...node.params } : {};
    const parameters = node.parameters && typeof node.parameters === "object"
      ? { ...node.parameters }
      : null;
    const stamp = Number(params._freqMathBipolar ?? parameters?._freqMathBipolar) || 0;
    if (stamp >= 1) return node;
    const apply = (obj) => {
      if (!obj) return null;
      const out = { ...obj, _freqMathBipolar: 1 };
      const factor = Number(out.multiplyDivide);
      const divide = Math.round(Number(out.mulDiv) || 0) === 1;
      const subtract = Math.round(Number(out.addSub) || 0) === 1;
      if (Number.isFinite(factor) && factor > 0) {
        // Legacy unipolar factor 1…24 (or already bipolar −1…1).
        if (factor > 1 + 1e-9 || (divide && factor >= 1 - 1e-9)) {
          let m = Math.log2(Math.max(1e-12, factor));
          if (divide) m = -m;
          // Leave m unclamped — param min/max on the module own the face range.
          out.multiplyDivide = m;
        } else if (factor >= 1 - 1e-9 && factor <= 1 + 1e-9 && !divide) {
          out.multiplyDivide = 0;
        }
      } else if (!Number.isFinite(Number(out.multiplyDivide))) {
        out.multiplyDivide = 0;
      }
      const add = Number(out.addSubtract);
      if (Number.isFinite(add)) {
        out.addSubtract = subtract ? -Math.abs(add) : add;
      } else {
        out.addSubtract = 0;
      }
      delete out.mulDiv;
      delete out.addSub;
      return out;
    };
    changed = true;
    const next = { ...node };
    next.params = apply(params) || { multiplyDivide: 0, addSubtract: 0, _freqMathBipolar: 1 };
    if (parameters) next.parameters = apply(parameters);
    if (next.paramMeta && typeof next.paramMeta === "object") {
      const meta = { ...next.paramMeta };
      delete meta.mulDiv;
      delete meta.addSub;
      if (meta.multiplyDivide && typeof meta.multiplyDivide === "object") {
        meta.multiplyDivide = {
          ...meta.multiplyDivide,
          min: -1,
          max: 1,
          mid: 0,
          def: 0,
          choices: [],
          unit: "multiply",
        };
      }
      if (meta.addSubtract && typeof meta.addSubtract === "object") {
        meta.addSubtract = {
          ...meta.addSubtract,
          min: -10000,
          max: 10000,
          mid: 0,
          def: 0,
          choices: [],
        };
      }
      next.paramMeta = meta;
    }
    return next;
  });
  return changed ? { ...patch, nodes } : patch;
}

/**
 * FrequencySkew Curve: old Rational/Exp/Log (0/1/2) → Exp/Rational/Log (0/1/2).
 * Remaps Rational 0→1, Exp 1→0, Log 2→2. Stamps _freqSkewCurve.
 */
function nodeGraphPatchMigrateFrequencySkewCurveExpRational(patch) {
  if (!patch || !Array.isArray(patch.nodes)) return patch;
  let changed = false;
  const nodes = patch.nodes.map((node) => {
    const type = node && String(node.type || "").trim();
    if (type !== "additiveFrequencySkew" && type !== "additiveFrequencySlope") return node;
    const params = node.params && typeof node.params === "object" ? { ...node.params } : {};
    const parameters = node.parameters && typeof node.parameters === "object"
      ? { ...node.parameters }
      : null;
    const stamp = Number(params._freqSkewCurve ?? parameters?._freqSkewCurve) || 0;
    if (stamp >= 1) return node;
    const apply = (obj) => {
      if (!obj) return null;
      const out = { ...obj, _freqSkewCurve: 1 };
      const raw = out.curve != null ? Number(out.curve) : 0;
      const old = Number.isFinite(raw) ? Math.round(raw) : 0;
      // Old: 0 Rational, 1 Exp, 2 Log → New: 0 Exp, 1 Rational, 2 Log
      if (old === 0) out.curve = 1;
      else if (old === 1) out.curve = 0;
      else out.curve = 2; // Log stays Log (new index 2)
      return out;
    };
    changed = true;
    const next = { ...node };
    next.params = apply(params) || { curve: 0, _freqSkewCurve: 1 };
    if (parameters) next.parameters = apply(parameters);
    return next;
  });
  return changed ? { ...patch, nodes } : patch;
}

/**
 * PolyBLEP Morph 0…1 → bipolar −1…+1 (0 = center).
 * Old 0.5 (PWM center / trisaw mid) → 0; old 0→−1; old 1→+1.
 */
function nodeGraphPatchMigratePolyBlepMorphBipolar(patch) {
  if (!patch || !Array.isArray(patch.nodes)) return patch;
  let changed = false;
  const nodes = patch.nodes.map((node) => {
    if (!node || String(node.type || "").trim() !== "polyBlep") return node;
    const params = node.params && typeof node.params === "object" ? { ...node.params } : {};
    const parameters = node.parameters && typeof node.parameters === "object"
      ? { ...node.parameters }
      : null;
    const stamp = Number(params._polyMorphBipolar ?? parameters?._polyMorphBipolar) || 0;
    if (stamp >= 1) return node;
    const apply = (obj) => {
      if (!obj) return null;
      const out = { ...obj, _polyMorphBipolar: 1 };
      if (out.morph == null || !Number.isFinite(Number(out.morph))) {
        out.morph = 0;
        return out;
      }
      const m = Number(out.morph);
      // Already bipolar (outside old 0…1) — just stamp.
      if (m < -1e-9 || m > 1 + 1e-9) return out;
      out.morph = 2 * m - 1;
      return out;
    };
    changed = true;
    const next = { ...node };
    next.params = apply(params) || { morph: 0, _polyMorphBipolar: 1 };
    if (parameters) next.parameters = apply(parameters);
    return next;
  });
  return changed ? { ...patch, nodes } : patch;
}

/**
 * Move Phase Rotation from Additive Out back onto the upstream Additive Generator.
 * Walks Graph wires through Yellow Graph effects. Clears Out.phaseRotation.
 */
function nodeGraphPatchMigratePhaseRotationOutToGenerator(patch) {
  if (!patch || !Array.isArray(patch.nodes)) return patch;
  const nodes = patch.nodes.slice();
  const byId = new Map();
  for (let i = 0; i < nodes.length; i += 1) {
    const n = nodes[i];
    if (n && n.id != null) byId.set(String(n.id), { node: n, index: i });
  }
  const conns = Array.isArray(patch.connections) ? patch.connections : [];
  const graphSrc = (dstId) => {
    const want = String(dstId);
    for (let i = 0; i < conns.length; i += 1) {
      const c = conns[i];
      if (!c) continue;
      if (String(c.destinationNode) !== want) continue;
      if (String(c.destinationPort || "Graph") !== "Graph") continue;
      return String(c.sourceNode || "");
    }
    return "";
  };
  const findGenerator = (startId) => {
    let id = String(startId || "");
    const seen = new Set();
    while (id && !seen.has(id)) {
      seen.add(id);
      const hit = byId.get(id);
      if (!hit) return null;
      if (String(hit.node.type || "").trim() === "additiveGenerator") return hit;
      id = graphSrc(id);
    }
    return null;
  };
  let changed = false;
  for (let i = 0; i < nodes.length; i += 1) {
    const node = nodes[i];
    if (!node || String(node.type || "").trim() !== "additiveOut") continue;
    const params = node.params && typeof node.params === "object" ? { ...node.params } : {};
    const parameters = node.parameters && typeof node.parameters === "object"
      ? { ...node.parameters }
      : null;
    const raw = params.phaseRotation != null ? params.phaseRotation
      : (parameters && parameters.phaseRotation != null ? parameters.phaseRotation : null);
    if (raw == null) continue;
    const rot = Number(raw);
    changed = true;
    delete params.phaseRotation;
    if (parameters) delete parameters.phaseRotation;
    nodes[i] = {
      ...node,
      params,
      ...(parameters ? { parameters } : {}),
    };
    if (!Number.isFinite(rot)) continue;
    const genHit = findGenerator(node.id);
    if (!genHit) continue;
    const gen = { ...genHit.node };
    const gp = gen.params && typeof gen.params === "object" ? { ...gen.params } : {};
    const gparams = gen.parameters && typeof gen.parameters === "object"
      ? { ...gen.parameters }
      : null;
    // Prefer Out value when moving back (Generator may still have a stale 0).
    gp.phaseRotation = rot;
    if (gparams) gparams.phaseRotation = rot;
    gen.params = gp;
    if (gparams) gen.parameters = gparams;
    nodes[genHit.index] = gen;
    byId.set(String(gen.id), { node: gen, index: genHit.index });
  }
  return changed ? { ...patch, nodes } : patch;
}

/**
 * Additive Generator Morph 0…1 → bipolar −1…+1 (0 = unmorphed).
 * SawSquare: old 0=sq…1=saw → new m−1 (sq at −1, saw at 0).
 * Pulse* / others: old 0.5 center → 2m−1.
 */
function nodeGraphPatchMigrateAdditiveGeneratorMorphBipolar(patch) {
  if (!patch || !Array.isArray(patch.nodes)) return patch;
  let changed = false;
  const nodes = patch.nodes.map((node) => {
    if (!node || String(node.type || "").trim() !== "additiveGenerator") return node;
    const params = node.params && typeof node.params === "object" ? { ...node.params } : {};
    const parameters = node.parameters && typeof node.parameters === "object"
      ? { ...node.parameters }
      : null;
    const stamp = Number(params._morphBipolar ?? parameters?._morphBipolar) || 0;
    if (stamp >= 1) return node;
    const apply = (obj) => {
      if (!obj) return null;
      const out = { ...obj, _morphBipolar: 1 };
      if (out.morph == null || !Number.isFinite(Number(out.morph))) {
        out.morph = 0;
        return out;
      }
      const m = Number(out.morph);
      // Already looks bipolar (outside old 0…1) — just stamp.
      if (m < -1e-9 || m > 1 + 1e-9) return out;
      const wf = Math.round(Number(out.waveform) || 0);
      if (wf === 0) {
        // SawSquare unipolar → prefer negative half: 0→−1 (sq), 1→0 (saw).
        out.morph = m - 1;
      } else {
        out.morph = 2 * m - 1;
      }
      return out;
    };
    changed = true;
    const next = { ...node };
    next.params = apply(params) || { morph: 0, _morphBipolar: 1 };
    if (parameters) next.parameters = apply(parameters);
    return next;
  });
  return changed ? { ...patch, nodes } : patch;
}

/** additiveGrowl → additiveBubble (UI rename; wires use node ids, stay valid). */
function nodeGraphPatchMigrateGrowlToBubble(patch) {
  if (!patch || !Array.isArray(patch.nodes)) return patch;
  let changed = false;
  const nodes = patch.nodes.map((node) => {
    if (!node || String(node.type || "").trim() !== "additiveGrowl") return node;
    changed = true;
    return { ...node, type: "additiveBubble" };
  });
  return changed ? { ...patch, nodes } : patch;
}

/**
 * Bubble slim: drop Rotation / Rational / Linear (Cutoff restored later).
 * Curve UI was 0 Rat / 1 Exp / 2 Log / 3 Lin → 0 Exp / 1 Log.
 * Stamp 2: restore Cutoff default 1 if slim-1 stripped it.
 */
function nodeGraphPatchMigrateBubbleSlimParams(patch) {
  if (!patch || !Array.isArray(patch.nodes)) return patch;
  let changed = false;
  const nodes = patch.nodes.map((node) => {
    const type = node && String(node.type || "").trim();
    if (type !== "additiveBubble" && type !== "additiveGrowl") return node;
    const params = node.params && typeof node.params === "object" ? { ...node.params } : {};
    const parameters = node.parameters && typeof node.parameters === "object"
      ? { ...node.parameters }
      : null;
    const stamp = Number(params._bubbleSlim ?? parameters?._bubbleSlim) || 0;
    if (stamp >= 2) return node;
    const apply = (obj) => {
      if (!obj) return null;
      const next = { ...obj, _bubbleSlim: 2 };
      if (stamp < 1) {
        const old = Math.round(Number(next.skewCurveMode) || 0);
        // Old: 0 Rat, 1 Exp, 2 Log, 3 Lin → New: 0 Exp, 1 Log
        if (old === 1) next.skewCurveMode = 0;
        else if (old === 2) next.skewCurveMode = 1;
        else next.skewCurveMode = 0; // Rational / Linear / unknown → Exp
        delete next.phaseRotation;
        delete next.harmonicReduce;
        delete next.dampen;
        delete next.cutoffBrickwall;
      }
      // Cutoff is back (Generator-style count). Default open if missing.
      if (!(Number.isFinite(Number(next.cutoff)))) next.cutoff = 1;
      return next;
    };
    changed = true;
    const out = { ...node, params: apply(params) || { skewCurveMode: 0, cutoff: 1, _bubbleSlim: 2 } };
    if (parameters) out.parameters = apply(parameters);
    if (out.paramMeta && typeof out.paramMeta === "object") {
      const meta = { ...out.paramMeta };
      delete meta.phaseRotation;
      if (meta.skewCurveMode && typeof meta.skewCurveMode === "object") {
        meta.skewCurveMode = {
          ...meta.skewCurveMode,
          choices: ["Exponential", "Logarithmic"],
          min: 0,
          max: 1,
          mid: 0,
          def: 0,
        };
      }
      out.paramMeta = meta;
    }
    return out;
  });
  return changed ? { ...patch, nodes } : patch;
}

/**
 * additiveCurveEnvelope → curveEnvelopeMod; additivePluckEnvelope → pluckEnvelopeMod.
 * Display rename only at the type-id layer; params unchanged.
 */
function nodeGraphPatchMigrateAdditiveEnvelopeMods(patch) {
  if (!patch || !Array.isArray(patch.nodes)) return patch;
  const map = Object.freeze({
    additiveCurveEnvelope: "curveEnvelopeMod",
    additivePluckEnvelope: "pluckEnvelopeMod",
  });
  let changed = false;
  const nodes = patch.nodes.map((node) => {
    if (!node) return node;
    const type = String(node.type || "").trim();
    const nextType = map[type];
    if (!nextType) return node;
    changed = true;
    return { ...node, type: nextType };
  });
  return changed ? { ...patch, nodes } : patch;
}

/**
 * additiveFrequencySlope → additiveFrequencySkew.
 * Drops Scale; seeds Low/High Stretch (1…24) from old Scale sign when missing.
 */
function nodeGraphPatchMigrateFrequencySlopeToSkew(patch) {
  if (!patch || !Array.isArray(patch.nodes)) return patch;
  let changed = false;
  const nodes = patch.nodes.map((node) => {
    if (!node || String(node.type || "").trim() !== "additiveFrequencySlope") return node;
    changed = true;
    const params = node.params && typeof node.params === "object" ? { ...node.params } : {};
    const parameters = node.parameters && typeof node.parameters === "object"
      ? { ...node.parameters }
      : null;
    const seedStretch = (obj) => {
      if (!obj) return obj;
      const next = { ...obj };
      const scale = Number(next.scale);
      if (!(Number.isFinite(Number(next.lowStretch)))) {
        next.lowStretch = Number.isFinite(scale) && scale < 0 ? 1 + Math.abs(scale) * 23 : 1;
      }
      if (!(Number.isFinite(Number(next.highStretch)))) {
        next.highStretch = Number.isFinite(scale) && scale > 0 ? 1 + Math.abs(scale) * 23 : 1;
      }
      delete next.scale;
      return next;
    };
    const next = { ...node, type: "additiveFrequencySkew", params: seedStretch(params) };
    if (parameters) next.parameters = seedStretch(parameters);
    return next;
  });
  return changed ? { ...patch, nodes } : patch;
}

/** Bubble: cutoffBrickwall → dampen (label rename; same 0…1 meaning). */
function nodeGraphPatchMigrateBubbleBrickwallToDampen(patch) {
  if (!patch || !Array.isArray(patch.nodes)) return patch;
  let changed = false;
  const nodes = patch.nodes.map((node) => {
    const type = node && String(node.type || "").trim();
    if (type !== "additiveBubble" && type !== "additiveGrowl") return node;
    const params = node.params && typeof node.params === "object" ? { ...node.params } : {};
    const parameters = node.parameters && typeof node.parameters === "object"
      ? { ...node.parameters }
      : null;
    const hasDampen = (params.dampen != null && Number.isFinite(Number(params.dampen)))
      || (parameters && parameters.dampen != null && Number.isFinite(Number(parameters.dampen)));
    const apply = (obj) => {
      if (!obj || obj.cutoffBrickwall == null) return obj;
      const next = { ...obj };
      if (!hasDampen && Number.isFinite(Number(next.cutoffBrickwall))) {
        next.dampen = next.cutoffBrickwall;
      }
      delete next.cutoffBrickwall;
      return next;
    };
    const nextParams = apply(params);
    const nextParameters = parameters ? apply(parameters) : null;
    if (nextParams === params && nextParameters === parameters) return node;
    if (
      (params.cutoffBrickwall == null)
      && !(parameters && parameters.cutoffBrickwall != null)
    ) {
      return node;
    }
    changed = true;
    const next = { ...node };
    if (Object.keys(params).length || params.cutoffBrickwall != null) {
      next.params = nextParams;
    }
    if (nextParameters) next.parameters = nextParameters;
    return next;
  });
  return changed ? { ...patch, nodes } : patch;
}

function nodeGraphPatchMigrateNoisyAmountToAdd(patch) {
  if (!patch || !Array.isArray(patch.nodes)) {
    return patch;
  }
  const scaleByType = {
    additiveNoisyPhase: 0.5,
    additiveNoisyPan: 1,
    additiveNoisyAmp: 0.5,
  };
  let changed = false;
  const nodes = patch.nodes.map((node) => {
    const type = node && String(node.type || "").trim();
    const scale = scaleByType[type];
    if (!(scale > 0)) return node;
    const params = node.params && typeof node.params === "object" ? { ...node.params } : {};
    const parameters = node.parameters && typeof node.parameters === "object"
      ? { ...node.parameters }
      : null;
    const hasAdd = (params.add != null && Number.isFinite(Number(params.add)))
      || (parameters && parameters.add != null && Number.isFinite(Number(parameters.add)));
    if (hasAdd) return node;
    const src = params.amount != null ? params : parameters;
    if (!src || src.amount == null) return node;
    const n = Number(src.amount);
    if (!Number.isFinite(n)) return node;
    changed = true;
    const add = n * scale;
    const next = { ...node };
    if (params.amount != null || Object.keys(params).length) {
      const p = { ...params, add };
      delete p.amount;
      next.params = p;
    }
    if (parameters && (parameters.amount != null || parameters.add == null)) {
      const p = { ...parameters, add };
      delete p.amount;
      next.parameters = p;
    }
    return next;
  });
  return changed ? { ...patch, nodes } : patch;
}

/**
 * Additive Linear / Analog Filter Cutoff was harmonic-index 0…1.
 * Now absolute Hz (kind frequency). Values in (0…1] remap → Hz via ×20000.
 */
function nodeGraphPatchMigrateAdditiveFilterCutoffToHz(patch) {
  if (!patch || !Array.isArray(patch.nodes)) {
    return patch;
  }
  let changed = false;
  const nodes = patch.nodes.map((node) => {
    const type = node && String(node.type || "").trim();
    if (type !== "additiveLinearFilter" && type !== "additiveAnalogFilter") {
      return node;
    }
    const params = node.params && typeof node.params === "object" ? { ...node.params } : {};
    const parameters = node.parameters && typeof node.parameters === "object"
      ? { ...node.parameters }
      : null;
    const src = params.cutoff != null ? params : parameters;
    if (!src || src.cutoff == null) return node;
    const n = Number(src.cutoff);
    if (!Number.isFinite(n) || n <= 0 || n > 1) return node;
    // Old normalized index → Hz (same span as Cutoff max).
    const hz = n * 20000;
    changed = true;
    const next = { ...node };
    if (params.cutoff != null) {
      next.params = { ...params, cutoff: hz };
    }
    if (parameters && parameters.cutoff != null) {
      next.parameters = { ...parameters, cutoff: hz };
    }
    return next;
  });
  return changed ? { ...patch, nodes } : patch;
}

/**
 * Output / Plugin Output Volume used to store 0…1 linear amplitude.
 * Stored value is now dB (DecibelsToAmplitude): DSP = 10^(dB/20), −∞ floor −140.
 * Old patches (kind not decibels, max ≤ 1, value in 0…1) are converted in place.
 */
function nodeGraphPatchMigrateOutputVolumeLinearToDb(patch) {
  if (!patch || !Array.isArray(patch.nodes)) {
    return patch;
  }
  let changed = false;
  const nodes = patch.nodes.map((node) => {
    if (!node || (node.type !== "output" && node.type !== "pluginOutput")) {
      return node;
    }
    const meta = node.paramMeta && typeof node.paramMeta === "object"
      ? node.paramMeta.volume
      : null;
    const kind = String(meta?.kind || "").trim().toLowerCase();
    if (kind === "decibels") {
      return node;
    }
    const max = Number(meta?.max);
    const value = Number(node.params?.volume);
    const rangeLooksLinear = !Number.isFinite(max) || max <= 1;
    const valueLooksLinear = Number.isFinite(value) && value >= 0 && value <= 1;
    if (!rangeLooksLinear || !valueLooksLinear) {
      return node;
    }
    changed = true;
    const db = value <= 0
      ? -140
      : (typeof nodeGraphOutputLinToVolumeDb === "function"
        ? nodeGraphOutputLinToVolumeDb(value)
        : 20 * Math.log10(value));
    const nextMeta = { ...(node.paramMeta || {}) };
    delete nextMeta.volume;
    return {
      ...node,
      paramMeta: nextMeta,
      params: { ...(node.params || {}), volume: db },
    };
  });
  return changed ? { ...patch, nodes } : patch;
}

/**
 * Mid/Side Mid Gain / Side Gain used to store 0…4 linear.
 * Stored value is now dB. Old patches (kind not decibels, max ≤ 4, value in 0…4)
 * convert in place: 1 → 0 dB, 2 → +6 dB.
 */
function nodeGraphPatchMigrateMidSideGainLinearToDb(patch) {
  if (!patch || !Array.isArray(patch.nodes)) {
    return patch;
  }
  let changed = false;
  const nodes = patch.nodes.map((node) => {
    if (!node || node.type !== "midSideEncode") {
      return node;
    }
    const metaBag = node.paramMeta && typeof node.paramMeta === "object" ? node.paramMeta : {};
    const nextParams = { ...(node.params || {}) };
    const nextMeta = { ...metaBag };
    let nodeChanged = false;
    for (const key of ["midGain", "sideGain"]) {
      const meta = metaBag[key];
      const kind = String(meta?.kind || "").trim().toLowerCase();
      if (kind === "decibels") {
        continue;
      }
      const max = Number(meta?.max);
      const value = Number(nextParams[key]);
      const rangeLooksLinear = !Number.isFinite(max) || max <= 4;
      const valueLooksLinear = Number.isFinite(value) && value >= 0 && value <= 4;
      if (!rangeLooksLinear || !valueLooksLinear) {
        continue;
      }
      nodeChanged = true;
      nextParams[key] = value <= 0 ? -24 : 20 * Math.log10(value);
      delete nextMeta[key];
    }
    if (!nodeChanged) {
      return node;
    }
    changed = true;
    return { ...node, params: nextParams, paramMeta: nextMeta };
  });
  return changed ? { ...patch, nodes } : patch;
}

/**
 * Module type + face field renames: valueSlider → knob.
 * Also migrates face property and displayType/mode schema keys when present.
 */
function nodeGraphPatchMigrateValueSliderToKnob(patch) {
  if (!patch || !Array.isArray(patch.nodes)) {
    return patch;
  }
  let changed = false;
  const nodes = patch.nodes.map((node) => {
    if (!node || typeof node !== "object") {
      return node;
    }
    let next = node;
    const type = String(node.type || "").trim();
    if (type === "valueSlider") {
      changed = true;
      next = { ...next, type: "knob" };
    }
    // Face art payload
    if (Object.prototype.hasOwnProperty.call(next, "valueSliderFace")) {
      changed = true;
      const face = next.valueSliderFace;
      next = { ...next, knobFace: face };
      delete next.valueSliderFace;
    }
    // Display mode keys stored on node (if any)
    if (next.displayMode === "valueSliderFace" || next.displayType === "valueSliderFace") {
      changed = true;
      next = {
        ...next,
        displayMode: next.displayMode === "valueSliderFace" ? "face" : next.displayMode,
        displayType: next.displayType === "valueSliderFace" ? "knobFace" : next.displayType,
      };
    }
    // Selected display mode object
    if (next.selectedDisplayMode && typeof next.selectedDisplayMode === "object") {
      const sdm = next.selectedDisplayMode;
      if (sdm.renderer === "valueSliderFace" || sdm.settingsSchema === "valueSliderFace" || sdm.key === "valueSliderFace") {
        changed = true;
        next = {
          ...next,
          selectedDisplayMode: {
            ...sdm,
            key: sdm.key === "valueSliderFace" ? "face" : sdm.key,
            renderer: sdm.renderer === "valueSliderFace" ? "knobFace" : sdm.renderer,
            settingsSchema: sdm.settingsSchema === "valueSliderFace" ? "knobFace" : sdm.settingsSchema,
          },
        };
      }
    }
    return next;
  });
  return changed ? { ...patch, nodes } : patch;
}

/**
 * 0 → 1: stamp explicit format; apply known module renames that predate versioning.
 */
function nodeGraphPatchMigrateV0ToV1(patch) {
  let next = nodeGraphPatchMigratePhosphorLightNodes(patch);
  return {
    ...next,
    format: {
      kind: nodeGraphPatchFormatKind(),
      version: 1,
    },
  };
}

/**
 * 1 → 2: valueSlider → knob (+ face field rename).
 */
function nodeGraphPatchMigrateV1ToV2(patch) {
  let next = nodeGraphPatchMigrateValueSliderToKnob(patch);
  next = nodeGraphPatchMigratePhosphorLightNodes(next);
  return {
    ...next,
    format: {
      kind: nodeGraphPatchFormatKind(),
      version: 2,
    },
  };
}

/**
 * Migrator table: index i migrates version i → i+1.
 */
const nodeGraphPatchMigrators = Object.freeze([
  nodeGraphPatchMigrateV0ToV1,
  nodeGraphPatchMigrateV1ToV2,
]);

/**
 * Migrate a patch to the current format version.
 * - Unknown future versions are left unchanged (validate will reject).
 * - Missing format is treated as version 0.
 * - Wrong kind is not rewritten here (validate throws).
 */
function migrateNodeGraphPatchToCurrent(patch) {
  if (!patch || typeof patch !== "object") {
    return patch;
  }
  const current = nodeGraphPatchCurrentFormatVersion();
  let version = nodeGraphPatchReadFormatVersion(patch);
  let next = patch;

  if (next.format && next.format.kind != null) {
    const kind = String(next.format.kind);
    if (kind && kind !== nodeGraphPatchFormatKind()) {
      return next;
    }
  }

  if (version > current) {
    return next;
  }

  while (version < current) {
    const migrator = nodeGraphPatchMigrators[version];
    if (typeof migrator !== "function") {
      break;
    }
    next = migrator(next) || next;
    version += 1;
  }

  if (version >= current) {
    next = {
      ...next,
      format: {
        kind: nodeGraphPatchFormatKind(),
        version: current,
      },
    };
    // Re-apply safe renames even on current-version patches (hand-edited JSON).
    next = nodeGraphPatchMigratePhosphorLightNodes(next);
    next = nodeGraphPatchMigrateValueSliderToKnob(next);
    next = nodeGraphPatchMigrateSineWavetableDropAmplitudeJack(next);
    next = nodeGraphPatchMigrateAdditiveFilterCutoffToHz(next);
    next = nodeGraphPatchMigrateAdditiveFilterSlopeToDbOct(next);
    next = nodeGraphPatchMigrateNoisyFreqAmountToAdd(next);
    next = nodeGraphPatchMigrateNoisyAmountToAdd(next);
    next = nodeGraphPatchMigrateAdditiveGeneratorWaveformsBasic(next);
    next = nodeGraphPatchMigrateAdditiveGeneratorMorphBipolar(next);
    next = nodeGraphPatchMigrateAdditiveGeneratorWaveformsPwm(next);
    next = nodeGraphPatchMigratePolyBlepMorphBipolar(next);
    next = nodeGraphPatchMigratePhaseRotationOutToGenerator(next);
    next = nodeGraphPatchMigrateGrowlHarmonicReduceToCutoff(next);
    next = nodeGraphPatchMigrateGrowlToBubble(next);
    next = nodeGraphPatchMigrateBubbleBrickwallToDampen(next);
    next = nodeGraphPatchMigrateBubbleSlimParams(next);
    next = nodeGraphPatchMigrateAdditiveEnvelopeMods(next);
    next = nodeGraphPatchMigrateFrequencySlopeToSkew(next);
    next = nodeGraphPatchMigrateFrequencySkewCurveExpRational(next);
    next = nodeGraphPatchMigrateFrequencyMathBipolar(next);
    next = nodeGraphPatchMigrateToQuantizeFreq(next);
    next = nodeGraphPatchMigrateOutputVolumeLinearToDb(next);
    next = nodeGraphPatchMigrateMidSideGainLinearToDb(next);
  }

  return next;
}
