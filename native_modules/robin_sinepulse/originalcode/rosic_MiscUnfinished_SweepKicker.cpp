// Excerpt from RS-MET (Robin Schmidt), branch work:
// Libraries/RobsJuceModules/rosic/unfinished/rosic_MiscUnfinished.cpp
// https://github.com/RobinSchmidt/RS-MET/blob/work/Libraries/RobsJuceModules/rosic/unfinished/rosic_MiscUnfinished.cpp
// Only rsFreqSweeper, rsMorphWaveBipolar and rsSweepKicker (file lines 620-824), copied unmodified.
// Used with Robin's permission (2026-10-06, docs/KICK_PLAN.md).
// Reference only: not compiled into the sandbox (the port is ../robin_sinepulse.cpp).

//=================================================================================================

const double rsFreqSweeper::refFreq = 50.0;

rsFreqSweeper::rsFreqSweeper()
{
  initSettings(true);
  reset();
}

void rsFreqSweeper::initSettings(bool initAlsoSampleRate)
{
  freqHi      = 10000.0;
  freqLo      =     0.0;
  chirpAmount =     0.0;
  chirpShape  =     0.0;
  sweepTime   =     0.2; 
  phase       =     0.0;
  phaseStereo =     0.0;
  //waveShape   =     0.0;

  if(initAlsoSampleRate)
    sampleRate = 44100.0;

  setDirty();
}

void rsFreqSweeper::updateCoeffs()
{
  double ep = 0.5*(chirpAmount + chirpShape);
  double eq = 0.5*(chirpAmount - chirpShape);
  a = freqHi;
  p = pow(2, ep);
  q = pow(2, eq);
  c = (pow(a/refFreq, 1/q) - 1) / pow(sweepTime, p); // refFreq = a / (1 + c * sweepTime^p)^q
  b = freqLo * pow(c, q);
}

//=================================================================================================

double rsMorphWaveBipolar::phaseShapePow(double p, double a) 
{
  p = RAPT::rsLinToLin(p, 0.0, 1.0, -1.0, +1.0);   // 0..1 -> -1..+1
  if(p >= 0)
    p =  pow( p, a);
  else
    p = -pow(-p, a);
  p = RAPT::rsLinToLin(p, -1.0, +1.0, 0.0, 1.0);   // -1..+1 -> 0..1
  return p;

  // ToDo:
  // -Optimize: Replace the (moderately expensive) rsLinToLin calls by simpler formulas.
}

void rsMorphWaveBipolar::initSettings()
{
  waveParam = 0;
  waveForm  = WaveForm::Sine;
}

double rsMorphWaveBipolar::getWaveValue_01(double pos)
{
  RAPT::rsAssert(pos >= 0.0 && pos < 1.0, "pos out of assumed range");

  using WF = WaveForm;
  switch(waveForm)
  {
  case WF::Sine:
  {
    return sin(2*PI*pos);
  }
  case WF::SinFatSaw:
  {
    double par = triSawParamMap(waveParam);
    double tmp = RAPT::rsTriSaw(2*PI*pos, par);  // We start with a TriSaw and use sinusoidal..
    return RAPT::rsSin<double>(0.5*PI * tmp);    // ..waveshaping to get the SinFatSaw
  }
  case WF::TriSaw:
  {
    double par = triSawParamMap(waveParam);
    return RAPT::rsTriSaw(2*PI*pos, par);
  }

  /*
  // Not yet ready to use. The mapping between waveParam and the phase/position is not yet properly 
  // tuned for perceptual uniformity.
  case WF::PhaseShapePow:
  {
    pos = phaseShapePow(pos, pow(2.0, -2.0 * waveParam));
    return sin(2*PI*pos);
    // The scaler 2.0 in front of waveParam is rather ad hoc. The goal is that the user gets a 
    // parameter in -1..+1 where the ends correspond to bright waves. We want the sematic to be: 
    // -1: sawDown (but more like a squeezed sine), 0: sine, +1: sawUp
    // 
  }
  */

  default:
  {
    RAPT::rsError("Unknown WaveForm");
    return 0.0;
  }

  }

  // ToDo:
  // -Replace the calls to RAPT::rsTriSaw by calls to some optimized function that directly works
  //  with the 0..1 range rather than 0..2pi. We convert here from 0..1 to 0..2pi and then there, 
  //  we convert back from 0..2pi to 0..1. That's, of course, silly. We also want to avoid the 
  //  internal range reduction there to 0..1 because here, we assume that pos is already in 0..1 so
  //  the range reduction would be redundant. 
}

double rsMorphWaveBipolar::getWaveValue(double pos)
{
  pos = RAPT::rsWrapAround(pos, 1.0);  // Range reduction due to periodicity
  return getWaveValue_01(pos);
}

//=================================================================================================

rsSweepKicker::rsSweepKicker()
{
  initSettings(true);

  // The freqSweeper uses a std::function member to actually produce its waveform output for 
  // flexibility with regard to the produced waveform. Here, we assign that member via its 
  // setWaveForm setter. We assign it to a function "waveFunc" that itself uses our waveForm member
  // for the waveform production:
  auto waveFunc = [this](double p) { return waveForm.getWaveValue(p); };
  freqSweeper.setWaveForm(waveFunc);
  // ToDo: 
  // -Verify if "this" is the correct/best capture mode for this purpose. Maybe "=" or "&" 
  //  is better?

  reset();
}

void rsSweepKicker::initSettings(bool initAlsoSampleRate)
{
  frqLo       =     0;
  frqLoByKey  =   100;
  frqLoByVel  =     0;
  frqHi       = 10000;
  frqHiByKey  =   100;
  frqHiByVel  =     0;
  swpTm       =     0.2;
  swpTmByKey  =     0;
  swpTmByVel  =     0;
  fadeOutTime =     0;
  waveForm.initSettings();
  freqSweeper.initSettings(initAlsoSampleRate);
  fadeOutEnv.setNumFadeSamples(RAPT::rsRoundToInt(fadeOutTime * getSampleRate()));
}

void rsSweepKicker::noteOn(int key, int vel)
{
  double factor;

  // Set up frequencies:
  double maxFreq = 0.5 * getSampleRate(); // We clip the freq at the Nyquist limit
  double freq;
  factor = RAPT::rsMidiKeyAndVelToFreqFactor(key, vel, frqHiByKey, frqHiByVel);
  freq   = RAPT::rsMin(factor * frqHi, maxFreq);
  freqSweeper.setHighFreq(freq);
  factor = RAPT::rsMidiKeyAndVelToFreqFactor(key, vel, frqLoByKey, frqLoByVel);
  freq   = RAPT::rsMin(factor * frqLo, maxFreq);
  freqSweeper.setLowFreq(freq);

  // Set up speed, shape, etc:
  double time = swpTm;
  freqSweeper.setSweepTime(time);


  freqSweeper.reset();
  // I'm not yet sure if always doing a hard reset is the right thing here. Maybe we should reset 
  // only under certain conditions. Maybe only if the fadeOutEnv has reached its end?


  fadeOutEnv.noteOn();
  currentNote = key;
}

void rsSweepKicker::noteOff(int key)
{
  if(key == currentNote)
    fadeOutEnv.noteOff();
  // Without the conditional, it would behave strangely when the player plays a note, then a second
  // note, then releases the first. It would go into realease even though the most recent note is 
  // still held.
}

// ToDo:
//
// -Maybe introduce an oversampling parameter
// -Maybe add a 2nd osc that can be adjusted in relative pitch (maybe +-24 semitones) and serve as
//  source for FM/PM (linear or exponential - maybe we can smoothly morph the lin-vs-exp behavior)
//  and also as source for AM/RM (maybe AM can also be done exponentially?). Maybe let the effect 
//  of the picth envelope on the second osc be adjustable from 0% to 100% ...or maybe beyond.
// -But maybe instead of integrating all of that into SweepKicker itself, we could also just create
//  such patches using the semimodular facilities of ToolChain. Just use an LFO as modulation 
//  source. But then we need to give the LFO a mode in which it can produce audio-signals. It 
//  should the respond to MIDI input.
// -Maybe give it modulatable detune and freq-offset parameter that can be used to to linear and
//  exponential FM by an external source. We already have a phase-parameter, so PM should already 

