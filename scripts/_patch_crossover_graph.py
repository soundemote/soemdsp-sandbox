# Wave remaining: crossover2..6 as graph types 103–107 (kChannels → 12).
from pathlib import Path

p = Path(__file__).resolve().parents[1] / "native_modules" / "graph_engine" / "graph_engine.cpp"
text = p.read_text(encoding="utf-8")
orig = text

EXTERN = """
extern "C" int soemdsp_crossover_create(int bandCount);
extern "C" void soemdsp_crossover_destroy(int handle);
extern "C" void soemdsp_crossover_sample(
  int handle,
  double mono,
  double leftIn,
  double rightIn,
  double f0,
  double f1,
  double f2,
  double f3,
  double f4,
  int lrOrder,
  double sampleRate
);
extern "C" double soemdsp_crossover_band_l(int handle, int bandIndex);
extern "C" double soemdsp_crossover_band_r(int handle, int bandIndex);
extern "C" int soemdsp_crossover_band_count(int handle);

"""

PROCESS = r"""
static bool is_crossover_type(int typeId) {
  return typeId >= kTypeCrossover2 && typeId <= kTypeCrossover6;
}

static int crossover_band_count_for_type(int typeId) {
  if (!is_crossover_type(typeId)) return 2;
  return 2 + (typeId - kTypeCrossover2);
}

// Stereo LR crossover: Mono+L/R in; per-band L/R on sequential ports
// (band0 L/R = 0/1, band1 L/R = 2/3, …). Splits: frequency,center,width,lpf,hpf.
// stages = LR order (2/4/8). Live ƒ overrides first split when wired.
static void process_crossover(Circuit& g, Node& node, int frames) {
  if (node.nativeHandle <= 0) return;
  mix_node_inputs(g, node, frames);
  const bool liveF = mix_live_port(g, node, kPortF, frames, g.mixF);
  const double sr = g.sampleRate < 1.0f ? 44100.0 : (double)g.sampleRate;
  const bool controlSmoothing = node_control_smoothing(node)
    || node.lpfFrequency.active || node.hpfFrequency.active;
  const int bands = crossover_band_count_for_type(node.typeId);
  const double amp = node.amplitude.out;
  for (int f = 0; f < frames; f++) {
    if (controlSmoothing) smoother_step_node(g, node);
    double f0 = liveF ? g.mixF[f] : node.frequency.out;
    double f1 = node.center.out;
    double f2 = node.width.out;
    double f3 = node.lpfFrequency.out;
    double f4 = node.hpfFrequency.out;
    if (!(f0 == f0) || f0 < 20.0) f0 = 20.0;
    if (!(f1 == f1) || f1 < 20.0) f1 = 20.0;
    if (!(f2 == f2) || f2 < 20.0) f2 = 20.0;
    if (!(f3 == f3) || f3 < 20.0) f3 = 20.0;
    if (!(f4 == f4) || f4 < 20.0) f4 = 20.0;
    int order = (int)(node.stages.out + (node.stages.out >= 0.0 ? 0.5 : -0.5));
    if (order <= 2) order = 2;
    else if (order <= 4) order = 4;
    else order = 8;
    soemdsp_crossover_sample(
      node.nativeHandle,
      g.mixMono[f], g.mixLeft[f], g.mixRight[f],
      f0, f1, f2, f3, f4, order, sr
    );
    for (int b = 0; b < bands; b++) {
      const int pl = b * 2;
      const int pr = pl + 1;
      if (pl < kChannels) {
        node.buf[pl][f] = soemdsp_crossover_band_l(node.nativeHandle, b) * amp;
      }
      if (pr < kChannels) {
        node.buf[pr][f] = soemdsp_crossover_band_r(node.nativeHandle, b) * amp;
      }
    }
  }
}

"""

# --- expand kChannels ---
old_ch = """// 0=Mono/Out, 1=Left/Mix L, 2=Right/Mix R, 3=Saw/Dry L, 4=Ramp/Dry R,
// 5=Square, 6=Tri, 7=Sine (polyBlep taps; Dry L/R share 3/4 on reverb).
static const int kChannels = 8;"""
new_ch = """// 0=Mono/Out, 1=Left/Mix L, 2=Right/Mix R, 3=Saw/Dry L, 4=Ramp/Dry R,
// 5=Square, 6=Tri, 7=Sine (polyBlep taps; Dry L/R share 3/4 on reverb).
// 8–11: extra band taps (crossover5/6).
static const int kChannels = 12;"""
if old_ch not in text:
    raise SystemExit("kChannels block not found")
text = text.replace(old_ch, new_ch, 1)

# --- type ids ---
old_types = "static const int kTypePhosphillator = 102;"
new_types = """static const int kTypePhosphillator = 102;
static const int kTypeCrossover2 = 103;
static const int kTypeCrossover3 = 104;
static const int kTypeCrossover4 = 105;
static const int kTypeCrossover5 = 106;
static const int kTypeCrossover6 = 107;"""
if old_types not in text:
    raise SystemExit("phosphillator type const not found")
text = text.replace(old_types, new_types, 1)

# --- externs before papoulis block ---
anchor = "// Param-chase Papoulis (Control smooth type Π)."
if EXTERN.strip() in text:
    print("externs already present")
elif anchor not in text:
    raise SystemExit("papoulis anchor missing")
else:
    text = text.replace(anchor, EXTERN + anchor, 1)

# --- process fn before process_mix_stereo ---
proc_anchor = "// mixStereo: true stereo summer (native already L/R). Mono + 4 pairs; R4 on aux port 21."
if "static void process_crossover(" in text:
    print("process_crossover already present")
elif proc_anchor not in text:
    raise SystemExit("process_mix_stereo anchor missing")
else:
    text = text.replace(proc_anchor, PROCESS + proc_anchor, 1)

# --- destroy ---
old_destroy = """  } else if (kind == kTypePhosphillator) {
    soemdsp_phosphillator_destroy(n.nativeHandle);
  }
  n.nativeHandle = 0;"""
new_destroy = """  } else if (kind == kTypePhosphillator) {
    soemdsp_phosphillator_destroy(n.nativeHandle);
  } else if (is_crossover_type(kind)) {
    soemdsp_crossover_destroy(n.nativeHandle);
  }
  n.nativeHandle = 0;"""
# is_crossover_type is defined later — can't use it in destroy which is earlier!
# Use inline range check instead.
new_destroy = """  } else if (kind == kTypePhosphillator) {
    soemdsp_phosphillator_destroy(n.nativeHandle);
  } else if (kind >= kTypeCrossover2 && kind <= kTypeCrossover6) {
    soemdsp_crossover_destroy(n.nativeHandle);
  }
  n.nativeHandle = 0;"""
if "kTypeCrossover2 && kind <= kTypeCrossover6" in text:
    print("destroy already patched")
elif old_destroy not in text:
    raise SystemExit("destroy phosphillator block missing")
else:
    text = text.replace(old_destroy, new_destroy, 1)

# --- create_native ---
old_create = """  if (typeId == kTypePhosphillator) {
    const int h = soemdsp_phosphillator_create();
    return h;
  }
  return 0;
}"""
new_create = """  if (typeId == kTypePhosphillator) {
    const int h = soemdsp_phosphillator_create();
    return h;
  }
  if (typeId >= kTypeCrossover2 && typeId <= kTypeCrossover6) {
    return soemdsp_crossover_create(2 + (typeId - kTypeCrossover2));
  }
  return 0;
}"""
if "soemdsp_crossover_create" in text and "2 + (typeId - kTypeCrossover2)" in text:
    print("create already patched")
elif old_create not in text:
    raise SystemExit("create phosphillator block missing")
else:
    text = text.replace(old_create, new_create, 1)

# --- needsNative ---
old_needs = """    || typeId == kTypeWirdoSpiral
    || typeId == kTypePhosphillator;
  // additiveOsc / ellipsoid are free-fn (no native handle)."""
new_needs = """    || typeId == kTypeWirdoSpiral
    || typeId == kTypePhosphillator
    || (typeId >= kTypeCrossover2 && typeId <= kTypeCrossover6);
  // additiveOsc / ellipsoid are free-fn (no native handle)."""
if old_needs not in text:
    raise SystemExit("needsNative block missing")
text = text.replace(old_needs, new_needs, 1)

# --- process dispatch ---
old_disp = """    if (node.typeId == kTypePhosphillator) {
      process_phosphillator(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypeReverbEffect) {"""
new_disp = """    if (node.typeId == kTypePhosphillator) {
      process_phosphillator(*g, node, frames);
      continue;
    }
    if (node.typeId >= kTypeCrossover2 && node.typeId <= kTypeCrossover6) {
      process_crossover(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypeReverbEffect) {"""
if "process_crossover(*g" in text:
    print("dispatch already patched")
elif old_disp not in text:
    raise SystemExit("dispatch phosphillator block missing")
else:
    text = text.replace(old_disp, new_disp, 1)

# --- defaults: frequency for crossover2 = 1000 already via filter path if we add types;
# better add dedicated branches for split defaults.

# frequency default: crossover2→1000, 3→300, 4→200, 5→150, 6→100
old_freq = """      : (typeId == kTypePhosphillator) ? 2.0
      : (typeId == kTypeBlubb || typeId == kTypeBoing || typeId == kTypeKeplerBouwkamp
          || typeId == kTypeMushroom || typeId == kTypeTorus
          || typeId == kTypeWirdoSpiral) ? 8.0
      : 220.0,"""
new_freq = """      : (typeId == kTypePhosphillator) ? 2.0
      : (typeId == kTypeBlubb || typeId == kTypeBoing || typeId == kTypeKeplerBouwkamp
          || typeId == kTypeMushroom || typeId == kTypeTorus
          || typeId == kTypeWirdoSpiral) ? 8.0
      : (typeId == kTypeCrossover2) ? 1000.0
      : (typeId == kTypeCrossover3) ? 300.0
      : (typeId == kTypeCrossover4) ? 200.0
      : (typeId == kTypeCrossover5) ? 150.0
      : (typeId == kTypeCrossover6) ? 100.0
      : 220.0,"""
if "kTypeCrossover2) ? 1000.0" in text:
    print("freq defaults already patched")
elif old_freq not in text:
    raise SystemExit("frequency defaults block missing")
else:
    text = text.replace(old_freq, new_freq, 1)

# stages default = 4 (LR order) for crossovers — fall through to ladder default 4
# Check what the final else for stages is:
# Looking at code: ends with `: 4.0` for ladder order typically

# center defaults for f1
old_center_end = """      : (typeId == kTypePulseExplosion) ? 0.5 // centerTime
      : 0.0,
    false
  );
  // Soft-clipper width default 2;"""
new_center_end = """      : (typeId == kTypePulseExplosion) ? 0.5 // centerTime
      : (typeId == kTypeCrossover3) ? 3000.0
      : (typeId == kTypeCrossover4) ? 1000.0
      : (typeId == kTypeCrossover5) ? 500.0
      : (typeId == kTypeCrossover6) ? 300.0
      : 0.0,
    false
  );
  // Soft-clipper width default 2;"""
if "kTypeCrossover3) ? 3000.0" in text:
    print("center defaults already patched")
elif old_center_end not in text:
    raise SystemExit("center defaults end missing")
else:
    text = text.replace(old_center_end, new_center_end, 1)

# width defaults for f2
old_width_end = """      : (typeId == kTypeWirdoSpiral) ? 1.0 // length
      : 2.0,
    false
  );
  init_control(n.oversample, 2.0, true);"""
new_width_end = """      : (typeId == kTypeWirdoSpiral) ? 1.0 // length
      : (typeId == kTypeCrossover4) ? 5000.0
      : (typeId == kTypeCrossover5) ? 2000.0
      : (typeId == kTypeCrossover6) ? 1000.0
      : 2.0,
    false
  );
  init_control(n.oversample, 2.0, true);"""
if "kTypeCrossover4) ? 5000.0" in text:
    print("width defaults already patched")
elif old_width_end not in text:
    raise SystemExit("width defaults end missing")
else:
    text = text.replace(old_width_end, new_width_end, 1)

# lpfFrequency = f3
old_lpf = """  init_control(
    n.lpfFrequency,
    (typeId == kTypeAdditiveOsc) ? 20000.0 // dampingFilterFrequency
      : (typeId == kTypeBradley2a) ? 2600.0 // interfFreq
      : (typeId == kTypeActiveFilter || typeId == kTypePassiveFilter) ? 1000.0 // highCut
      : (typeId == kTypeInertialFilter) ? 20.0 // release Hz
      : 8000.0,
    false
  );"""
new_lpf = """  init_control(
    n.lpfFrequency,
    (typeId == kTypeAdditiveOsc) ? 20000.0 // dampingFilterFrequency
      : (typeId == kTypeBradley2a) ? 2600.0 // interfFreq
      : (typeId == kTypeActiveFilter || typeId == kTypePassiveFilter) ? 1000.0 // highCut
      : (typeId == kTypeInertialFilter) ? 20.0 // release Hz
      : (typeId == kTypeCrossover5) ? 8000.0
      : (typeId == kTypeCrossover6) ? 3000.0
      : 8000.0,
    false
  );"""
if "kTypeCrossover5) ? 8000.0" in text:
    print("lpf defaults already patched")
elif old_lpf not in text:
    raise SystemExit("lpfFrequency defaults missing")
else:
    text = text.replace(old_lpf, new_lpf, 1)

# hpfFrequency = f4 (crossover6 frequency5)
old_hpf = """  init_control(
    n.hpfFrequency,
    (typeId == kTypeActiveFilter || typeId == kTypePassiveFilter) ? 200.0 // lowCut
      : 20.0,
    false
  );"""
new_hpf = """  init_control(
    n.hpfFrequency,
    (typeId == kTypeActiveFilter || typeId == kTypePassiveFilter) ? 200.0 // lowCut
      : (typeId == kTypeCrossover6) ? 10000.0
      : 20.0,
    false
  );"""
if "kTypeCrossover6) ? 10000.0" in text:
    print("hpf defaults already patched")
elif old_hpf not in text:
    raise SystemExit("hpfFrequency defaults missing")
else:
    text = text.replace(old_hpf, new_hpf, 1)

# stages = order 4 for crossovers — the default else is usually 4.0 already.
# Ensure explicit:
old_stages = """      : (typeId == kTypeSnowflake) ? 3.0 // iterations
      : (typeId == kTypeActiveFilter) ? 3.0 // feedbackCircuit Res+Clip"""
# Find exact stages else path
if "kTypeCrossover2) ? 4.0" not in text:
    # Insert before activeFilter or snowflake chain — find the ladder default
    marker = "      : (typeId == kTypeSnowflake) ? 3.0 // iterations\n"
    if marker not in text:
        raise SystemExit("stages snowflake marker missing")
    text = text.replace(
        marker,
        "      : (typeId == kTypeSnowflake) ? 3.0 // iterations\n"
        "      : (typeId >= kTypeCrossover2 && typeId <= kTypeCrossover6) ? 4.0 // LR order\n",
        1,
    )

# --- version bump ---
old_ver = """extern "C" int soemdsp_graph_version() {
  return 51; // + OMS/Jerobeam + phosphillator 91–102
}"""
new_ver = """extern "C" int soemdsp_graph_version() {
  return 52; // + crossover2..6 (103–107); kChannels 12
}"""
if "return 52;" in text:
    print("version already 52")
elif old_ver not in text:
    raise SystemExit("version block missing")
else:
    text = text.replace(old_ver, new_ver, 1)

# Move process helpers: is_crossover_type uses kType* which are fine.
# BUT process_crossover is placed before mixStereo which is fine.
# destroy uses inline range — OK even though is_crossover_type is defined later.

# Problem: PROCESS defines is_crossover_type AFTER it's needed? destroy doesn't use it.
# needsNative uses inline. create uses inline. dispatch uses inline.
# process_crossover uses is_crossover_type and crossover_band_count_for_type — defined just above process_crossover. Good.

if text == orig:
    raise SystemExit("no changes applied")
p.write_text(text, encoding="utf-8")
print(f"patched {p} ({len(orig)} → {len(text)} chars)")
