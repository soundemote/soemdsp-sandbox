// Excerpt from RS-MET (Robin Schmidt), branch work:
// Libraries/RobsJuceModules/rosic/unfinished/rosic_MiscUnfinished.h
// https://github.com/RobinSchmidt/RS-MET/blob/work/Libraries/RobsJuceModules/rosic/unfinished/rosic_MiscUnfinished.h
// Only rsFlatZapper (file lines 262-418), copied unmodified.
// Used with Robin's permission (2026-10-06, docs/KICK_PLAN.md).
// Reference only: not compiled into the sandbox (the port is ../robin_sinepulse_allpass.cpp).

//=================================================================================================

/** A chain of allpass filters that has "zap" like sound as its impulse response, i.e. a fast 
sinusoidal downward sweep. Due to its allpass nature, the overall output has a white (i.e. flat) 
spectrum. It's meant to be used to create (raw material for) synthesized drum and percussion 
sounds. It turned out to be useful to apply a first order lowpass afterwards to convert the white 
spectrum into a brown one, i.e. one with -6 dB/oct falloff. The browning filter should probably be 
tuned somewhere below the lowest allpass tuning frequency as set by setLowFreq().

Eventually, it can be driven by sources other than an impulse generator. Noise bursts are
interesting as excitation signal, too. */

class rsFlatZapper
{

public:


  //-----------------------------------------------------------------------------------------------
  // \Lifetime

  rsFlatZapper();


  //-----------------------------------------------------------------------------------------------
  // \Setup


  /** Sets the sample rate at which this object should operate. */
  void setSampleRate(double newSampleRate) { sampleRate = newSampleRate; setDirty(); }

  /** Enumeration of the available filter modes. */
  enum class Mode
  {
    bypass = 0,
    onePole,       // maybe rename to allOnePole
    //twoOnePoles,   // 2 one poles lumped into a biquad per stage -> optimization
    biquad,        // maybe rename to allBiquad

    // ToDo:
    // lowFirst,   // use 1st order filters for lower k filters (and biquads for the rest)
    // lowBiquad,  // use 2nd order filters for lower k filters (and one-poles for the rest)

    numModes
  };
  // Maybe have modes that alternate between first order and second order filters - but no, a 
  // similar effect can be achieved by using two rsWhiteZappers in series - one with biquads and
  // one with first order filters, so it's not worthwhile to do internally.
  // But maybe it coul be worthwhile to have the first k filters firstorder and the remaining N-k
  // filters second order (or the other way around) for some user given k. That could perhaps 
  // introduce a knee in the phase response in the log freq domain
  // 

  /** Sets the mode of the filter chain, i.e. the type of allpass filter that will be used per 
  stage. @see Mode. */
  void setMode(Mode newMode) { mode = newMode; setDirty(); }

  /** Sets the number of allpass filter stages to be used. Using more stages generally leads to a 
  more elongated sweep/zap. The sweet spot seem to be around 50. */
  void setNumStages(int newNumStages) { allpassChain.setNumStages(newNumStages); setDirty(); }

  /** Sets the frequency to which the lowest allpass filter should be tuned. */
  void setLowFreq(double newFreq) { freqLo = newFreq; setDirty(); }

  /** Sets the frequency to which the highest allpass filter should be tuned. */
  void setHighFreq(double newFreq) { freqHi = newFreq; setDirty(); }

  /** Sets the shape parameter in the frequency domain that the tuning frequencies of the allpasses
  will follow. A value of 0 will space out the tuning pitches out linearly, i.e. it will give 
  linear spacing on a log-frequency axis. Values above 0 will bend the curve upwards ...TBC... */
  void setFreqShape(double newShape) { freqShape = newShape; setDirty(); }

  /** Sets the Q (quality factor) to which the lowest allpass will be set. The sweet spot for Q 
  seems to be around 1.0. Higher values will ...TBC... */
  void setLowQ(double newQ) { qLo = newQ; setDirty(); }

  /** Sets the Q (quality factor) to which the lowest allpass will be set. The sweet spot for Q 
  seems to be around 1.0. ...I think, the highQ setting admits higher values than lowQ without 
  sounding like crap (verify!) */
  void setHighQ(double newQ) { qHi = newQ; setDirty(); }

  /** Sets the shape that the Q-values for the filters will follow. It's similar to 
  setFreqShape. */
  void setQShape(double newShape) { qShape = newShape; setDirty(); }

  /** Initializes all parameter values to their initial/default values. The sample rate may or may
  not be re-initialized also. */
  void initSettings(bool initAlsoSampleRate = false);

  //-----------------------------------------------------------------------------------------------
  // \Processing

  /** Produces one output sample from a given input sample at a time. */
  inline double getSample(double in)
  {
    if(dirty)
      updateCoeffs();
    return allpassChain.getSample(in);
  }

  /** Resets the processing state (i.e. filter buffers). Does not affect parameter setup. */
  void reset()
  {
    allpassChain.reset();
  }



protected:

  /** Sets our dirty flag to indicate that a call to updateCoeffs is necessary before producing the
  next sample. */
  void setDirty() { dirty = true; }

  /** Updates the coefficients of all the allpass filters according to the user parameters. */
  void updateCoeffs();

  // Embedded objects:
  static const int maxNumStages = 256;
  RAPT::rsBiquadCascade<double, double> allpassChain;

  // User parameters:
  double freqLo;
  double freqHi;
  double freqShape;
  double qLo;
  double qHi;
  double qShape;
  double sampleRate;
  Mode   mode;

  // Internals:
  bool dirty;

};

// ToDo:
// -Maybe introduce global feedback - but then the output will not be white anymore. But maybe we 
//  can use the allpass nesting technique to achieve a white output with feedback? Is it possible
//  (in a practical way) to implement zero-delay feedback for the whole class rsBiquadCascade? If 
//  so, maybe do it.
// -Let the user set up the frequency curve more flexibly by having an arbitrary number of nodes 
//  distributed in 0..1 and map that curve to lowPitch...highPitch. that may be a use case for
//  rsLinearFractionalInterpolator. But maybe do that in a subclass.
// -Maybe have a function rsBiquadCascade::getSampleDF1_1p1z etc. that can be called alternatively
//  if a2 = b2 = 0. Maybe such an optimizing dispatch can be done in rsBiqadCascade itself in a 
//  processBlock function (the dispatcher overhead may make it not worthwhile in getSample but for
//  a whole block, that may be a good optimization)
// -Maybe we can build a phaser from it
// -Maybe create a class rsBrownZapper that also includes the browning filter and the cleanup 
//  highpass and perhaps more post-processing. For example, a slope/tilt filter could be useful for
//  further shaping. Or maybe an 8 band EQ.
// -Make a subclass that also has some post-processing




