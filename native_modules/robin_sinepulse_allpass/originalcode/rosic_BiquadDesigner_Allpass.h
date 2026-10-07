// Excerpt from RS-MET (Robin Schmidt), branch work:
// Libraries/RobsJuceModules/rosic/filters/rosic_BiquadDesigner.h
// https://github.com/RobinSchmidt/RS-MET/blob/work/Libraries/RobsJuceModules/rosic/filters/rosic_BiquadDesigner.h
// Only calculateSineAndCosine (lines 224-230), calculateFirstOrderAllpassCoeffs and calculateCookbookAllpassCoeffs (lines 543-570), copied unmodified.
// Used with Robin's permission (2026-10-06, docs/KICK_PLAN.md).
// Reference only: not compiled into the sandbox (the port is ../robin_sinepulse_allpass.cpp).

  INLINE void BiquadDesigner::calculateSineAndCosine(double& sinResult, double& cosResult,
      const double& frequency, const double& oneOverSampleRate)
  {
    // calculate intermediate variables:
    double omega  = 2.0 * PI * frequency * oneOverSampleRate;
    RAPT::rsSinCos(omega, &sinResult, &cosResult);
  }

  // [...]

  INLINE void BiquadDesigner::calculateFirstOrderAllpassCoeffs(double &b0, double &b1, double &b2,
    double &a1, double &a2, const double &oneOverSampleRate, const double &frequency)
  {
    double t = tan(PI*frequency*oneOverSampleRate);
    double x = (t-1.0) / (t+1.0);

    b0 = x;
    b1 = 1.0;
    b2 = 0.0;
    a1 = -x;
    a2 = 0.0;
  }

  INLINE void BiquadDesigner::calculateCookbookAllpassCoeffs(double &b0, double &b1, double &b2,
    double &a1, double &a2, const double &oneOverSampleRate, const double &frequency,
    const double &q)
  {
    double sine, cosine;
    calculateSineAndCosine(sine, cosine, frequency, oneOverSampleRate);
    double alpha = sine/(2.0*q);
    double a0Rec = 1.0/(1.0+alpha);

    a1 = 2.0*cosine    * a0Rec;
    a2 = (alpha-1.0)   * a0Rec;
    b0 = (1.0-alpha)   * a0Rec;
    b1 = (-2.0*cosine) * a0Rec;
    b2 = (1.0+alpha)   * a0Rec;
  }
