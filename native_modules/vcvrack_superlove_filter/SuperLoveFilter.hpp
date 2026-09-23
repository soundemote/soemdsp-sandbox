#pragma once

// Super Love — DSP from soemdsp-sandbox Superlove Rev2.
// Chaos is fixed at 0 (no Chaos control on the VCV panel).
// Modes: LP18 / LP24 / HP6 / BP6. Panel left→right: LP18, LP24, HP, BP.

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace fmd {
namespace super_love {

enum Mode {
	MODE_LP18 = 0,
	MODE_LP24 = 1,
	MODE_HP = 2,
	MODE_BP = 3,
};

// Panel slider left→right: LP18, LP24, HP, BP.
inline Mode modeFromPanel(int panel) {
	switch (panel) {
		case 0: return MODE_LP18;
		case 1: return MODE_LP24;
		case 2: return MODE_HP;
		case 3: return MODE_BP;
		default: return MODE_LP24;
	}
}

struct Voice {
	double feedbackSignal = 0.0;
	double filterY[5] = {};
	double dcY[5] = {};
	unsigned int rngState = 0x85EBCA6Bu;

	void reset(unsigned int seed = 0x85EBCA6Bu) {
		feedbackSignal = 0.0;
		for (int i = 0; i < 5; i++) {
			filterY[i] = 0.0;
			dcY[i] = 0.0;
		}
		rngState = seed ? seed : 0x85EBCA6Bu;
	}
};

namespace detail {
using namespace soemdsp_maths;

static const double kSoftwaveTriMorph = 0.75;
static const double kPhaseBias = 0.25725;
// LP24 breadboard: patches/filter breadboards/superlove lp24 breadboard.json
// Softwave Osc morph 0.834, phase 0.85 cycle.
static const double kLp24SoftwaveTriMorph = 0.834;
static const double kLp24PhaseBias = 0.85;
static const double kLp18ModMin = -0.1;
static const double kLp18ModMax = -6.0;
static const double kLp24ModMin = -0.1;
static const double kLp24ModMax = -3.0;
static const double kLpInputScale = 0.25;
static const double kLpOutputScale = 8.0;
static const double kHpBpInputScale = (0.08 / 0.5) * 2.0;  // 0.32 (doubled)
static const double kHpBpOutputScale = (0.5 / 0.08) * 0.5; // 3.125
static const double kMasterOutScale = 0.5;
static const double kBpExtraOutScale = 0.5;
static const double kLp18FinalBoost = 3.0;
static const double kLp24FinalBoost = 2.0;
static const double kHpFinalBoost = 2.0;
static const double kHpBpOutHalf = 0.5; // halve HP/BP final out
// Chaos face slider at 0.0 (sandbox remap 0…1 → 0.37…0.61).
static const double kChaosUi = 0.0;
static const double kChaosHpBp = 0.37 + (0.61 - 0.37) * kChaosUi; // 0.37
static const double kShapeHpBp = 1.0 - kChaosHpBp;                 // 0.63
// Extra I/O pad for HP/BP only. LP is a phase waveshaper — do not pad
// the Softwave Phase excursion (that linearized LP into a generic ladder).
static const double kIoInputPad = 0.25;
static const double kIoOutputBoost = 1.0 / kIoInputPad; // 4.0
// Panel Noise 0…1 → inject 0…0.25 (LP: with In; HP/BP: feedback path)
static const double kHpBpNoiseMax = 0.25;
static const double kLpNoiseMax = 0.25;


static inline double clampd(double v, double lo, double hi) {
	return v < lo ? lo : (v > hi ? hi : v);
}
static inline double jmap01(double v, double outMin, double outMax) {
	return outMin + (outMax - outMin) * v;
}
static inline double pitchToFreq(double pitch) {
	return 440.0 * dsp_exp2((pitch - 69.0) / 12.0);
}
static inline double wrap01(double v) {
	double x = v - dsp_floor(v);
	if (x < 0.0) x += 1.0;
	return x;
}

// HP/BP resonance curve is two fixed breakpoints. Build once — getValue is
// identical to reconstructing the Graph every sample.
static double hpBpResonanceMod(double reso) {
	static Graph g;
	static bool ready = false;
	if (!ready) {
		g.addNode(0.0, -0.2, 0.0, Graph::Shape::LINEAR);
		g.addNode(1.0, 1.3, -0.85, Graph::Shape::EXPONENTIAL);
		ready = true;
	}
	return g.getValue(reso);
}

static double soft_acos(double x) {
	double a = clampd(x, -1.0, 1.0);
	double x2 = a * a;
	double series = a * (1.0 + x2 * (0.16666666666666666
		+ x2 * (0.075
		+ x2 * (0.044642857142857144
		+ x2 * 0.030381944444444444))));
	return kHalfPi - series;
}

// Softwave Tri with the phasor stopped (freq 0): Morph is the knob 0…1, not m^4,
// and not the running-oscillator pitch softness. Same as Superlove Rev2 / breadboard.
static double softwaveTri(double phaseCycles, double morph, double frequencyHz) {
	(void) frequencyHz;
	const double p = wrap01(phaseCycles);
	const double t = clampd(morph, 0.0, 1.0);
	const double s = dsp_sin(p * kTwoPi);
	if (t <= 1.0e-12) return -s;
	const double raw = soft_acos(clampd(s * t, -1.0, 1.0)) / kPi * 2.0 - 1.0;
	const double peak = soft_acos(clampd(-t, -1.0, 1.0)) / kPi * 2.0 - 1.0;
	return peak > 1.0e-12 ? raw / peak : -s;
}

static double waveTrisaw(double phaseCycles, double morph) {
	double phaseRad = phaseCycles * kTwoPi;
	phaseRad = phaseRad - kTwoPi * dsp_floor(phaseRad / kTwoPi);
	double morphRad = morph * kTwoPi;
	double sourceMin, sourceMax, targetMin, targetRange;
	if (phaseRad > morphRad) {
		sourceMin = morphRad; sourceMax = kTwoPi; targetMin = 1.0; targetRange = -1.0;
	} else {
		sourceMin = 0.0; sourceMax = morphRad; targetMin = 0.0; targetRange = 1.0;
	}
	double sourceRange = sourceMax - sourceMin;
	double uni;
	if (sourceMin == sourceMax) uni = sourceMin;
	else uni = targetMin + (targetRange * (phaseRad - sourceMin)) / sourceRange;
	return 2.0 * uni - 1.0;
}

static double ladderTapStep(double y[5], double input, double a, int mode, int stages) {
	double c[5] = {0, 0, 0, 0, 0};
	if (mode == 1) {
		c[stages] = 1.0;
	} else if (mode == 2) {
		static const double hp[4][5] = {
			{1.0, -1.0, 0.0, 0.0, 0.0},
			{1.0, -2.0, 1.0, 0.0, 0.0},
			{1.0, -3.0, 3.0, -1.0, 0.0},
			{1.0, -4.0, 6.0, -4.0, 1.0},
		};
		for (int i = 0; i <= stages; i++) c[i] = hp[stages - 1][i];
	} else if (mode == 3) {
		static const double bp[4][5] = {
			{0.0, 2.0, -2.0, 0.0, 0.0},
			{0.0, 2.0, -2.0, 0.0, 0.0},
			{0.0, 0.0, 3.0, -3.0, 0.0},
			{0.0, 0.0, 4.0, -8.0, 4.0},
		};
		for (int i = 0; i < 5; i++) c[i] = bp[stages - 1][i];
	}
	double y0 = input;
	y0 = y0 / (1.0 + y0 * y0);
	y[1] = y0 + a * (y0 - y[1]);
	y[2] = y[1] + a * (y[1] - y[2]);
	y[3] = y[2] + a * (y[2] - y[3]);
	y[4] = y[3] + a * (y[3] - y[4]);
	y[0] = y0;
	return c[0] * y[0] + c[1] * y[1] + c[2] * y[2] + c[3] * y[3] + c[4] * y[4];
}

static inline double ladderCoefficient(double cutoffHz, double sampleRate) {
	double rawWc = kTwoPi * cutoffHz / sampleRate;
	double wc = clampd(rawWc, 1e-9, kPi * 0.98);
	double s = dsp_sin_0_pi(wc);
	double c = dsp_cos_0_pi(wc);
	double t = dsp_tan_neg_halfquarter(0.25 * (wc - kPi));
	double denom = s - c * t;
	if (denom > -1e-12 && denom < 1e-12) denom = (denom >= 0.0) ? 1e-12 : -1e-12;
	return t / denom;
}

static inline double nextNoiseBipolar(unsigned int* state) {
	unsigned int x = *state;
	x ^= x << 13;
	x ^= x >> 17;
	x ^= x << 5;
	*state = x;
	return ((double)x / 4294967295.0) * 2.0 - 1.0;
}

} // namespace detail

// noise01: panel Noise 0…1. Chaos fixed at face 0.0 (→ shape 0.63).
inline double processSample(
	Voice& s,
	double input,
	double frequency,
	double resonance,
	double noise01,
	Mode mode,
	double sampleRate
) {
	using namespace detail;
	const double safeRate = sampleRate < 1.0 ? 44100.0 : sampleRate;
	const double freqNorm = clampd(frequency, 0.0, 1.0);
	const double reso = clampd(resonance, 0.0, 1.0);
	const double n01 = clampd((noise01 == noise01) ? noise01 : 0.0, 0.0, 1.0);
	const int safeMode = (int)mode;
	const double cutoffHz = clampd(
		pitchToFreq(jmap01(freqNorm, -12.0, 135.0)), 0.0, 0.5 * safeRate
	);

	if (safeMode <= 1) {
		// LP18 / LP24 breadboard:
		//   audio + noise → Softwave Phase (freq 0, morph 0.75, wrap)
		//   LP out → attenuverter (amp = resonance −0.1…−6/−3, offset 0.25725)
		//     → Softwave Phase
		//   Softwave Out → LP (resonance 0) → HP 5 Hz DC → out
		// Ladder Q is unused. Resonance is feedback *amplitude* into Phase.
		const double noiseIn = (n01 > 1.0e-12)
			? nextNoiseBipolar(&s.rngState) * (n01 * kLpNoiseMax)
			: 0.0;
		const double driven = (input + noiseIn) * kLpInputScale;
		const double modMin = (safeMode == 0) ? kLp18ModMin : kLp24ModMin;
		const double modMax = (safeMode == 0) ? kLp18ModMax : kLp24ModMax;
		const double mod = modMin + (modMax - modMin) * reso;
		const double morph = (safeMode == 1) ? kLp24SoftwaveTriMorph : kSoftwaveTriMorph;
		const double phaseBias = (safeMode == 1) ? kLp24PhaseBias : kPhaseBias;
		const double phaseArg = driven + (mod * s.feedbackSignal + phaseBias);
		const double oscValue = softwaveTri(phaseArg, morph, 0.0);

		const double a = ladderCoefficient(cutoffHz, safeRate);
		const int stages = safeMode == 0 ? 3 : 4;
		s.feedbackSignal = ladderTapStep(s.filterY, oscValue, a, 1, stages);

		const double dcA = ladderCoefficient(5.0, safeRate);
		const double dcOut = ladderTapStep(s.dcY, s.feedbackSignal, dcA, 2, 3);
		const double lpBoost = (safeMode == 0) ? kLp18FinalBoost : kLp24FinalBoost;
		return dcOut * kLpOutputScale * kMasterOutScale * lpBoost;
	}

	const double inPad = input * kIoInputPad;
	const double driven = inPad * kHpBpInputScale;
	// Chaos face = 0.0 → remapped 0.37 → shape 0.63 (does NOT track Noise).
	const double shape = kShapeHpBp;
	// HP/BP: Noise 0…1 → bipolar feedback inject 0…0.2 only.
	const double noiseFb = (n01 > 1.0e-12)
		? nextNoiseBipolar(&s.rngState) * (n01 * kHpBpNoiseMax)
		: 0.0;

	if (safeMode == 2) {
		// HP6
		const double mod = hpBpResonanceMod(reso);

		s.feedbackSignal = mod * s.feedbackSignal + driven + noiseFb;
		double oscValue = -waveTrisaw(s.feedbackSignal + 0.75, shape);

		const double lpA = ladderCoefficient(safeRate * 0.5, safeRate);
		double fb = ladderTapStep(s.filterY, oscValue * 0.1, lpA, 1, 1);
		const double hpA = ladderCoefficient(cutoffHz, safeRate);
		fb = ladderTapStep(s.dcY, fb, hpA, 2, 1);
		fb *= 10.0;
		s.feedbackSignal = fb;
		return (-fb * 0.31) * kHpBpOutputScale * kMasterOutScale * kHpFinalBoost
			* kIoOutputBoost * kHpBpOutHalf;
	}

	// BP6
	const double mod = hpBpResonanceMod(reso);

	s.feedbackSignal = mod * s.feedbackSignal + driven + noiseFb;
	double oscValue = -waveTrisaw(s.feedbackSignal + 0.75, shape);

	const double a = ladderCoefficient(cutoffHz, safeRate);
	double fb = ladderTapStep(s.filterY, oscValue * 0.1, a, 3, 1);
	fb *= 10.0;
	s.feedbackSignal = fb;
	return fb * kHpBpOutputScale * kMasterOutScale * kBpExtraOutScale
		* kIoOutputBoost * kHpBpOutHalf;
}

} // namespace super_love
} // namespace fmd
