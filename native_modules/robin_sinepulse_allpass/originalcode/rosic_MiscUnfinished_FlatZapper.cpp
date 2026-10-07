// Excerpt from RS-MET (Robin Schmidt), branch work:
// Libraries/RobsJuceModules/rosic/unfinished/rosic_MiscUnfinished.cpp
// https://github.com/RobinSchmidt/RS-MET/blob/work/Libraries/RobsJuceModules/rosic/unfinished/rosic_MiscUnfinished.cpp
// Only rsFlatZapper (file lines 471-619), copied unmodified.
// Used with Robin's permission (2026-10-06, docs/KICK_PLAN.md).
// Reference only: not compiled into the sandbox (the port is ../robin_sinepulse_allpass.cpp).

//=================================================================================================

rsFlatZapper::rsFlatZapper() : allpassChain(maxNumStages)
{
  initSettings(true);
}

void rsFlatZapper::initSettings(bool initAlsoSampleRate)
{
  allpassChain.setNumStages(50);

  freqLo    = 20.0;
  freqHi    = 20000.0;
  freqShape = 0.0;
  qLo       = 1.0;
  qHi       = 1.0;
  qShape    = 0.0;
  mode      = Mode::biquad;

  if(initAlsoSampleRate)
    sampleRate = 44100.0;

  setDirty();
}

void rsFlatZapper::updateCoeffs()
{
  double fsR = 1.0 / sampleRate;
  double *b0 = allpassChain.getAddressB0();
  double *b1 = allpassChain.getAddressB1();
  double *b2 = allpassChain.getAddressB2();
  double *a1 = allpassChain.getAddressA1();
  double *a2 = allpassChain.getAddressA2();

  // Helper function to map the unit interval 0..1 to itself via a curve determined by our shape
  // parameter. This is used in the computation of the stage-index dependent tuning frequency and
  // Q for the allpass stage at the given index:
  auto shape = [](double x, double shapeParam) 
  { 
    //double s = RAPT::rsPowI(2.0, shapeParam);  // Slope at x = 0 - old, buggy
    double s = RAPT::rsPow(2.0, shapeParam); 
    double a = (s-1)/(s+1);                   // Function parameter for rational map in -1..+1
    return RAPT::rsRationalMap_01(x, a);
  }; // For convenience
  // ToDo: 
  // -Avoid conversion from s to a. Using s directly leads to a simpler formula.
  // -Use the more flexible 3-parametric shape from rsLinearFractionalInterpolator. Have 3 
  //  parameters 
  //  -slope: -inf...+inf - this is the current one
  //  -sigmoidVsSpikey: -inf...+inf - controls the center portion of the shape
  //  -asymmetry: compute s2 = s1^(asymmetry-1) - rationale: when asymmetry == 0, the top-right 
  //   slope should be the reciprocal of the left slope. s1 is the "s" in the function above, i.e. 
  //   the slope of the curve at bottom-left.

  // More helper functions:
  using  BQD = BiquadDesigner;
  auto setupBiquadAllpassStage = [&](int i, double f, double q)
  {
    BQD::calculateCookbookAllpassCoeffs(b0[i], b1[i], b2[i], a1[i], a2[i], fsR, f, q);
    a1[i] = -a1[i];  // The design routine uses a different convention for the sign of the
    a2[i] = -a2[i];  // a-coeffs than the class rsBiquadCascade
  };
  auto setupOnePoleAllpassStage = [&](int i, double f)
  {
    BQD::calculateFirstOrderAllpassCoeffs(b0[i], b1[i], b2[i], a1[i], a2[i], fsR, f);
    a1[i] = -a1[i];
  };

  // Error handler:
  auto handleUnknownMode = [&]()
  {
    RAPT::rsError("Unknown mode in rsFlatZapper::updateCoeffs");
    allpassChain.resetAllCoeffs();
  };


  // The case for one allpass stage must be handled separately to avoid a division by zero. In the
  // case of one stage, we just use the settings for the lowest stage:
  int numStages = allpassChain.getNumStages();
  if(numStages == 1)
  {
    switch(mode)
    {
    case Mode::onePole: setupOnePoleAllpassStage(0, freqLo);       break;
    case Mode::biquad:  setupBiquadAllpassStage( 0, freqLo, qLo);  break;
    default:            handleUnknownMode();
    }
    dirty = false;
    return;
  }

  // All other cases (i.e. numStages != 1), can be handled by the code below. This includes the
  // numStages == 0 case in which case the loops are just not entered at all:
  double scaler = 1.0 / double(numStages-1); 
  switch(mode)
  {

  case Mode::onePole:
  {
    for(int i = 0; i < numStages; i++)
    {
      double p = scaler * i;   // Goes from 0 to 1
      double f = RAPT::rsLinToExp(shape(p, freqShape), 0.0, 1.0, freqLo, freqHi);
      setupOnePoleAllpassStage(i, f);
    }
  } break;

  case Mode::biquad:
  {
    for(int i = 0; i < numStages; i++)
    {
      double p = scaler * i;   // Goes from 0 to 1
      double f = RAPT::rsLinToExp(shape(p, freqShape), 0.0, 1.0, freqLo, freqHi);
      double q = RAPT::rsLinToExp(shape(p, qShape),    0.0, 1.0, qLo,    qHi);
      setupBiquadAllpassStage(i, f, q);
    }
  } break;

  default:
  {
    handleUnknownMode();
  }

  }

  dirty = false;

  // ToDo:
  // -Optimize the calls to rsLinToExp. There are certain things can be precomputed which are
  //  recomputed there multiple times, I think. Maybe create a class rsLinToExpMapper that has
  //  a setup(T inMin, T inMax, T outMin, T outMax) function and a map(T x) function. See 
  //  rsMapper in RAPT (Math/Functions/Mappers.h/cpp)
  // -precompute 1 / (numStages-1)
  // -avoid the typecast to double per iteration - maybe use a double variable as second loop 
  //  counter that just counts up a double in parallel. We still need the int i, though because of
  //  the call to setup...AllpassStage which takes an int as first parameter.
  // -Use simd
}

// See also:
// https://kilohearts.com/products/disperser
// https://github.com/robbert-vdh/diopser
// They seem to be similar in what they do. Diopser also seems to have a mor where the allpass 
// tunings are distributed linearly. Try that, too. I think, we just need to replace the calls to
// rsLinToExp with calls to rsLinToLin. But even better would be a continuous parameter to morph 
// between liner and exponential and maybe go beyond. Check the functions used the 
// sineSweepBassdrum() experiment. There's this adjustable exp mapping that is also used for the 
// shape of the envelope segments in the sampler.

