#!/usr/bin/env python3
"""Rewrite nodeGraphModuleStoreCatalog descriptions as short use-case tooltips."""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STORE = ROOT / "public" / "node-graph-module-store.js"
SNAP = ROOT / "scripts" / "_module_catalog_snapshot.json"

# Short use-case sentences (why you'd grab this module).
USE_CASES: dict[str, str] = {
  "polyBlep": "Clean multi-wave oscillator when you want saw/square/tri/sine without harsh aliasing.",
  "blit": "Band-limited impulse-train tones for classic digital waves that stay sharp but controlled.",
  "archimedes": "Cheap quadrature sine/cosine pair (and a novelty π readout) for modulation and math demos.",
  "bradley2a": "Broken-line test tone: add jitter, hits, dropouts, and interference for character and stress tests.",
  "antisaw": "Cooked “aliasing on purpose” saw color—fold Nyquist junk into musical in-band grit.",
  "sineWavetable": "Straightforward pitchable sin/cos voice when you need a clean table sine with amplitude control.",
  "wavetable2d": "Placeholder: multi-frame 2D wavetable morph—use later for evolving table tones.",
  "wavetable3d": "Placeholder: dual-axis morph wavetable—use later for deep table morphs.",
  "sinc": "Impulse-like sinc tones for modulation sources or teaching resampling / band-limit ideas.",
  "osc": "Everyday multi-wave starter oscillator with pitch CV—default voice for quick patches.",
  "aliasSine": "Raw sine that intentionally wraps past Nyquist—hear aliasing as a feature, not a bug.",
  "robinSinusoid": "Ultra-cheap recursive sine when you want steady tone with almost no CPU cost.",
  "additiveOsc": "Build timbres from harmonics—use for organ-ish, bell-ish, or carefully voiced spectra.",
  "gpuAdditiveOsc": "GPU additive voice when you want heavy harmonic stacks without maxing the audio thread.",
  "ellipsoid": "Sine→square ellipse shapes for soft-to-hard tones and dual uni/bi X/Y outs.",
  "ellipsoidOsc": "Full parametric ellipsoid path for rich 2D-scope-friendly oscillators.",
  "clock": "Free-running pulse clock to drive sequencers, envelopes, and rhythmic events.",
  "transport": "BPM-locked square clocks so everything stays in time with the project tempo.",
  "clockDivider": "Slow a clock down for subdivisions—half-time gates, bar pulses, lazy LFOs.",
  "delayedTrigger": "Wait after a hit, then fire—post-roll triggers, delayed envelopes, timed one-shots.",
  "randomClock": "Irregular triggers with duty control—organic rhythm, humanized gates, surprise hits.",
  "triggerCounter": "Count pulses and wrap—use for bars, loops, or stepped modulation from rhythm.",
  "triggerDivider": "Divide incoming triggers into slower clocks for sequences and envelopes.",
  "minMax": "Pick the highest and lowest of several signals—peak tracking, dual-range CV, or selector logic.",
  "comparator": "Detect rises/falls and polarity—edge triggers, change detect, and sign gates.",
  "sampleDelay": "Precise dry/wet delay in time or samples for comb, predelay, or synced echos.",
  "bitConverter": "Bridge integer bitmasks ↔ CV so digital key masks can modulate audio-rate paths.",
  "stepSequencer": "Classic stepped values under clock—melodies, parameter automation, and rhythmic CV.",
  "chordPad": "Pick diatonic chords fast and feed Scale/Root/Gate into quantizers and musical engines.",
  "chordSequencer": "Clock through progressions for automatic harmony that drives the rest of the pitch chain.",
  "lutCell": "FPGA-style truth table + flip-flop—build custom digital logic and weird gate patterns.",
  "metallicRatio": "Golden/silver/bronze ratios for detune spreads, delay lengths, or harmonic spacing.",
  "chordMemory": "Capture a chord stack from monophonic pitch and walk or mutate the latched notes.",
  "turingMachine": "Evolving CV/melody register—semi-random sequences that slowly corrode over time.",
  "pitchQuantizer": "Snap free pitch CV to a scale so walkers and LFOs land on musical notes.",
  "degreeTuring": "Scale-degree Turing melody—mutate within a key instead of raw voltage.",
  "gravityWalker": "Stepwise scale walker with occasional leaps—melodies that prefer neighbors but escape ruts.",
  "degreePhrase": "Loop an 8-step degree phrase that can slowly mutate—aging riffs, not classic arps.",
  "noteGlide": "Portamento/slew on 0.1V/oct so pitch moves slide instead of jump.",
  "noteTranspose": "Shift pitch by semitones/octaves after quantizers or before oscillators.",
  "surgeOscillator": "Hard-sync multi-wave oscillator for aggressive locked-tone leads and bass.",
  "softwaveOsc": "Soft-shaped multi-wave voice when you want warm morphing waves, not a distortion box.",
  "curveOsc": "Play math curves (rose, Lissajous, etc.) as mono audio or X/Y scope art.",
  "snowflake": "Fractal turtle paths as stereo X/Y—ornamental motion and strange stereo voices.",
  "dsfOscillator": "Alias-free DSF kit (sine/saw/PWM/etc.) for clean digital tones with classic PWM tools.",
  "robinSupersaw": "Detuned multi-saw wall with pitch dither—huge pads and trance supersaws.",
  "hypersaw": "Massive phase-spread saw bank for dense stereo supersaw beds and visual phase columns.",
  "spiral": "Jerobeam spiral X/Y/Z motion for scopes, lasers, and audiovisual flight paths.",
  "fractalSpiral": "Self-similar fractal spiral motion when plain spirals feel too simple.",
  "logSpiral": "Perfect equiangular spiral—constant growth look for clean geometric motion.",
  "blubb": "Placeholder Jerobeam Blubb motion—reserved for future curve engine.",
  "boing": "Placeholder Jerobeam Boing motion—reserved for future bounce/curve engine.",
  "keplerBouwkamp": "Nested polygon spiral for structured X/Y geometric patterns.",
  "mushroom": "Placeholder Jerobeam Mushroom motion—reserved for future curve engine.",
  "nyquistShannon": "Placeholder Jerobeam Nyquist-Shannon motion—reserved for future curve engine.",
  "radar": "Placeholder Jerobeam Radar motion—reserved for future sweep/curve engine.",
  "torus": "Placeholder Jerobeam Torus motion—reserved for future 3D-path engine.",
  "wirdoSpiral": "Placeholder Jerobeam WirdoSpiral—reserved for future wild spiral engine.",
  "lorenzAttractor": "Butterfly chaos for organic X/Y trails, modulation, and never-quite-repeating motion.",
  "logisticMap": "One-knob chaos (R): steady → periodic → wild—great for CV and teaching chaos.",
  "henonMap": "Angular 2D digital chaos for spikier, more “computery” motion than continuous attractors.",
  "chuaAttractor": "Double-scroll chaos with a different lobe feel than Lorenz—another chaotic CV palette.",
  "noiseGenerator": "Stereo noise colors (white/pink/brown/etc.) for texture, percussion, and dither.",
  "randomWalk": "Controlled wander CV—smooth drift, steps, or filtered noise motion for parameters.",
  "fractalBrownianNoise": "Layered fBm drift for natural multi-scale organic modulation.",
  "piSpigotNoise": "Noise from π digits with color shaping—quirky stereo texture that never hard-loops.",
  "codeblock": "Write JS DSP inline when no stock module does the exact math you need.",
  "customDisplay": "Draw a custom face with JS for patch-specific meters, art, or debug visuals.",
  "graph2": "Shape a control curve by points—map phasors/LFOs into custom response shapes.",
  "graphCopy": "Stepped or free control graph when you want quantized X and shared curve tools.",
  "gain": "Scale and offset signals—level matching, bias shifts, and simple VCA-style control.",
  "gainBias": "Retired alias of Gain—use Gain (it already has offset).",
  "mix": "Sum several voices with per-channel level and bias—utility multivoice summing.",
  "gainBiasMix": "Retired alias of Mix—use Mix.",
  "bias": "Nudge a signal off center—steer bipolar CV into a new range.",
  "softClipper": "Gentle saturation/limiting when peaks need taming without hard digital clip.",
  "rotate3dTo2d": "Spin X/Y/Z points then project to 2D for scope art and stereo transforms.",
  "vectorscopeTransform": "Rotate stereo so mono stands vertical—classic vectorscope / balance view.",
  "output": "Final stereo sink—patch here to hear (and meter) the mix.",
  "audioInput": "Bring the live mic/line into the patch as Left/Right.",
  "knob": "Macro face control for one Bias value you want always visible and tweakable.",
  "pluginSlider": "Vertical Bias control on the face—performance levels and slow rides.",
  "toggleButton": "Latching on/off for mutes, mode switches, and held gates.",
  "momentaryButton": "Press-and-hold gate for triggers, rolls, and temporary enables.",
  "pluginInput": "Clear stereo audio entry point when designing a plugin-style front end.",
  "pluginOutput": "Clear stereo exit next to classic Output for host/plugin boundaries.",
  "pluginMidiIn": "Keyboard/MIDI → gate, note, velocity, and 0.1V/oct for playable patches.",
  "pluginMidiOut": "Send/monitor MIDI note+gate for external gear or host MIDI outs.",
  "midiOut": "Dial a fixed MIDI number as CV—static note sources and test pitches.",
  "midiNotePitch": "Convert MIDI with octave/offset into pitch CV and frequency Hz.",
  "buttonEvents": "Website/UI clicks as patch pulses—hook page UX into the graph.",
  "wireBreak": "Fire when a wire snaps—FX hits, animations, or chaos when the patch breaks.",
  "wireConnect": "Pulse on new connections—acknowledge patches or start one-shots on plug-in.",
  "wireDisconnect": "Pulse on disconnects—cleanup gates or “unplug” sounds.",
  "windowReopen": "Pulse when a floating window is re-opened—attention/glow feedback hooks.",
  "shootingStarTail": "Placeholder for shooting-star trail events.",
  "shootingStarExplosion": "Website shooting-star hits as scaled triggers for FX or visuals.",
  "nextPatch": "Trigger to load the next saved patch—setlist / kiosk navigation.",
  "previousPatch": "Trigger to load the previous saved patch—setlist / kiosk navigation.",
  "keyboardController": "On-screen keyboard for playable pitch, gates, and gesture X/Y.",
  "macroControls": "Eight always-on macros (M1–M8) for performance control of a whole patch.",
  "pitchModWheel": "Read pitch bend and mod wheel next to the keyboard for expression.",
  "samplePlayer": "One-shot samples on trigger—hits, stabs, and short clips.",
  "audioPlayer": "Play music files with scrub/phasor control—loops, stems, and timelines.",
  "phosphillator": "Draw a closed shape with the mouse and play it back as X/Y motion.",
  "sampleLooper": "Gated looping sample player with bounds, pitch, and seam crossfade.",
  "passiveFilter": "Real-pole LP/HP/BP with slope, stagger, and optional −3 dB gain compensation.",
  "tiltFilter": "Pivot bright/dark balance without a hard cut—quick spectral posture.",
  "eqFilter": "Zero-latency multipurpose EQ band (LP/HP/peak/shelf…) for clean tone fixes.",
  "papoulisFilter": "Smooth lowpass with steeper roll-off than Butterworth for the same order.",
  "cookbookFilter": "Stack RBJ biquads for steeper multi-stage slopes when one band isn’t enough.",
  "activeFilter": "Multipole ladder LP/HP plus BP as two filters (independent cuts, slopes, sweep).",
  "ladderFilter": "Lab ladder Mode×Stages surface—same multipole family, different UI.",
  "butterworth": "Maximally flat multipole filter—transparent clean LP/HP/BP/BR slopes.",
  "linkwitzRiley": "LR-shaped single path for soft steep filtering (not a multi-band crossover product).",
  "bessel": "Soft Bessel multipole when you want less ringing and gentler time smear.",
  "chebyshev": "Steeper multipole with musical edge—more bite than Butterworth.",
  "elliptic": "Aggressive multipole tone color (approx elliptic)—sharp, not lab-true Cauer.",
  "bandpass": "Resonant pitched bandpass for formants, peaks, and ringing filters.",
  "allpass": "Phase-only filtering for phasers, correction, and delay-ish lag without EQ.",
  "crossover2": "Split stereo into 2 bands that recombine flat—multiband processing paths.",
  "crossover3": "Split stereo into 3 recombining bands for multiband dynamics/FX.",
  "crossover4": "Split stereo into 4 recombining bands for detailed multiband work.",
  "crossover5": "Split stereo into 5 recombining bands for fine spectral split processing.",
  "crossover6": "Split stereo into 6 recombining bands for maximal multiband routing.",
  "softpopOscillator": "Noise through a resonant peak BP—softpop-style pitchable noise voice.",
  "sinepulse": "Sine zap/chirp drum—electro kicks, risers, and swept sine hits.",
  "electroKick": "Placeholder classic electro kick voice.",
  "electroSnare": "Placeholder classic electro snare voice.",
  "electroHat": "Placeholder classic electro hi-hat voice.",
  "formantFilter": "Placeholder formant/vocal filter bank.",
  "binaryClock": "Placeholder binary counter with bit outs.",
  "theremin": "Placeholder space-controlled pitch/volume controller.",
  # catalog may have a second "osc" key later; snapshot shows duplicate labels—handle carefully
  "yellowjacketFilter": "Grindy feedback ellipse filter—square-ish harsh resonance colors.",
  "superloveFilter": "Warm self-oscillating ladder-ish resonator for bass-heavy love tones.",
  "chaoticPhaseLockingFilter": "Phase-locked chaotic feedback textures through LP/HP stages.",
  "modeResonator": "Ping a clean decaying mode—metallic rings and predictable resonance tails.",
  "combResonator": "Pitch-tuned comb/KS-style resonance for plucks, hollow bodies, and harmonic peaks.",
  "waveguide": "Placeholder full waveguide (use Comb/Mode resonators for working resonance now).",
  "phaseDisperse": "Cascade allpass smear—group-delay wash without changing magnitude.",
  "phaser": "Placeholder classic modulated phaser FX.",
  "flanger": "Placeholder classic short-delay flanger FX.",
  "chorus": "Placeholder multi-voice chorus thickening.",
  "bode": "Frequency shift (not pitch shift)—metallic, inharmonic, bubbly spectra.",
  "stftBlur": "Spectral blur wash—clouds and smears in time/frequency.",
  "resonatorFilter": "Chaotic dual-phasor resonator for wild FM-ish filter voices.",
  "humanFilter": "Bell-in-feedback dual-phasor network for vocal-ish, human filter colors.",
  "flowerChildFilter": "Character self-osc filter (clean/dirty/rev/downsample modes).",
  "pulseExplosion": "On trigger, spray many micro-pulses over time—glitch rain and density hits.",
  "tb303Filter": "303-style acid ladder character for squelchy basses and leads.",
  "slewLimiter": "Hard up/down rate limit—linear ramps to steps and CV glides.",
  "inertialFilter": "Exponential attack/release approach in Hz—smooth catch-up without hard slew corners.",
  "delayEffect": "Modulated feedback delay for echoes, slap, and diffuse trails.",
  "pingPongDelay": "Stereo bouncing delay with tempo tools and independent L/R motion.",
  "wallDelay": "Placeholder geometric room/wall delay from superellipsoid rays.",
  "reverbEffect": "Sabrina reverb wash—diffusion, recycle, and mix for space.",
  "soemReverb": "Full SoEm reverb with echo modes, filters, ducking, and dry/wet stereo outs.",
  "pll": "Lock a VCO to an input (Doepfer-style PLL)—tracking tones and lock gates.",
  "helmholtzPitch": "Track monophonic pitch: Hz, fidelity, and lock gate for analysis or follow.",
  "speedColorInertia": "Turn signal speed into color desaturation—visual edge energy meters.",
  "sampleHold": "Grab a value on trigger and freeze it—stepped random, stepped automation.",
  "expAdsr": "Full DADSR curve envelope for long articulations and looped contours.",
  "attackDecay": "Simple A/D envelope (loop/LFO options)—default easy amp/mod shape.",
  "flowerChildEnvelopeFollower": "Follow input loudness into CV—sidechain shapes and dynamics rides.",
  "linearEnvelope": "Predictable linear ramps for fades, gates, and simple motion.",
  "pluckEnvelope": "Fast pluck contour for picks, pings, and percussive decays.",
  "vactrolEnvelopeSeries": "Named vactrol timings—optical lag character from real VTL parts.",
  "vactrolEnvelopeCustom": "Roll-your-own optical lag envelope when no stock vactrol fits.",
  "sandboxVisuals": "Drive screen shake, dim, color, and scope pause from the patch.",
  "screenSpaceShader": "Script custom screen effects from declared inputs.",
  "bloomGlow": "Drive bloom/glow/dim of the screen wash from control signals.",
  "rgbaHsla": "Precise RGB/HSL screen wash color for intentional lighting.",
  "chromaColor": "Stylized chroma wash with drift/spread for mood lighting.",
  "image": "Hold a patch image asset for textures (e.g. phosphor dots).",
  "canvas": "Layer images, scopes, and shaders into one composite surface.",
  "pixelGrid": "Play with pixel-grid looks—strokes, bevels, and lo-fi screen craft.",
  "visualOscilloscope": "One multi-mode display face (1D/2D trace or phosphor) for quick inspection.",
  "traceDisplay": "Clean 1D vector waveform—see the signal shape without phosphor hang.",
  "dotOscilloscope": "Single soft phosphor dot for sparse, efficient level/position light.",
  "oscilloscopeBank": "Phase/amplitude bank view for multi-voice sources like Hypersaw.",
  "videoscope": "Triggered dual-channel scope (A/B) with freeze—stable waveforms of audio.",
  "matrixWaterfall": "Self-running matrix rain face—atmosphere and glyph aesthetics.",
  "matrixDisplay": "Character plate for info/serial text with LCD-style residual.",
  "textStream": "Type once, emit characters over time—serial text into matrix faces.",
  "asciiscope": "XY into a character-grid phosphor—ASCII scope art from two signals.",
  "spectrogram": "See frequency content over time (STFT) while passing audio through.",
  "valueOscilloscope": "Latest sample as one horizontal line—ultra-simple level glance.",
  "numberReadout": "Lit LED digits for the latest value—meters with phosphor residual hang.",
  "valueLcd": "Reflective LCD-style digits—cheap multimeter look for numbers.",
  "lineBurnOscilloscope": "Heart-monitor 1D phosphor sweep—persistence trail for mono signals.",
  "scope2d": "X/Y phosphor energy trail—the standard attractor/laser-style path face.",
  "phosphorLight": "Legacy alias of 2D Phosphor—use scope2d for new patches.",
  "scope2dTrace": "Instant X/Y vector history without phosphor—crisp 2D traces.",
  "badvalMonitor": "Watch for NaN/inf/explosions—show when the circuit goes invalid.",
  "speakerProtection": "Hard trip if |sample| > 1—protect ears/speakers while debugging.",
  "textBox": "Static in-world label for notes, lore, and instructions on the patch.",
  "animatedTextBox": "Wireable title/text plate so messages can be driven by the patch.",
}


def escape_js_string(s: str) -> str:
  return s.replace("\\", "\\\\").replace('"', '\\"')


def main() -> None:
  store = STORE.read_text(encoding="utf-8")
  snap = json.loads(SNAP.read_text(encoding="utf-8"))
  types = [e["type"] for e in snap]
  missing = [t for t in types if t not in USE_CASES]
  if missing:
    # Fallback: shorten existing description to one sentence-ish.
    by_type = {e["type"]: e for e in snap}
    for t in missing:
      old = by_type[t]["description"].strip()
      # first sentence or first ~110 chars
      cut = re.split(r"(?<=[.!?])\s+", old)
      short = cut[0] if cut else old
      if len(short) > 140:
        short = short[:137].rstrip() + "…"
      USE_CASES[t] = short
      print("fallback", t, "->", short[:60])

  # Replace description strings for each key in order of appearance.
  # Match:  key: { ... description: "..."  possibly multi-line concat
  def replacer(match: re.Match) -> str:
    key = match.group(1)
    if key not in USE_CASES:
      return match.group(0)
    usecase = escape_js_string(USE_CASES[key])
    return f'{key}: {{\n    category: {match.group(2)}\n    description: "{usecase}",'

  # Safer: for each key, find description: "..." after the key and replace first description only.
  out = store
  for key, usecase in USE_CASES.items():
    # Find the catalog entry for this key
    pat = re.compile(
      rf"(  {re.escape(key)}:\s*\{{\s*\n(?:.*\n)*?\s*)description:\s*(?:\"(?:\\.|[^\"\\])*\"(?:\s*\+\s*\"(?:\\.|[^\"\\])*\")*|\"(?:\\.|[^\"\\])*\")",
      re.M,
    )
    new_desc = f'description: "{escape_js_string(usecase)}"'
    out2, n = pat.subn(rf"\1{new_desc}", out, count=1)
    if n != 1:
      # try simpler single-line only
      pat2 = re.compile(
        rf"(  {re.escape(key)}:\s*\{{\n(?:    .*\n)*?    )description:\s*\"(?:\\.|[^\"\\])*\"",
        re.M,
      )
      out2, n = pat2.subn(rf"\1description: \"{escape_js_string(usecase)}\"", out, count=1)
    if n != 1:
      print("WARN no replace", key, n)
    else:
      out = out2

  if out == store:
    raise SystemExit("no changes written")
  STORE.write_text(out, encoding="utf-8")
  print("updated", STORE, "entries", len(USE_CASES))


if __name__ == "__main__":
  main()
