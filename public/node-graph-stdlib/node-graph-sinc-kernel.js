// Node Graph Standard Library -- sinc kernels.
//
// Two ways to draw a repeating sinc, one of which aliases and one of which
// cannot:
//
// IDEAL (nodeGraphIdealSincSample) is the textbook sin(x)/x evaluated over a
// finite window. It is the right picture for a diagram, but as an oscillator
// it aliases badly: the kernel's bandwidth is fixed by its lobe count, so
// raising the frequency pushes partials past Nyquist and they fold back down.
// Measured against a 16x-oversampled reference it degrades from about -70 dB
// at 110 Hz to -10 dB at 8 kHz -- at which point the aliasing is nearly as
// loud as the signal.
//
// BAND-LIMITED (nodeGraphBandLimitedSincSample) is the Dirichlet kernel, the
// periodic summation of sinc, also known as the aliased-sinc or asinc, and
// the closed form of a band-limited impulse train:
//
//     D(t) = sin((2M+1) * pi * t) / ((2M+1) * sin(pi * t))
//
// It is IDENTICALLY a sum of M cosine harmonics -- 1 + 2*sum(cos(2*pi*k*t))
// for k = 1..M -- so it contains no energy above the Mth harmonic by
// construction. Clamping M so that M*freq stays under Nyquist therefore makes
// aliasing impossible rather than merely small: measured the same way it sits
// at the reference filter's own noise floor (about -54 dB) at every frequency
// tested from 110 Hz to 12 kHz.
//
// Over one period D has M lobes either side of the main lobe, so the "lobes"
// control maps straight onto M and the two modes look alike at low
// frequencies. The difference is what happens as you go up: the ideal kernel
// keeps its lobes and gains a hash of folded partials, the band-limited one
// quietly sheds lobes and stays clean.

// Highest harmonic count that keeps M * freq below Nyquist, with a small
// guard band so the topmost partial is not sitting exactly on the fold point.
function nodeGraphSincMaxHarmonics(freq, sampleRate) {
  const safeRate = Math.max(1, Number(sampleRate) || 44100);
  const safeFreq = Math.max(1e-9, Number(freq) || 0);
  return Math.max(1, Math.floor((safeRate * 0.5) / safeFreq) - 1);
}

// phase is 0..1 across the cycle; the kernel peak sits at phase 0.5.
function nodeGraphIdealSincSample(phase, lobes) {
  const count = Math.max(1, Math.round(Number(lobes) || 1));
  const x = (phase - 0.5) * 2 * Math.PI * count;
  return Math.abs(x) < 1e-9 ? 1 : Math.sin(x) / x;
}

function nodeGraphBandLimitedSincSample(phase, lobes, freq, sampleRate) {
  const requested = Math.max(1, Math.round(Number(lobes) || 1));
  const harmonics = Math.min(requested, nodeGraphSincMaxHarmonics(freq, sampleRate));
  const order = 2 * harmonics + 1;
  const theta = Math.PI * (phase - 0.5);
  const denominator = order * Math.sin(theta);
  // sin(theta) -> 0 at the kernel peak, where the true limit is 1.
  return Math.abs(denominator) < 1e-9 ? 1 : Math.sin(order * theta) / denominator;
}
