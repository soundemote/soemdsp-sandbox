#pragma once

using namespace juce;
using namespace RAPT;
using namespace jura;

class FMDFilter
{
public:
	FMDFilter() = default;
	virtual ~FMDFilter() = default;

	/* Run this in your constructor */

	virtual void setupCommon()
	{
		noiseFilter.setLowpassCutoff(20594.5);
		noiseFilter.setHighpassCutoff(0.12491);
	}

	virtual void setSampleRate(double v)
	{
		sampleRate = v;
		noiseFilter.setSampleRate(sampleRate);
	};
	virtual void setFrequency(double v) { frequency = v; } // 0 to 1
	virtual void setResonance(double v) { resonance = v; } // 0 to 1
	virtual void setChaosAmount(double v) { chaosAmount = v; } // 0 to 1
	virtual void setNoiseSeed(int v)
	{
		noise.setSeedAndReset(v);
	};
	virtual void setInputAmplitude(double v) { inputAmplitude = v; } // suggested -10 to +10
	virtual double getSample(double in)
	{
		return in * inputAmplitude;
	};
	virtual double getFrequency() { return frequency; }

	elan::NoiseGenerator noise;
	MonoTwoPoleBandpass noiseFilter;

	String localName = "Bypass";
	String englishName = "Bypass";
	String countryAbbreviation;
	ColourGradient colorMap = ColourGradient::horizontal(Colours::black, 0.f, Colours::white, 1.f);
	juce::Font font;
	String helpText = "Filtering is disabled";
	double preferredOutputClipMode = 0;
	
protected:
	double smoothingTime = 0.050;
	double sampleRate = 44100;

	double inputAmplitude = 1;
	double frequency = .5;
	double resonance = 0;
	double chaosAmount = 0;
};

class RsmetFilter : public FMDFilter
{
public:
	RsmetFilter()
	{
		setupCommon();
	}

	void setupCommon() override
	{
		countryAbbreviation = "RSMET";

		FMDFilter::setupCommon();
		clipper.setClipMode(Clipper::Soft);

		normalizedToFrequency.addNode(0, 3.0);
		normalizedToFrequency.addNode(1, 20000);		
		normalizedToFrequency.setNodeShapeType(1, rsFunctionNode<double>::EXPONENTIAL);
		normalizedToFrequency.setNodeShapeParameter(1, -0.95);

		normalizedToResonance.addNode(0, 0.0);
		normalizedToResonance.addNode(1, 1.0);
		normalizedToResonance.setNodeShapeType(1, rsFunctionNode<double>::EXPONENTIAL);
		normalizedToResonance.setNodeShapeParameter(1, 0.5);

		ColourGradient g;
		g.addColour(0.0, juce::Colours::black);
		g.addColour(0.5, Colour(0xFF5F65E1));
		g.addColour(1.0, juce::Colours::white);
		colorMap = g;
	}

	void setSampleRate(double v) override
	{
		FMDFilter::setSampleRate(v);
		filter.setSampleRate(sampleRate);
	}

	void setFrequency(double v) override
	{
		FMDFilter::setFrequency(v);
		filter.setCutoff(normalizedToFrequency.getValue(frequency));
	}

	void setResonance(double v) override
	{
		FMDFilter::setResonance(v);
		filter.setResonance(normalizedToResonance.getValue(resonance));
	}

	void setChaosAmount(double v) override
	{
		FMDFilter::setChaosAmount(v);
	}

	double getSample(double in) override
	{
		double inputSignal = clipper.getSample(inputAmplitude * in * 2);

		// add noise to signal
		inputSignal += noiseFilter.getSample(noise.getSampleBipolar()) * chaosAmount;

		// filter input
		inputSignal = filter.getSample(inputSignal);

		// final out
		return inputSignal * .41;
	}

	RAPT::rsLadderFilter<double, double> filter;

	RAPT::rsNodeBasedFunction<double> normalizedToFrequency;
	RAPT::rsNodeBasedFunction<double> normalizedToResonance;

	Clipper clipper;
};

class Rsmet_LP6 : public RsmetFilter
{
public:
	Rsmet_LP6()
	{
		setupCommon();
		filter.setMode(rsLadderFilter<double, double>::LP_6);

		localName = "RS-MET Lowpass 6-pole";
		englishName = localName;
		helpText = "This is a high quality general purpose lowpass filter from from www.rs-met.com that is not part of the FMD series.";
	}
};

class Rsmet_LP12 : public RsmetFilter
{
public:
	Rsmet_LP12()
	{
		setupCommon();
		filter.setMode(rsLadderFilter<double, double>::LP_12);

		localName = "RS-MET Lowpass 12-pole";
		englishName = localName;
		helpText = "This is a high quality general purpose lowpass filter from from www.rs-met.com that is not part of the FMD series.";
	}
};

class Rsmet_LP18 : public RsmetFilter
{
public:
	Rsmet_LP18()
	{
		setupCommon();
		filter.setMode(rsLadderFilter<double, double>::LP_18);

		localName = "RS-MET Lowpass 18-pole";
		englishName = localName;
		helpText = "This is a high quality general purpose lowpass filter from from www.rs-met.com that is not part of the FMD series.";
	}
};

class Rsmet_LP24 : public RsmetFilter
{
public:
	Rsmet_LP24()
	{
		setupCommon();
		filter.setMode(rsLadderFilter<double, double>::LP_24);

		localName = "RS-MET Lowpass 24-pole";
		englishName = localName;
		helpText = "This is a high quality general purpose lowpass filter from from www.rs-met.com that is not part of the FMD series.";
	}
};

class Rsmet_HP6 : public RsmetFilter
{
public:
	Rsmet_HP6()
	{
		setupCommon();
		filter.setMode(rsLadderFilter<double, double>::HP_6);

		localName = "RS-MET Highpass 6-pole";
		englishName = localName;
		helpText = "This is a high quality general purpose highpass filter from from www.rs-met.com that is not part of the FMD series.";
	}
};

class Rsmet_HP12 : public RsmetFilter
{
public:
	Rsmet_HP12()
	{
		setupCommon();
		filter.setMode(rsLadderFilter2<double, double>::HP_12);

		localName = "RS-MET Highpass 12-pole";
		englishName = localName;
		helpText = "This is a high quality general purpose highpass filter from from www.rs-met.com that is not part of the FMD series.";
	}
};

class Rsmet_HP18 : public RsmetFilter
{
public:
	Rsmet_HP18()
	{
		setupCommon();
		filter.setMode(rsLadderFilter<double, double>::HP_18);

		localName = "RS-MET Highpass 18-pole";
		englishName = localName;
		helpText = "This is a high quality general purpose highpass filter from from www.rs-met.com that is not part of the FMD series.";
	}
};

class Rsmet_HP24 : public RsmetFilter
{
public:
	Rsmet_HP24()
	{
		setupCommon();
		filter.setMode(rsLadderFilter<double, double>::HP_24);

		localName = "RS-MET Highpass 24-pole";
		englishName = localName;
		helpText = "This is a high quality general purpose highpass filter from from www.rs-met.com that is not part of the FMD series.";
	}
};

class Rsmet_BP6 : public RsmetFilter
{
public:
	Rsmet_BP6()
	{
		setupCommon();
		filter.setMode(rsLadderFilter<double, double>::BP_6_6);

		localName = "RS-MET Bandpass 6-pole";
		englishName = localName;
		helpText = "This is a high quality general purpose bandpass filter from from www.rs-met.com that is not part of the FMD series.";
	}
};

class Rsmet_BP12 : public RsmetFilter
{
public:
	Rsmet_BP12()
	{
		setupCommon();
		filter.setMode(rsLadderFilter<double, double>::BP_12_12);

		localName = "RS-MET Bandpass 12-pole";
		englishName = localName;
		helpText = "This is a high quality general purpose bandpass filter from from www.rs-met.com that is not part of the FMD series.";
	}
};

class FlowerChildRev3 : public FMDFilter
{
public:
	FlowerChildRev3()
	{
		setupCommon();
		localName = "USA - Flower Child - LP12 [Rev.3]";
		englishName = localName;
		helpText = "Created by the US in partnership with Japan, this is a clean-energy filter that was made to remain pure under hot operaiton. Past 80% resonance however, things start to melt down.";

		noiseGraph.addNode(0.0, 0.0);
		noiseGraph.addNode(0.8, 0.1);
		noiseGraph.addNode(1.0, 1.0);

		noiseGraph.setNodeShapeType(2, rsFunctionNode<double>::RATIONAL);
		noiseGraph.setNodeShapeParameter(2, 0.0);

		double x = 0; // Non-resonant

		phaseModGraph.addNode(x, 0.0);
		sineAmpGraph.addNode(x, 4.44777);
		sineToSquareGraph.addNode(x, 0.6792);
		clipLevelGraph.addNode(x, 4);

		x = 0.5; // Resonant

		phaseModGraph.addNode(x, -0.017446);
		sineAmpGraph.addNode(x, 8.6687);
		sineToSquareGraph.addNode(x, 0.9552);
		clipLevelGraph.addNode(x, 4);

		x = 0.6; // Self-oscillating

		phaseModGraph.addNode(x, -0.017575);
		sineAmpGraph.addNode(x, 8.6687);
		sineToSquareGraph.addNode(x, 0.9552);
		clipLevelGraph.addNode(x, 4);

		x = 1.0; // Feedback

		phaseModGraph.addNode(x, -0.0147);
		sineAmpGraph.addNode(x, 2);
		sineToSquareGraph.addNode(x, 0.001);

		clipLevelGraph.addNode(0.0, 7);
		clipLevelGraph.addNode(0.7, 7);
		clipLevelGraph.addNode(1.0, 2);
		clipLevelGraph.setNodeShapeType(1, rsFunctionNode<double>::RATIONAL);
		clipLevelGraph.setNodeShapeType(2, rsFunctionNode<double>::RATIONAL);
		clipLevelGraph.setNodeShapeParameter(1, 0.0);
		clipLevelGraph.setNodeShapeParameter(2, 0.6);

		phaseModGraph.setNodeShapeType(1, rsFunctionNode<double>::RATIONAL);
		sineAmpGraph.setNodeShapeType(1, rsFunctionNode<double>::RATIONAL);
		sineToSquareGraph.setNodeShapeType(1, rsFunctionNode<double>::RATIONAL);

		phaseModGraph.setNodeShapeType(2, rsFunctionNode<double>::RATIONAL);
		sineAmpGraph.setNodeShapeType(2, rsFunctionNode<double>::RATIONAL);
		sineToSquareGraph.setNodeShapeType(2, rsFunctionNode<double>::RATIONAL);

		phaseModGraph.setNodeShapeType(3, rsFunctionNode<double>::RATIONAL);
		sineAmpGraph.setNodeShapeType(3, rsFunctionNode<double>::RATIONAL);
		sineToSquareGraph.setNodeShapeType(3, rsFunctionNode<double>::RATIONAL);

		phaseModGraph.setNodeShapeParameter(1, 0.9);
		sineAmpGraph.setNodeShapeParameter(1, 0.9);
		sineToSquareGraph.setNodeShapeParameter(1, 0.9);

		phaseModGraph.setNodeShapeParameter(2, 0.0);
		sineAmpGraph.setNodeShapeParameter(2, 0.0);
		sineToSquareGraph.setNodeShapeParameter(2, 0.0);

		phaseModGraph.setNodeShapeParameter(3, 0.6);
		sineAmpGraph.setNodeShapeParameter(3, 0.6);
		sineToSquareGraph.setNodeShapeParameter(3, 0.6);

		feedback = 0.0;
		fmAmount = pToF(-48.377);

		lpf1.setMode(RAPT::rsOnePoleFilter<double, double>::LOWPASS_IIT);
		lpf2.setMode(RAPT::rsOnePoleFilter<double, double>::LOWPASS_IIT);
	}

	void setInputAmplitude(double v) override
	{
		FMDFilter::setInputAmplitude(v);
	}

	void setFrequency(double v) override
	{
		masterPitch = jmap(v, -120.0, 105.0);
		masterFrequency = pToF(masterPitch);
		lpf1.setCutoff(pToF(jmap(masterPitch, -120.0, 120.0, 90.0, 180.0)));
		lpf2.setCutoff(pToF(jmap(masterPitch, -120.0, 120.0, 80.0, 130.0)));
	}

	void setResonance(double v) override
	{
		pmAmount = phaseModGraph.getValue(v);
		sineAmp = sineAmpGraph.getValue(v);
		sineToSquare = sineToSquareGraph.getValue(v);
		clipLevel = std::min(sineAmp, clipLevelGraph.getValue(v));
		noiseReduction = noiseGraph.getValue(v);
	}

	void setChaosAmount(double v) override
	{
		FMDFilter::setChaosAmount(v * 4);
	}

	void setSampleRate(double v) override
	{
		FMDFilter::setSampleRate(v);

		lpf1.setSampleRate(v);
		lpf2.setSampleRate(v);

		phasor.setSampleRate(v);
	}

	double getSample(double in) override
	{
		in = feedback + std::clamp<double>(-1 * in * inputAmplitude, -clipLevel, +clipLevel);

		double f = masterFrequency * in * fmAmount;
		double n = masterFrequency * noise.getSampleBipolar() * chaosAmount * noiseReduction;

		phasor.setFrequency(f + n);
		phasor.increment();
		phasorOut = phasor.getBipolarValue() + pmAmount * feedback;

		ellipseOut = sineAmp * ellipsoid(phasorOut, sineToSquare);

		feedback = lpf1.getSample(ellipseOut);
		feedback = lpf2.getSample(feedback);

		return feedback * .15;
	}

protected:

	// Resonance Graphs
	rsNodeBasedFunction<double> phaseModGraph;
	rsNodeBasedFunction<double> sineAmpGraph;
	rsNodeBasedFunction<double> sineToSquareGraph;
	rsNodeBasedFunction<double> clipLevelGraph;

	// Cutoff Graphs
	rsNodeBasedFunction<double> noiseGraph;

	// Objects
	RAPT::rsOnePoleFilter<double, double> lpf1, lpf2;
	Phasor phasor;
	elan::NoiseGenerator noise;

	// Internal states
	double phasorOut, ellipseOut, feedback;

	// Parameter states
	double masterPitch;
	double masterFrequency;
	double fmAmount;
	double pmAmount;
	double sineAmp;
	double sineToSquare;
	double clipLevel;
	double noiseReduction;

	double pToF(double v)
	{
		return 440.0 * (pow(2.0, (v - 69.0) / 12.0));
	}

	double ellipsoid(double x, double squareToSine)
	{
		double s;
		double c;
		rsSinCos(6.28318530717958647693 * x, &s, &c);

		x = pow(c, 2) + pow(s * squareToSine, 2);

		return (c / sqrt(x));
	}
};

class FlowerChildRev1 : public FMDFilter
{
public:
	FlowerChildRev1()
	{
		localName = "USA - Flower Child - LP24 [Clean]";
		englishName = localName;
		countryAbbreviation = "USA";
		helpText = "Created by the US in partnership with Japan, this is a clean-energy filter that was made to remain pure under hot operaiton and will only exhibit a slight howling when cranked to full resonance. Turning the resonance to zero will round off edges add warmth to the input.";		
		
		ColourGradient g;
		g.addColour(0.000, Colour(0xFF000000));
		g.addColour(0.167, Colour(0xFF004A8A));
		g.addColour(0.333, Colour(0xFF0093B9));
		g.addColour(0.500, Colour(0xFF5FB59C));
		g.addColour(0.667, Colour(0xFFB3DC77));
		g.addColour(0.833, Colour(0xFFF3FA82));
		g.addColour(1.000, Colour(0xFFFFFFFF));
		colorMap = g;

		setupCommon();

		fmpmNodeGraph.addNode(0, 0.21);
		fmpmNodeGraph.addNode(1, 0);
		fmpmNodeGraph.setNodeShapeType(1, rsFunctionNode<double>::EXPONENTIAL);
		fmpmNodeGraph.setNodeShapeParameter(1, .53);

		resVsFreqGraph.addNode(0, 0);
		resVsFreqGraph.addNode(0, 0);
		resVsFreqGraph.addNode(0, 0);
		resVsFreqGraph.setNodeShapeType(2, rsFunctionNode<double>::RATIONAL);
		resVsFreqGraph.setNodeShapeParameter(2, -0.38);
	}
	
	~FlowerChildRev1() = default;

	void setupCommon() override
	{
		FMDFilter::setupCommon();
		lpFilter1.setMode(RAPT::rsLadderFilter<double, double>::LP_6);
		lpFilter2.setMode(RAPT::rsLadderFilter<double, double>::LP_6);
	}

	void setInputAmplitude(double v) override
	{
		FMDFilter::setInputAmplitude(v * 2.3f);
	}

	void setFrequency(double v) override
	{
		FMDFilter::setFrequency(v);
		frequencyNormalized = frequency;
		updateFrequency();
	}

	void setResonance(double v) override
	{
		FMDFilter::setResonance(v);
		updateResonance();
	}

	void setChaosAmount(double v) override
	{
		FMDFilter::setChaosAmount(v);
	}

	void setSampleRate(double v) override
	{
		FMDFilter::setSampleRate(v);

		lpFilter1.setSampleRate(v);
		lpFilter2.setSampleRate(v);

		phasor.setSampleRate(v);

		maxNormFreq = sampleRate <= 44100.0 ? 0.928 : 1;

		updateFrequency();
	}

	double getSample(double in) override
	{		
		// clamp input signal		
		double inputSignal = clamp(inputAmplitude * -in, -1.0, +1.0);

		// add noise to signal
		inputSignal += noiseFilter.getSample(noise.getSampleBipolar()) * chaosAmount;

		// establish feedback signal
		inputSignal = selfMod_val + 0.035848699999999845 * inputSignal;

		// modulate oscillator with input signal
		double mod = 1.4 * inputSignal;
		double fm = cos(PI_z_2*fm_pm_crossfade) * mod;
		double pm = sin(PI_z_2*fm_pm_crossfade) * mod;

		phasor.setFrequency(frequency * fm);
		phasor.setPhaseOffset(pm);
		phasor.increment();

		current_osc_value = waveshape::sine(phasor.getUnipolarValue());

		// reduce oscillator amplitude
		current_osc_value *= 1.3;

		// filter feedback signal
		inputSignal = lpFilter1.getSample(current_osc_value);
		inputSignal = lpFilter2.getSample(inputSignal);

		// get oscillator self modulation value
		selfMod_val = inputSignal * selfMod_amp;

		// final out
		return inputSignal * 1.31;
	}

	protected:
	
	void updateFrequency()
	{
		double normalizedFreqInUse = jmap(std::min((double)frequency, maxNormFreq), 3.0, 161.0);
		frequency = elan::pitchToFreq(normalizedFreqInUse);
		fm_pm_crossfade = fmpmNodeGraph.getValue(normalizedFreqInUse);

		lpFilter1.setCutoff(frequency * 0.164312);
		lpFilter2.setCutoff(frequency * 0.366131);

		updateResonance();
	}

	virtual void updateResonance()
	{
		double resoToUse = resonance;
			
		resVsFreqGraph.moveNode(0, 0.0, resoToUse);

		if (sampleRate <= 44100)
		{
			resVsFreqGraph.moveNode(1, 0.732441, resoToUse);
			resVsFreqGraph.moveNode(2, 1.000, std::min(resoToUse, 0.649123));
		}
		else if (sampleRate <= 88200)
		{
			resVsFreqGraph.moveNode(1, 0.816054, resoToUse);
			resVsFreqGraph.moveNode(2, 1.000, std::min(resoToUse, 0.818713));
		}
		else
		{
			resVsFreqGraph.moveNode(1, 0.879599, resoToUse);
			resVsFreqGraph.moveNode(2, 1.000, std::min(resoToUse, 0.807018));
		}

		selfMod_amp = jmap(curve(resVsFreqGraph.getValue(resonance), .4), 0.0368, .6333);
		//selfMod_amp = jmap(curve(resonance, .4), 0.0368, .6333);
	}


	bool didPhasorCrossZero = true;
	double lastPhasorValue = 0;

	Phasor phasor;
	RAPT::rsLadderFilter<double, double> lpFilter1;
	RAPT::rsLadderFilter<double, double> lpFilter2;

	RAPT::rsNodeBasedFunction<double> fmpmNodeGraph;
	RAPT::rsNodeBasedFunction<double> resVsFreqGraph;

	double fm_pm_crossfade = 0;
	double current_osc_value = 0;
	double selfMod_amp = 1;
	double selfMod_val = 0;

	double frequencyNormalized = 0;
	double maxNormFreq;
};

class FlowerChildRev1Downsampled : public FlowerChildRev1
{
public:

	FlowerChildRev1Downsampled() : FlowerChildRev1()
	{
		localName = "Space Invaders LP6 [Downsampled]";
		englishName = localName;
		countryAbbreviation = "DIG";
		helpText = "Welcome to the future! Digital Tech filters will provide endless and clean filter energy. Will sound fuzzy and grungy due to the discrete sampling of the resonator circuit.";

		dsf.addNode(0, 0);
		dsf.addNode(1, sampleRate * 0.5);
		dsf.setNodeShapeParameter(1, -.99);
		dsf.setNodeShapeType(1, rsFunctionNode<double>::EXPONENTIAL);
	}

	void setSampleRate(double v) override
	{
		FlowerChildRev1::setSampleRate(v);

		downsampler.setSampleRate(sampleRate);
	}

	void setFrequency(double v) override
	{
		FMDFilter::setFrequency(v);
		frequencyNormalized = frequency;
		updateFrequency();
	}	

	void updateFrequency()
	{
		double normalizedFreqInUse = jmap<double>(std::min((double)frequency, maxNormFreq), 3.0, 161.0);
		frequency = elan::pitchToFreq(normalizedFreqInUse);
		fm_pm_crossfade = fmpmNodeGraph.getValue(normalizedFreqInUse);

		lpFilter1.setCutoff(frequency * /*JUCE_LIVE_CONSTANT(*/400/*)*/ * .001);

		updateResonance();
	}

	void setChaosAmount(double v) override
	{
		FMDFilter::setChaosAmount(v);

		live3 = /*JUCE_LIVE_CONSTANT(*/200/*)*/ * .01;
		live4 = /*JUCE_LIVE_CONSTANT(*/1000/*)*/ * .01;
		live5 = /*JUCE_LIVE_CONSTANT(*/600/*)*/ * .01;
		live6 = /*JUCE_LIVE_CONSTANT(*/100/*)*/ * .01;
		dsf.setNodeShapeParameter(1, /*JUCE_LIVE_CONSTANT(*/-90/*)*/ * .001);
		dsf.moveNode(0, 0, /*JUCE_LIVE_CONSTANT(*/0/*)*/ * .001 * sampleRate * .5);
		dsf.moveNode(1, 1, /*JUCE_LIVE_CONSTANT(*/50/*)*/*.001 * sampleRate*.5);
	}

	double live3, live4, live5, live6;

	double getSample(double in) override
	{
		// clamp input signal

		double inputSignal = clamp(inputAmplitude * -in, -1.0, +1.0) * 0.036;

		// establish feedback signal
		inputSignal += selfMod_val;

		// modulate oscillator with input signal
		double mod = 1.4 * inputSignal;
		double fm = cos(PI_z_2 * fm_pm_crossfade) * mod;
		double pm = sin(PI_z_2 * fm_pm_crossfade) * mod;

		phasor.setFrequency(frequency * fm * live5);
		phasor.setPhaseOffset(pm * live6);
		phasor.increment();

 		downsampler.setSamplingFrequency(frequency * live3 + dsf.getValue(live4 * abs(mod)));
		downsampler.increment(phasor.getUnipolarValue ());
		double downsampledPhasor = downsampler.getSampledValue();

		current_osc_value = waveshape::sine(downsampledPhasor);

		// reduce oscillator amplitude
		current_osc_value *= 1.3;

		double inputSignalPreFiltered = inputSignal;

		// filter feedback signal
		inputSignal = lpFilter1.getSample(current_osc_value);

		// get oscillator self modulation value
		selfMod_val = inputSignal * selfMod_amp;

		lastPhasorValue = phasor.getUnipolarValue();

		// final out
		return inputSignal * 1.4;
	}

	SampleAndHold downsampler;

	RAPT::rsNodeBasedFunction<double> dsf;
};

class FlowerChildRev2 : public FlowerChildRev1
{
public:
	FlowerChildRev2()
	{
		localName = "USA - Flower Child - LP24 [Aggressive]";
		englishName = localName;
		countryAbbreviation = "USA";
		helpText = "Due to the impending filter wars, the US repurposed its clean filters with destructive power. Turning resonance to full will create high powered growls. Turning the resonance to zero will add warmth to the input.";
		
		ColourGradient g;
		g.addColour(0.000, Colour(0xff000000));
		g.addColour(0.143, Colour(0xff7f0000));
		g.addColour(0.286, Colour(0xffb30000));
		g.addColour(0.429, Colour(0xffe63300));
		g.addColour(0.571, Colour(0xfff8782b));
		g.addColour(0.714, Colour(0xffffc080));
		g.addColour(0.857, Colour(0xffffe6cc));
		g.addColour(1.000, Colour(0xffffffff));
		colorMap = g;

		fmpmNodeGraph.addNode(0, 0.2);
		fmpmNodeGraph.addNode(1, 0);
		fmpmNodeGraph.setNodeShapeType(1, rsFunctionNode<double>::EXPONENTIAL);
		fmpmNodeGraph.setNodeShapeParameter(1, .53);
	}
	~FlowerChildRev2() = default;

	double getSample(double in) override
	{		
		// clamp input signal
		double inputSignal = clamp(inputAmplitude * -in, -1.198, +1.198);

		// add noise to signal
		inputSignal += noiseFilter.getSample(noise.getSampleBipolar()) * chaosAmount;

		// establish feedback signal
		inputSignal = selfMod_val + 0.035848699999999845 * inputSignal;

		// modulate oscillator with input signal
		double mod = 1.4 * inputSignal;
		double fm = cos(PI_z_2*fm_pm_crossfade) * mod;
		double pm = sin(PI_z_2*fm_pm_crossfade) * mod;

		phasor.setFrequency(frequency * fm);
		phasor.setPhaseOffset(pm);
		phasor.increment();
		current_osc_value = waveshape::ellipse(phasor.getUnipolarValue(), 0, 0, 1, ellipse_c_value);

		// reduce oscillator amplitude
		current_osc_value *= .1;

		// filter feedback signal
		inputSignal = lpFilter1.getSample(current_osc_value);
		inputSignal = lpFilter2.getSample(inputSignal);

		// get oscillator self modulation value
		selfMod_val = inputSignal * .465;

		// final out
		return inputSignal * 5.22;
	}

	double ellipse_c_value = -1;

protected:
	void updateResonance() override
	{
		double resoToUse = resonance;
		
		resVsFreqGraph.moveNode(0, 0.0, resoToUse);

		if (sampleRate <= 44100)
		{
			resVsFreqGraph.moveNode(1, 0.816054, resoToUse);
			resVsFreqGraph.moveNode(2, 1.000, std::min(resoToUse, 0.602339));
		}
		else if (sampleRate <= 88200)
		{
			resVsFreqGraph.moveNode(1, 0.902657, resoToUse);
			resVsFreqGraph.moveNode(2, 1.000, std::min(resoToUse, 0.654971));
		}
		else
		{
			resVsFreqGraph.moveNode(1, 0.977649, resoToUse);
			resVsFreqGraph.moveNode(2, 1.000, std::min(resoToUse, 0.760234));
		}

		ellipse_c_value = jmap(curve(resVsFreqGraph.getValue(frequencyNormalized), -.6), -1.0, .00001/*0.005*/);
	}
};

class Human : public FMDFilter
{
public:
	Human()
	{
		fbFilter.setMode(rsStateVariableFilter<double, double>::BELL);
		dcFilter.setMode(RAPT::rsLadderFilter<double, double>::HP_6);
		dcFilter.setCutoff(5);

		mod11Graph.addNode(0.0, 2.92396);
		mod11Graph.addNode(1.0, -1.7544);
		mod11Graph.setNodeShapeType(1, rsFunctionNode<double>::RATIONAL);
		mod11Graph.setNodeShapeParameter(1, 0.785442);

		resVfreqGraph.addNode(0, 0);
		resVfreqGraph.addNode(0.77, 1.0);
		resVfreqGraph.addNode(1, 0.2);

		resVfreqGraph.setNodeShapeType(2, rsFunctionNode<double>::RATIONAL);
		resVfreqGraph.setNodeShapeParameter(2, 0.57);
	}

	void setFrequency(double v) override
	{
		normalizedFrequency = v;
		updateFrequency();
	}

	void setResonance(double v) override
	{
		resonance = v;
		updateResonance();
	}

	void setChaosAmount(double v) override
	{
		chaosAmount = v;
		updateChaos();
	}

	void setSampleRate(double v) override
	{
		sampleRate = v;

		fbFilter.setSampleRate(v);
		dcFilter.setSampleRate(v);
		phasor1.setSampleRate(v);
		phasor2.setSampleRate(v);

		if (sampleRate <= 44100)
		{
			maxPitch = 115.57;
			resDropPoint = 0.78;
			chaosMax = 0.64;
		}
		else if (sampleRate <= 88200)
		{
			maxPitch = 128.7;
			resDropPoint = 0.78;
			chaosMax = 1.0;
		}
		else if (sampleRate <= 132300)
		{
			maxPitch = 137.0;
			resDropPoint = 0.83;
			chaosMax = 0.856;
		}
		else if (sampleRate <= 176400)
		{
			maxPitch = 137.0;
			resDropPoint = 0.91;
			chaosMax = 1.0;
		}
		else if (sampleRate <= 220500)
		{
			maxPitch = 137.0;
			resDropPoint = 1.0;
			chaosMax = 1.0;
		}
		else if (sampleRate <= 264600)
		{
			maxPitch = 137.0;
			resDropPoint = 0.78;
			chaosMax = 1.0;
		}
		else
		{
			maxPitch = 137.0;
			resDropPoint = 0.78;
			chaosMax = 1.0;
		}

		updateFrequency();
		updateChaos();
	}

protected:
	rsStateVariableFilter<double, double> fbFilter;
	RAPT::rsLadderFilter<double, double> dcFilter;
	Phasor phasor1;
	Phasor phasor2;

	RAPT::rsNodeBasedFunction<double> mod11Graph;
	RAPT::rsNodeBasedFunction<double> resVfreqGraph;

	double osc1Value;
	double osc2Value;

	double lastOutValue;

	double osc1ModSelf;
	double osc2ModSelf;

	double mod11;

	double signal1;
	double signal2;

	double normalizedFrequency;
	double maxPitch;
	double resDropPoint;
	double chaosMax;

	void calculateFilteredSignal(double in)
	{
		double inputSignal = clamp(in * inputAmplitude, -2.0, +2.0);

		// establish feedback signal
		inputSignal = fbFilter.getSample(osc2Value + osc1ModSelf + inputSignal + lastOutValue);

		// osc1
		{
			// mod
			double fm = -2.2784975504539248 * inputSignal;

			phasor1.setFrequency(frequency * fm);
			phasor1.increment();
			osc1Value = waveshape::sine(phasor1.getUnipolarValue());

			// amp
			osc1Value *= 0.177898; // decrease osc1 amp at high frequency to prevent filter explosion and tame resonance
		}

		// osc 1 & 2 self feedback
		osc1ModSelf = osc1Value * mod11;
		osc2ModSelf = osc2Value * -0.395833;

		// osc2
		{
			// mod
			double fm = 0.0333333 + 2.7429968062 * osc1Value + osc2ModSelf; // set osc2 fm bias from 0.03 to 0 for a less biased resonance waveshape

			phasor2.setFrequency(frequency * fm);
			phasor2.increment();
			osc2Value = waveshape::sine(phasor2.getUnipolarValue());

			// amp
			osc2Value *= 0.71597;
		}

		lastOutValue = (osc1Value + osc2Value) * 0.1443178;
	}

	void updateFrequency()
	{
		frequency = elan::pitchToFreq(std::min(jmap(normalizedFrequency, -0.38, 137.0), maxPitch));
		updateResonance();
	}
	void updateResonance()
	{
		if (resDropPoint != 1.0)
		{
			resVfreqGraph.moveNode(0, 0.0, resonance);
			resVfreqGraph.moveNode(1, resDropPoint, resonance);
			resVfreqGraph.moveNode(2, 1.0, std::min(resonance, 0.2));
			double newResNormalized = resVfreqGraph.getValue(normalizedFrequency);
			mod11 = mod11Graph.getValue(newResNormalized);
		}
		else
		{
			mod11 = mod11Graph.getValue(resonance);
		}
	}
	void updateChaos()
	{
		fbFilter.setGain(dbToAmp(std::min(chaosAmount, chaosMax) * 14.9));
	}
};

class Human_BP6 : public Human
{
public:
	double getSample(double in) override
	{
		calculateFilteredSignal(in);
		return dcFilter.getSample(osc1Value) * 2.0;
	}
};

class Human_LP6 : public Human
{
public:
	double getSample(double in) override
	{
		calculateFilteredSignal(in);
		return dcFilter.getSample(osc1Value + osc2Value);
	}
};

class Human_LP12 : public Human
{
public:
	double getSample(double in) override
	{
		calculateFilteredSignal(in);
		return dcFilter.getSample(osc2Value);
	}
};

class Yellowjacket_BP : public FMDFilter
{
public:
	Yellowjacket_BP()
	{
		localName = "Yellowjacket BP";
		englishName = localName;
		countryAbbreviation = "GB";
		helpText = "The Yellowjacket filter was created for extreme firepower able to operate at the most intense energetic loads. It generally sounds grindy and heavily overdriven when resonance easily producing square waves at most settings.";
		//colorMap = 0;

		filter.setMode(RAPT::rsLadderFilter<double, double>::LP_6);

		ellipseCGraph.addNode(0, 7.6024);
		ellipseCGraph.addNode(1, .00001);
		ellipseCGraph.setNodeShapeType(1, rsFunctionNode<double>::EXPONENTIAL);
		ellipseCGraph.setNodeShapeParameter(1, 0.99);

		feedbackGainGraph.addNode(0, +20);
		feedbackGainGraph.addNode(1, -0.0429102);
		feedbackGainGraph.setNodeShapeType(1, rsFunctionNode<double>::EXPONENTIAL);
		feedbackGainGraph.setNodeShapeParameter(1, 0.99);

		resVfreqGraph.addNode(0, 0);
		resVfreqGraph.addNode(0.77, 1.0);
		resVfreqGraph.addNode(1, 0.2);

		resVfreqGraph.setNodeShapeType(2, rsFunctionNode<double>::RATIONAL);
		resVfreqGraph.setNodeShapeParameter(2, 0.57);
	}


	void setFrequency(double v) override
	{
		FMDFilter::setFrequency(v);
		frequencyNormalized = frequency;
		updateFrequency();
	}

	void setResonance(double v) override
	{
		FMDFilter::setResonance(v);
		updateResonance();
	}

	void setChaosAmount(double v) override
	{
		FMDFilter::setChaosAmount(v);
		updateFilterCutoff();
	}

	void setSampleRate(double v) override
	{
		FMDFilter::setSampleRate(v);

		filter.setSampleRate(sampleRate);
		phasor.setSampleRate(sampleRate);

		if (sampleRate <= 44100)
		{
			maxPitch = 87.7;
			resDropPoint = 0.77;
		}
		else if (sampleRate <= 88200)
		{
			maxPitch = 96.0;
			resDropPoint = 0.82;
		}
		else if (sampleRate <= 132300)
		{
			maxPitch = 96.0;
			resDropPoint = 0.83;
		}
		else if (sampleRate <= 176400)
		{
			maxPitch = 96.0;
			resDropPoint = 0.86;
		}
		else if (sampleRate <= 220500)
		{
			maxPitch = 96.0;
			resDropPoint = 0.89;
		}
		else if (sampleRate <= 264600)
		{
			maxPitch = 96.0;
			resDropPoint = 0.90;
		}
		else
		{
			maxPitch = 96.0;
			resDropPoint = 0.95;
		}

		updateFrequency();
	}

	double getSample(double in) override
	{
		// input
		double inputSignal = clamp(inputAmplitude * 4.0 * in, -7.0, +7.0); // 2.6615 was the original input clamp level

		// establish feedback signal
		inputSignal = oscSelfMod + 1.04025 * inputSignal + lastOutValue;

		// mod
		phasor.setFrequency(frequency * 1.9400625 * inputSignal); // Increase freq modulation constant for grittier sound and/or go negative for a chaotic alternative
		phasor.increment();
		oscValue = waveshape::ellipse(phasor.getUnipolarValue(), 0.0, -0.71286768918541499, 0.70129855105756955, ellipseC);

		//  amp
		oscValue *= 0.635417; // Add saturation here for interesting distorted sound

		// main feedback filter	
		inputSignal = filter.getSample(oscValue);

		// osc self feedback
		oscSelfMod = inputSignal * 20.0;

		// amplitude envelope
		double out = 1.3892758936011171 * oscValue; // Replace oscValue with inputSignal for lowpass sound

		lastOutValue = out * 0.5 * feedbackGain; // TODO: remove this 0.5 multiplier by multiplying graph values, also place feedback gain value in the first line of code

		return out;
	}

protected:
	Phasor phasor;
	RAPT::rsLadderFilter<double, double> filter;

	RAPT::rsNodeBasedFunction<double> frequencyGraph;
	RAPT::rsNodeBasedFunction<double> ellipseCGraph;
	RAPT::rsNodeBasedFunction<double> feedbackGainGraph;

	RAPT::rsNodeBasedFunction<double> resVfreqGraph;

	double oscValue;
	double ellipseC;

	double feedbackGain;
	double lastOutValue;
	double oscSelfMod;

	double maxPitch;
	double frequencyNormalized;
	double resDropPoint = 0.77;

	void updateFrequency()
	{
		frequency = elan::pitchToFreq(std::min(jmap(frequencyNormalized, -156.0, 96.0), maxPitch));
		updateFilterCutoff();
		updateResonance();
	}

	void updateFilterCutoff()
	{
		filter.setCutoff(frequency * jmap(chaosAmount, 4.56415, 0.972007));
	}

	void updateResonance()
	{
		resVfreqGraph.moveNode(0, 0.0, resonance);
		resVfreqGraph.moveNode(1, resDropPoint, resonance);
		double newResNormalized = resVfreqGraph.getValue(frequencyNormalized);

		ellipseC = ellipseCGraph.getValue(newResNormalized);
		feedbackGain = feedbackGainGraph.getValue(newResNormalized);
	}
};

class SuperLove_LP18 : public FMDFilter
{
public:
	SuperLove_LP18()
	{
		localName = String(CharPointer_UTF8("\xe6\x97\xa5\xe6\x9c\xac - \xe3\x82\xb9\xe3\x83\xbc\xe3\x83\x91\xe3\x83\xbc\xe3\x83\xa9\xe3\x83\x96 LP6"));
		englishName = "JP - Superlove - LP18";
		countryAbbreviation = "JP";
		helpText = "Before the filter wars, Japan invented a perfect source of energy with multiple modes of operation. This is a warm bass-heavy filter with highly stable resonance and self-oscillation.";

		ColourGradient g;
		g.addColour(0.00, Colour::fromRGB(0, 0, 0));
		g.addColour(0.41, Colour::fromRGB(37, 142, 87));
		g.addColour(0.70, Colour::fromRGB(182, 167, 255));
		g.addColour(0.86, Colour::fromRGB(250, 186, 255));
		g.addColour(1.0f, Colour::fromRGB(255, 255, 255));
		colorMap = g; 

		filter.setMode(RAPT::rsLadderFilter<double, double>::LP_18);
		dcfilter.setMode(RAPT::rsLadderFilter<double, double>::HP_18);
		dcfilter.setCutoff(10);

		resonanceGraph.addNode(0, 0);
		resonanceGraph.addNode(1, -2.7175);
		resonanceGraph.setNodeShapeType(1, rsFunctionNode<double>::EXPONENTIAL);
		resonanceGraph.setNodeShapeParameter(1, -0.85);

		noiseGraph.addNode(0,    0.00);
		noiseGraph.addNode(0.75, 0.05);
		noiseGraph.addNode(1,    0.10);
		noiseGraph.setNodeShapeType(1, rsFunctionNode<double>::EXPONENTIAL);
		noiseGraph.setNodeShapeParameter(1, -0.7);
		noiseGraph.setNodeShapeType(2, rsFunctionNode<double>::EXPONENTIAL);
		noiseGraph.setNodeShapeParameter(2, +0.6);
			 
		setChaosAmount(0.5);
		setPhase(0);
		setResonance(0);
	}

	void setFrequency(double v) override
	{
		FMDFilter::setFrequency(v);
		filter.setCutoff(clamp(elan::pitchToFreq(jmap(frequency, -12.0, +135.0)), 0.0, 0.5 * sampleRate));
	}

	void setResonance(double v) override
	{
		FMDFilter::setResonance(v);
		mod = resonanceGraph.getValue(resonance);
	}

	void setChaosAmount(double v) override
	{
		FMDFilter::setChaosAmount(v);
		shape = chaosAmount;
		noiseAmp = noiseGraph.getValue(v);
	}

	void setPhase(double v)
	{
		phase = v + 0.75; // offset needed for waveshape::trisaw to be correct starting phase [not currently used]
	}

	void setSampleRate(double v) override
	{
		sampleRate = v;

		filter.setSampleRate(v);
		dcfilter.setSampleRate(v);
	}

	/* To solve the problem of the input getting waveshaped/split too quicky, I did this. Not sure if the /4 feedbackSignal helps
	* since that is being already boosted/reduced by mod. I multiplied mod by 10 in the change function. Also super important is
	* having control of the phase +/- 1.0.
		// input and feedback signal
		feedbackSignal = mod * feedbackSignal + inputAmplitude * in;

		// resonator
		double oscValue = -waveshape::trisaw(feedbackSignal/4.f + phase * JUCE_LIVE_CONSTANT(1000)*.001, shape);

		// feedback filter
		feedbackSignal = filter.getSample(oscValue / 10);

		// final out
		return -dcfilter.getSample(feedbackSignal) * outputAmplitude * 10;
	*/

	double getSample(double in) override
	{
		// input and feedback signal
		feedbackSignal = mod * feedbackSignal + inputAmplitude * in;

		// resonator live constant 343 seems to be a magic number when shape is near 1;
		//double oscValue = -waveshape::trisaw(feedbackSignal + phase * JUCE_LIVE_CONSTANT(1000) * .001, shape);
		//double oscValue = -waveshape::trisaw(feedbackSignal + phase *.343, shape);
		double pm = noiseFilter.getSample(noise.getSampleBipolar()) * noiseAmp;
		double oscValue = -waveshape::trisaw(feedbackSignal + 0.25725 + pm, shape);

		// feedback filter
		feedbackSignal = filter.getSample(oscValue);

		// final out
		return dcfilter.getSample(feedbackSignal) * 1.02;
	}

	protected:

	RAPT::rsLadderFilter<double, double> filter;
	RAPT::rsLadderFilter<double, double> dcfilter;
	RAPT::rsNodeBasedFunction<double> resonanceGraph;
	RAPT::rsNodeBasedFunction<double> noiseGraph;

	double phase;
	double shape = 0.5;
	double mod = -2.7175;
	double noiseAmp = 0;

	double feedbackSignal = 0;
};

class SuperLove_LP24 : public SuperLove_LP18
{
public:
	SuperLove_LP24() : SuperLove_LP18()
	{
		localName = String(CharPointer_UTF8("\xe6\x97\xa5\xe6\x9c\xac - \xe3\x82\xb9\xe3\x83\xbc\xe3\x83\x91\xe3\x83\xbc\xe3\x83\xa9\xe3\x83\x96 - LP12"));
		englishName = "JP - Superlove - LP24";
		countryAbbreviation = "JP";
		helpText = "Before the filter wars, Japan was the first to invent a perfect source of energy with multiple modes of operation. This is a warm bass-heavy filter with highly stable resonance and self-oscillation.";

		filter.setMode(RAPT::rsLadderFilter<double, double>::LP_24);

		dcfilter.setMode(RAPT::rsLadderFilter<double, double>::HP_6);
		dcfilter.setCutoff(5);
	}
};

class SuperLove_HP6 : public FMDFilter
{
public:
	SuperLove_HP6()
	{
		localName = String(CharPointer_UTF8("\xe6\x97\xa5\xe6\x9c\xac - \xe3\x82\xb9\xe3\x83\xbc\xe3\x83\x91\xe3\x83\xbc\xe3\x83\xa9\xe3\x83\x96 - HP [HARD]"));
		englishName = "JP - Superlove - HP6 [HARD]";
		countryAbbreviation = "JP";
		helpText = "Before the filter wars, Japan was the first to invent a perfect source of energy with multiple modes of operation. Turning up resonance and input amplitude will cause the filter to scream so hard it will become pure noise.";

		ColourGradient g;
		g.addColour(0.00, Colour::fromRGB(0, 0, 0));
		g.addColour(0.41, Colour::fromRGB(37, 142, 87));
		g.addColour(0.70, Colour::fromRGB(182, 167, 255));
		g.addColour(0.86, Colour::fromRGB(250, 186, 255));
		g.addColour(1.0f, Colour::fromRGB(255, 255, 255));
		colorMap = g;

		lpFilter.setMode(RAPT::rsLadderFilter<double, double>::LP_6);
		hpFilter.setMode(RAPT::rsLadderFilter<double, double>::HP_6);

		resonanceGraph.addNode(0, -0.2);
		resonanceGraph.addNode(1, +1.3);
		resonanceGraph.setNodeShapeType(1, rsFunctionNode<double>::EXPONENTIAL);
		resonanceGraph.setNodeShapeParameter(1, -0.85);

		setChaosAmount(0.5);
		setPhase(0);
		setResonance(0);
	}

	void setFrequency(double v) override
	{
		FMDFilter::setFrequency(v);
		hpFilter.setCutoff(clamp(elan::pitchToFreq(jmap(frequency, -12.0, +135.0)), 0.0, 0.5 * sampleRate));
	}

	void setResonance(double v) override
	{
		FMDFilter::setResonance(v);
		mod = resonanceGraph.getValue(resonance);
	}

	void setChaosAmount(double v) override
	{
		FMDFilter::setChaosAmount(v);
		shape = 1 - chaosAmount;
	}

	void setPhase(double v)
	{
		phase = v + 0.75; // offset needed for waveshape::trisaw to be correct starting phase
	}

	void setSampleRate(double v) override
	{
		sampleRate = v;

		lpFilter.setSampleRate(v);
		lpFilter.setCutoff(sampleRate * 0.5);
		hpFilter.setSampleRate(v);
	}

	double getSample(double in) override
	{
		// input and feedback signal
		feedbackSignal = mod * feedbackSignal + in * inputAmplitude;

		// resonator
		double oscValue = -waveshape::trisaw(feedbackSignal + phase, shape);

		// feedback filter
		feedbackSignal = lpFilter.getSample(oscValue*.1);
		feedbackSignal = hpFilter.getSample(feedbackSignal);
		feedbackSignal *= 10;

		// final out
		return -feedbackSignal * .31;
	}

protected:

	RAPT::rsLadderFilter<double, double> lpFilter;
	RAPT::rsLadderFilter<double, double> hpFilter;
	RAPT::rsNodeBasedFunction<double> resonanceGraph;

	double phase;
	double shape;
	double mod;

	double feedbackSignal = 0;
};

class SuperLove_BP6 : public FMDFilter
{
public:
	SuperLove_BP6()
	{
		localName = String(CharPointer_UTF8("\xe6\x97\xa5\xe6\x9c\xac - \xe3\x82\xb9\xe3\x83\xbc\xe3\x83\x91\xe3\x83\xbc\xe3\x83\xa9\xe3\x83\x96 BP6 [HARD]"));
		englishName = "JP - Superlove - BP6";
		countryAbbreviation = "JP";
		helpText = "Before the filter wars, Japan was the first to invent a perfect source of energy with multiple modes of operation. Turning up resonance and input amplitude will cause the filter to scream so hard it will become pure noise.";
		
		ColourGradient g;
		g.addColour(0.00, Colour::fromRGB(0, 0, 0));
		g.addColour(0.41, Colour::fromRGB(37, 142, 87));
		g.addColour(0.70, Colour::fromRGB(182, 167, 255));
		g.addColour(0.86, Colour::fromRGB(250, 186, 255));
		g.addColour(1.0f, Colour::fromRGB(255, 255, 255));
		colorMap = g;

		filter.setMode(RAPT::rsLadderFilter<double, double>::BP_6_6);

		resonanceGraph.addNode(0, -0.2);
		resonanceGraph.addNode(1, +1.3);
		resonanceGraph.setNodeShapeType(1, rsFunctionNode<double>::EXPONENTIAL);
		resonanceGraph.setNodeShapeParameter(1, -0.85);

		setChaosAmount(0.5);
		setPhase(0);
		setResonance(0);
	}

	void setFrequency(double v) override
	{
		FMDFilter::setFrequency(v);
		filter.setCutoff(clamp(elan::pitchToFreq(jmap(frequency, -12.0, +135.0)), 0.0, 0.5 * sampleRate));
	}

	void setResonance(double v) override
	{
		FMDFilter::setResonance(v);
		mod = resonanceGraph.getValue(resonance);
	}

	void setChaosAmount(double v) override
	{
		FMDFilter::setChaosAmount(v);
		shape = 1 - chaosAmount;
	}

	void setPhase(double v)
	{
		phase = v + 0.75;
	}

	void setSampleRate(double v) override
	{
		FMDFilter::setSampleRate(v);
		filter.setSampleRate(sampleRate);
	}

	double getSample(double in) override
	{
		// input and feedback signal
		feedbackSignal = mod * feedbackSignal + in * inputAmplitude;

		// resonator
		double oscValue = -waveshape::trisaw(feedbackSignal + phase, shape);

		// feedback filter
		feedbackSignal = filter.getSample(oscValue*.1);
		feedbackSignal *= 10;

		// final out
		return feedbackSignal;
	}

protected:

	RAPT::rsLadderFilter<double, double> filter;
	RAPT::rsNodeBasedFunction<double> resonanceGraph;

	double phase;
	double shape;
	double mod;

	double feedbackSignal = 0;
};

/*
use superlove hp filter for the basis of a highpass version, experiment with ellipse/shape and trisaw/shape
*/
class ChaoticPhaseLocking : public FMDFilter
{
public:
	ChaoticPhaseLocking()
	{
		filter.setMode(RAPT::rsLadderFilter<double, double>::LP_12);
		dcfilter.setMode(RAPT::rsLadderFilter<double, double>::HP_6);
		dcfilter.setCutoff(5);

		resonanceGraph.addNode(0, 0.1);
		resonanceGraph.addNode(1, 20);
		resonanceGraph.setNodeShapeType(1, rsFunctionNode<double>::EXPONENTIAL);
		resonanceGraph.setNodeShapeParameter(1, -0.85);

		setFrequency(-24);
		setChaosAmount(1);
		setPhase(0);
		setResonance(0);
	}

	void setFrequency(double v) override
	{
		frequency = elan::pitchToFreq(jmap(v, -12.0, +135.0));
		filter.setCutoff(clamp(frequency, 0.0, 0.5 * sampleRate));
	}

	void setResonance(double v) override
	{
		FMDFilter::setResonance(v);
		mod = resonanceGraph.getValue(resonance);
	}

	void setChaosAmount(double v) override
	{
		shape = 1 - v;
	}

	void setPhase(double v)
	{
		phase = v;
	}

	void setSampleRate(double v) override
	{
		sampleRate = v;

		filter.setSampleRate(v);
		dcfilter.setSampleRate(v);
	}

	double getSample(double in) override
	{
		// input and feedback signal
		feedbackSignal = mod * feedbackSignal + (-in) * inputAmplitude;

		// resonator
		double oscValue = waveshape::ellipse(feedbackSignal + phase, 0, 0, 1, shape);

		// feedback filter
		feedbackSignal = filter.getSample(oscValue);

		// final out
		return -dcfilter.getSample(feedbackSignal);
	}

protected:

	RAPT::rsLadderFilter<double, double> filter;
	RAPT::rsLadderFilter<double, double> dcfilter;
	RAPT::rsNodeBasedFunction<double> resonanceGraph;

	double phase;
	double shape;
	double mod;

	double feedbackSignal = 0;
};

class SinusoidResonator_LP : public FMDFilter
{
public:
	SinusoidResonator_LP()
	{
		localName = String(CharPointer_UTF8("\xd0\xa0\xd0\x9e\xd0\xa1\xd0\xa1\xd0\x98\xd0\xaf - \xd0\xa1\xd0\x98\xd0\x9d\xd0\xa3\xd0\xa1\xd0\x9e\xd0\x98\xd0\x94\xd0\x90 [SINUSOID] - LP"));
		englishName = "USSR - Sinusoid Resonator - LP";
		countryAbbreviation = "USSR";
		helpText = "One of the later FMDs created by Russia based on earlier prototpyes with multiple modes each creating one of the primary shapes. This filter produces chaotic sinusoids and can sound growling and grinding or soft and bubbly";
		
		ColourGradient g;
		g.addColour(0.00, Colour(0xFF000000));
		g.addColour(0.13, Colour(0xFF301D1D));
		g.addColour(0.61, Colour(0xFFD28000));
		g.addColour(1.00, Colour(0xFFFFFFFF));
		colorMap = g;

		filter.setMode(RAPT::rsLadderFilter<double, double>::LP_6);

		dcfilter.setMode(RAPT::rsLadderFilter<double, double>::HP_6);
		dcfilter.setCutoff(5);

		resVfreqGraph.addNode(0, 0);
		resVfreqGraph.addNode(0.74, 1.0);
		resVfreqGraph.addNode(1, 0.15);

		resVfreqGraph.setNodeShapeType(2, rsFunctionNode<double>::RATIONAL);
		resVfreqGraph.setNodeShapeParameter(2, 0.557);
	}

	void setInputAmplitude(double v) override
	{
		inputAmplitude = v * 2;
	}

	void setFrequency(double v) override
	{
		frequencyNormalized = v;
		updateFrequency();
	}

	void setResonance(double v) override // Stable Resonance
	{
		FMDFilter::setResonance(v);
		updateResonance();
	}

	void setChaosAmount(double v) override // Chaotic Resonance
	{
		phaseModAmt = jmap(v, .256, .166);
	}

	void setSampleRate(double v) override
	{
		sampleRate = v;

		filter.setSampleRate(v);
		dcfilter.setSampleRate(v);
		phasor1.setSampleRate(v);
		phasor2.setSampleRate(v);

		if (sampleRate <= 44100)
		{
			maxFreqNorm = 0.855;
			resDropPoint = 0.74;
		}
		else if (sampleRate <= 88200)
		{
			maxFreqNorm = 0.9;
			resDropPoint = 0.75;
		}
		else if (sampleRate <= 132300)
		{
			maxFreqNorm = 0.9;
			resDropPoint = 0.82;
		}
		else if (sampleRate <= 176400)
		{
			maxFreqNorm = 0.9;
			resDropPoint = 0.88;
		}
		else if (sampleRate <= 220500)
		{
			maxFreqNorm = 0.9;
			resDropPoint = 0.92;
		}
		else
		{
			maxFreqNorm = 0.955;
			resDropPoint = 0.92;
		}

		updateFrequency();
	}

	double getSample(double in) override
	{
		// input oscillator
		double inputSignal = inputAmplitude * in;

		// establish feedback signal
		inputSignal = osc2Value + osc1SelfMod + inputSignal;

		// osc1
		{
			// mod
			double freq = frequency * osc1Ratio * freqModAmt * .1 * inputSignal;

			phasor1.setFrequency(clamp(freq, -sampleRate*0.5, +sampleRate*0.5));
			phasor1.setPhaseOffset(inputSignal * phaseModAmt);
			phasor1.increment();
			osc1Value = waveshape::ellipse(phasor1.getUnipolarValue(), 0, 0, 1, 0.00749);

			// amp
			osc1Value *= .5; // .05 for alternative triangle resonator
		}

		// main feedback filters
		inputSignal = filter.getSample(osc1Value);

		// osc 1 & 2 self feedback
		osc1SelfMod = inputSignal;
		osc2SelfMod = osc2Value;

		// osc2
		double out;
		{
			double fm = freqModAmt * 4.53126 * inputSignal + osc2SelfMod * 3;
			double freq = frequency * osc2Ratio * fm;

			phasor2.setFrequency(clamp(freq, -sampleRate*0.5, +sampleRate*0.5));
			phasor2.increment();
			osc2Value = waveshape::sine(phasor2.getUnipolarValue()); //morph from sine to square or tri to saw or sine to saw for alternative tones

			out = osc2Value;

			// clamp
			osc2Value *= 10;
		}

		return -dcfilter.getSample(out) * 4.6;
	}

protected:
	RAPT::rsLadderFilter<double, double> filter;
	RAPT::rsLadderFilter<double, double> dcfilter;
	Phasor phasor1;
	Phasor phasor2;

	Clipper clipper;

	RAPT::rsNodeBasedFunction<double> resVfreqGraph;

	double freqModAmt;
	double phaseModAmt;
	double freqRatio;
	double osc1Ratio;
	double osc2Ratio;

	double osc1Value;
	double osc2Value;
	double osc1SelfMod;
	double osc2SelfMod;

	double frequencyNormalized;
	double maxFreqNorm = 1.0;
	double freqNormInUse = 1.0;
	double resDropPoint = 0.74;

	void updateFrequency()
	{
		freqNormInUse = std::min(frequencyNormalized, maxFreqNorm);
		
		frequency = elan::pitchToFreq(jmap(freqNormInUse, -72.96, 69.76));
		filter.setCutoff(frequency * jmap(curve(freqNormInUse, -.36), 0.248387, 0.0927813));
		osc2Ratio = jmap(freqNormInUse, 0.015625, 1.58);
		osc1Ratio = (osc2Ratio - 0.015625);

		updateResonance();
	}
	void updateResonance()
	{
		resVfreqGraph.moveNode(0, 0.0, resonance);
		resVfreqGraph.moveNode(1, resDropPoint, resonance);
		double newResNormalized = resVfreqGraph.getValue(frequencyNormalized);

		freqModAmt = jmap(newResNormalized, 10.0, 484.43);
	}
};

class TriangleResonator_LP : public SinusoidResonator_LP
{
public:
	TriangleResonator_LP() : SinusoidResonator_LP()
	{
		localName = String(CharPointer_UTF8("\xd0\xa0\xd0\x9e\xd0\xa1\xd0\xa1\xd0\x98\xd0\xaf - \xd0\xa2\xd0\xa0\xd0\x95\xd0\xa3\xd0\x93\xd0\x9e\xd0\x9b\xd0\xac\xd0\x9d\xd0\x98\xd0\x9a [TRIANGLE] - LP"));
		englishName = "Triangle Resonator LP";
		countryAbbreviation = "USSR";
		helpText = "One of the later FMDs created by Russia based on earlier prototpyes with multiple modes each creating one of the primary shapes. This filter produces chaotic trianguloids and can sound growling and grinding or soft and fuzzy.";
	
		filter.setResonance(0.3);

		ellipseCGraph.addNode(0, .3);
		ellipseCGraph.addNode(1, 1.0);
		ellipseCGraph.setNodeShapeType(1, rsFunctionNode<double>::EXPONENTIAL);
		ellipseCGraph.setNodeShapeParameter(1, -0.99);

		phaseModAmtGraph.addNode(0, 0.491228);
		phaseModAmtGraph.addNode(1, 0.0292398);
		phaseModAmtGraph.setNodeShapeType(1, rsFunctionNode<double>::EXPONENTIAL);
		phaseModAmtGraph.setNodeShapeParameter(1, +0.864507);

		chaosVsFreqGraph.addNode(0, 0);
		chaosVsFreqGraph.addNode(0, 0);
		chaosVsFreqGraph.addNode(0, 0);
	}

	void setInputAmplitude(double v) override
	{
		inputAmplitude = v * 3;
	}

	void setFrequency(double v) override
	{
		frequencyNormalized = v;
		if (sampleRate <= 44100)
			frequencyNormalized = std::min(frequencyNormalized, 0.79);

		frequency = elan::pitchToFreq(jmap(frequencyNormalized, -60.0, 65.0));

		filter.setCutoff(frequency * jmap(curve(frequencyNormalized, -.36), 0.20248, 0.248387));
		osc2Ratio = jmap(frequencyNormalized, 0.015625, 1.60558);
		osc1Ratio = osc2Ratio - 0.015625;
		ellipseC = ellipseCGraph.getValue(frequencyNormalized);

		updateChaos();
	}

	void setResonance(double v) override // Resonance Decay
	{
		resonance = v;
		updateResonance();
	}

	void setChaosAmount(double v) override // Resonance Density
	{
		chaosAmount = v;
		updateChaos();
	}

	void setSampleRate(double v) override
	{
		sampleRate = v;

		filter.setSampleRate(v);
		dcfilter.setSampleRate(v);
		phasor1.setSampleRate(v);
		phasor2.setSampleRate(v);

		updateChaos();
	}

	double getSample(double in) override
	{
		double inputSignal = inputAmplitude * in;

		// establish feedback signal
		inputSignal = osc2Value + osc1SelfMod + inputSignal;

		// osc1
		{
			// mod
			double freq = frequency * osc1Ratio * freqModAmt * .1 * inputSignal;

			phasor1.setFrequency(clamp(freq, -sampleRate*0.5, +sampleRate*0.5));
			phasor1.setPhaseOffset(inputSignal * phaseModAmt);
			phasor1.increment();
			osc1Value = waveshape::ellipse(phasor1.getUnipolarValue(), 0, 0, 1, 0.00749);

			// amp
			osc1Value *= .05;
		}

		// main feedback filters
		inputSignal = filter.getSample(osc1Value);

		// osc 1 & 2 self feedback
		osc1SelfMod = inputSignal;
		osc2SelfMod = osc2Value;

		// osc2
		double out;
		{
			// mod
			double fm = freqModAmt * 4.53126 * inputSignal + osc2SelfMod * 3;
			double freq = frequency * osc2Ratio * fm;

			phasor2.setFrequency(clamp(freq, -sampleRate*0.5, +sampleRate*0.5));
			phasor2.increment();
			osc2Value = waveshape::ellipse(phasor2.getUnipolarValue(), 0, 0, 1, ellipseC);

			out = osc2Value;

			// amp
			osc2Value *= 10;
		}

		return dcfilter.getSample(-out) * 10;
	}

protected:
	RAPT::rsNodeBasedFunction<double> ellipseCGraph;
	RAPT::rsNodeBasedFunction<double> phaseModAmtGraph;
	RAPT::rsNodeBasedFunction<double> freqModAmtGraph;
	RAPT::rsNodeBasedFunction<double> chaosVsFreqGraph;

	double frequencyNormalized;
	double ellipseC;

	void updateResonance()
	{
		phaseModAmt = phaseModAmtGraph.getValue(resonance);
	}

	void updateChaos()
	{
		chaosVsFreqGraph.moveNode(0, 0.0, chaosAmount);
		if (sampleRate <= 88200)
		{
			chaosVsFreqGraph.moveNode(1, 0.8, chaosAmount);
			chaosVsFreqGraph.moveNode(2, 1.000, std::min(chaosAmount, 0.362573));
		}
		else if (sampleRate <= 132300)
		{
			chaosVsFreqGraph.moveNode(1, 0.876254, chaosAmount);
			chaosVsFreqGraph.moveNode(2, 1.000, std::min(chaosAmount, 0.362573));
		}
		else if (sampleRate <= 176400)
		{
			chaosVsFreqGraph.moveNode(1, 0.772575, chaosAmount);
			chaosVsFreqGraph.moveNode(2, 1.000, std::min(chaosAmount, 0.409357));
		}
		else if (sampleRate <= 220500)
		{
			chaosVsFreqGraph.moveNode(1, 0.80602, chaosAmount);
			chaosVsFreqGraph.moveNode(2, 1.000, std::min(chaosAmount, 0.28655));
		}
		else
		{
			chaosVsFreqGraph.moveNode(1, 0.762542, chaosAmount);
			chaosVsFreqGraph.moveNode(2, 1.000, std::min(chaosAmount, 0.362573));
		}

		freqModAmt = jmap(curve(chaosVsFreqGraph(frequencyNormalized), 0.5), 103.0, 408.0);
	}
};

class SawtoothResonator_LP : public FMDFilter
{
public:
	SawtoothResonator_LP()
	{
		localName = String(CharPointer_UTF8("\xd0\xa0\xd0\x9e\xd0\xa1\xd0\xa1\xd0\x98\xd0\xaf - \xd0\x9f\xd0\x98\xd0\x9b\xd0\x9e\xd0\x9e\xd0\x91\xd0\xa0\xd0\x90\xd0\x97\xd0\x9d\xd0\xab\xd0\x99 - LP"));
		englishName = "Sinusoid Resonator LP";
		countryAbbreviation = "USSR";
		helpText = "One of the later FMDs created by Russia based on earlier prototpyes with multiple modes each creating one of the primary shapes. This filter produces chaotic sawtoothoids and can sound growling and grinding or soft and howling";
		
		ColourGradient g;
		g.addColour(0.00, Colour(0xFF000000));
		g.addColour(0.13, Colour(0xFF301D1D));
		g.addColour(0.61, Colour(0xFFD28000));
		g.addColour(1.00, Colour(0xFFFFFFFF));
		colorMap = g;

		softclampper.setWidth(0.00873698);
		filter.setMode(RAPT::rsLadderFilter<double, double>::LP_6);

		dcFilter.setMode(RAPT::rsLadderFilter<double, double>::HP_6);
		dcFilter.setCutoff(5);

		mod21Graph.addNode(0, -0.00105655);
		mod21Graph.addNode(1, -2.52898);
		mod21Graph.setNodeShapeType(1, rsFunctionNode<double>::EXPONENTIAL);
		mod21Graph.setNodeShapeParameter(1, -0.99);

		fmpm12Graph.addNode(0, 0.0);
		fmpm12Graph.addNode(1, 0.012216);
		fmpm12Graph.setNodeShapeType(1, rsFunctionNode<double>::EXPONENTIAL);
		fmpm12Graph.setNodeShapeParameter(1, 0.54);

		resVsFreqGraph.addNode(0, 0);
		resVsFreqGraph.addNode(0.0434783, 0);
		resVsFreqGraph.addNode(0, 0);
		resVsFreqGraph.addNode(0, 0);
		resVsFreqGraph.setNodeShapeType(2, rsFunctionNode<double>::RATIONAL);
		resVsFreqGraph.setNodeShapeParameter(2, 0.195211);
	}

	void setInputAmplitude(double v) override
	{
		inputAmplitude = v * 2;
	}

	void setFrequency(double v) override
	{
		frequencyNormalized = v;
		
		updateFrequency();
		updateResonance();
	}

	void setResonance(double v) override
	{
		resonance = v;
		updateResonance();
	}

	void setChaosAmount(double v) override
	{
		chaosAmount = v;
		fmpm12 = fmpm12Graph.getValue(v);
	}

	void setSampleRate(double v) override
	{
		sampleRate = v;

		phasor1.setSampleRate(v);
		phasor2.setSampleRate(v);
		filter.setSampleRate(v);
		dcFilter.setSampleRate(v);
	}

	double maxi;

	double getSample(double in) override
	{
		// decrease lastOutValue for a more crunchy resonance, increase for more howling resonance, but increasing it will require decreasing the input
		// maybe try crossfading feedbackAmp value with oscInAmp value or crossfading input signal with lastOutValue signal
		inputSignal = (-in) * inputAmplitude + feedbackSignal * -8.07896613446314289533 + osc2Value + osc1ModSelf * 20.0 ;

		// osc1
		{
			// mod
			phasor1.setFrequency(frequency * mod21 * inputSignal);
			phasor1.increment();
			osc1Value = waveshape::sine(phasor1.getUnipolarValue());

			// clamp and amp
			osc1Value = softclampper.getValue(osc1Value); //  extreme clampping causes the initial growling timbre
		}

		// main feedback filter
		inputSignal = filter.getSample(osc1Value);

		// osc 1 & 2 self feedback
		osc1ModSelf = inputSignal;
		osc2ModSelf = osc2Value;

		// osc2
		{
			// mod
			double mod = inputSignal * -140.010789331 + osc2ModSelf * -1.05208;
			double fm = cos(PI_z_2 * fmpm12) * mod;
			double pm = sin(PI_z_2 * fmpm12) * mod;

			phasor2.setFrequency(frequency * (-0.425 + fm)); // this fm bias is what helps create the sawtooth shape
			phasor2.setPhaseOffset(pm);
			phasor2.increment();
			osc2Value = waveshape::sine(phasor2.getUnipolarValue());
		}

		feedbackSignal = inputSignal + osc2Value;

		return dcFilter.getSample(-osc2Value * .1) * 80;
	}

protected:
	Phasor phasor1;
	Phasor phasor2;
	RAPT::rsLadderFilter<double, double> filter;
	RAPT::rsLadderFilter<double, double> dcFilter;
	rsScaledAndShiftedSigmoid<double> softclampper;

	RAPT::rsNodeBasedFunction<double> mod21Graph;
	RAPT::rsNodeBasedFunction<double> fmpm12Graph;
	RAPT::rsNodeBasedFunction<double> resVsFreqGraph;

	double fmpm12;
	double mod21;
	double frequencyNormalized;

	double inputSignal;
	double feedbackSignal;
	double osc2Value;
	double osc1Value;
	double osc1ModSelf;
	double osc2ModSelf;

	void updateFrequency()
	{
		frequency = elan::pitchToFreq(jmap(frequencyNormalized, -50.0, 108.0));
		filter.setCutoff(frequency * 8.87718);
	}
	void updateResonance()
	{
		resVsFreqGraph.moveNode(1, 0.0434783, resonance);
		if (sampleRate <= 44100)
		{
			resVsFreqGraph.moveNode(2, 0.578595, resonance);
			resVsFreqGraph.moveNode(3, 1.000, std::min(resonance, 0.432749));
		}
		else if (sampleRate <= 88200)
		{
			resVsFreqGraph.moveNode(2, 0.692308, resonance);
			resVsFreqGraph.moveNode(3, 1.000, std::min(resonance, 0.502924));
		}
		else if (sampleRate <= 132300)
		{
			resVsFreqGraph.moveNode(2, 0.749164, resonance);
			resVsFreqGraph.moveNode(3, 1.000, std::min(resonance, 0.561404));
		}
		else
		{
			resVsFreqGraph.moveNode(2, 0.776273, resonance);
			resVsFreqGraph.moveNode(3, 1.000, std::min(resonance, 0.54386));
		}		

		mod21 = std::max(mod21Graph.getValue(resVsFreqGraph(frequencyNormalized)), -1.53);
	}
};

/*
* Remember to call smootherManager.cleanupSmoothers() in your processBlock, recommended after the per-sample calls.
*/
class FMDFilterStereoWrapper
{
public:

	enum Algorithm
	{
		BYPASS,
		FLOWERCHILD_REV1,
		FLOWERCHILD_REV2,
		FLOWERCHILD_REV3,
		SPACEINVADERS_LP6,
		HUMAN_LP6,
		HUMAN_LP12,
		HUMAN_BP6,
		YELLOWJACKET_BP,
		SUPERLOVE_LP6,
		SUPERLOVE_LP12,
		SUPERLOVE_BP6,
		SUPERLOVE_HP6,
		SINUSOIDRESONATOR_LP,
		TRIANGLERESONATOR_LP,
		SAWTOOTHRESONATOR_LP,
		RSMET_LP6,
		RSMET_LP12,
		RSMET_LP18,
		RSMET_LP24,
		RSMET_HP6,
		RSMET_HP12,
		RSMET_HP18,
		RSMET_HP24,
		RSMET_BP6,
		RSMET_BP12
	};

	struct StereoFMDFilter
	{
		unique_ptr<FMDFilter> ch1;
		unique_ptr<FMDFilter> ch2;
		int algorithmId = Algorithm::BYPASS;
	};

	FMDFilterStereoWrapper()
	{
		addAlgorithm(Algorithm::BYPASS);

		setNumChannels(2);

		silenceDetector.setAttackTime(1000.0);
		silenceDetector.setReleaseTime(1000.0);

		setAlgorithm(0);
	}
	~FMDFilterStereoWrapper() = default;

	void addAlgorithm(int algo)
	{
		switch (algo)
		{
		case BYPASS:
			StereoFMDFilters.push_back({ make_unique<FMDFilter>(),make_unique<FMDFilter>(), algo });
			break;
		case FLOWERCHILD_REV1:
			StereoFMDFilters.push_back({ make_unique<FlowerChildRev1>(),make_unique<FlowerChildRev1>(), algo });
			break;
		case FLOWERCHILD_REV2:
			StereoFMDFilters.push_back({ make_unique<FlowerChildRev2>(),make_unique<FlowerChildRev2>(), algo });
			break;
		case FLOWERCHILD_REV3:
			StereoFMDFilters.push_back({ make_unique<FlowerChildRev3>(),make_unique<FlowerChildRev3>(), algo });
			break;
		case SPACEINVADERS_LP6:
			StereoFMDFilters.push_back({ make_unique<FlowerChildRev1Downsampled>(),make_unique<FlowerChildRev1Downsampled>(), algo });
			break;
		case HUMAN_LP6:
			StereoFMDFilters.push_back({ make_unique<Human_LP6>(),make_unique<Human_LP6>(), algo });
			break;
		case HUMAN_LP12:
			StereoFMDFilters.push_back({ make_unique<Human_LP12>(),make_unique<Human_LP12>(), algo });
			break;
		case HUMAN_BP6:
			StereoFMDFilters.push_back({ make_unique<Human_BP6>(),make_unique<Human_BP6>(), algo });
			break;
		case YELLOWJACKET_BP:
			StereoFMDFilters.push_back({ make_unique<Yellowjacket_BP>(),make_unique<Yellowjacket_BP>(), algo });
			break;
		case SUPERLOVE_LP6:
			StereoFMDFilters.push_back({ make_unique<SuperLove_LP18>(),make_unique<SuperLove_LP18>(), algo });
			break;
		case SUPERLOVE_LP12:
			StereoFMDFilters.push_back({ make_unique<SuperLove_LP24>(),make_unique<SuperLove_LP24>(), algo });
			break;
		case SUPERLOVE_BP6:
			StereoFMDFilters.push_back({ make_unique<SuperLove_BP6>(),make_unique<SuperLove_BP6>(), algo });
			break;
		case SUPERLOVE_HP6:
			StereoFMDFilters.push_back({ make_unique<SuperLove_HP6>(),make_unique<SuperLove_HP6>(), algo });
			break;
		case SINUSOIDRESONATOR_LP:
			StereoFMDFilters.push_back({ make_unique<SinusoidResonator_LP>(),make_unique<SinusoidResonator_LP>(), algo });
			break;
		case TRIANGLERESONATOR_LP:
			StereoFMDFilters.push_back({ make_unique<TriangleResonator_LP>(),make_unique<TriangleResonator_LP>(), algo });
			break;
		case SAWTOOTHRESONATOR_LP:
			StereoFMDFilters.push_back({ make_unique<SawtoothResonator_LP>(),make_unique<SawtoothResonator_LP>(), algo });
			break;
		case RSMET_LP6:
			StereoFMDFilters.push_back({ make_unique<Rsmet_LP6>(),make_unique<Rsmet_LP6>(), algo });
			break;
		case RSMET_LP12:
			StereoFMDFilters.push_back({ make_unique<Rsmet_LP12>(),make_unique<Rsmet_LP12>(), algo });
			break;
		case RSMET_LP18:
			StereoFMDFilters.push_back({ make_unique<Rsmet_LP18>(),make_unique<Rsmet_LP18>(), algo });
			break;
		case RSMET_LP24:
			StereoFMDFilters.push_back({ make_unique<Rsmet_LP24>(),make_unique<Rsmet_LP24>(), algo });
			break;
		case RSMET_HP6:
			StereoFMDFilters.push_back({ make_unique<Rsmet_HP6>(),make_unique<Rsmet_HP6>(), algo });
			break;
		case RSMET_HP12:
			StereoFMDFilters.push_back({ make_unique<Rsmet_HP12>(),make_unique<Rsmet_HP12>(), algo });
			break;
		case RSMET_HP18:
			StereoFMDFilters.push_back({ make_unique<Rsmet_HP18>(),make_unique<Rsmet_HP18>(), algo });
			break;
		case RSMET_HP24:
			StereoFMDFilters.push_back({ make_unique<Rsmet_HP24>(),make_unique<Rsmet_HP24>(), algo });
			break;
		case RSMET_BP6:
			StereoFMDFilters.push_back({ make_unique<Rsmet_BP6>(),make_unique<Rsmet_BP6>(), algo });
			break;
		case RSMET_BP12:
			StereoFMDFilters.push_back({ make_unique<Rsmet_BP12>(),make_unique<Rsmet_BP12>(), algo });
			break;
		}
	}

	void setAlgorithm(int v)
	{
		if (algorithm == v)
			return;

		algorithm = v;

		fmdFilterL = StereoFMDFilters[algorithm].ch1.get();
		fmdFilterR = StereoFMDFilters[algorithm].ch2.get();

		fmdFilterL->setNoiseSeed(845);
		fmdFilterR->setNoiseSeed(846);

		fmdFilterL->setSampleRate(overSamplingSampleRate);
		fmdFilterR->setSampleRate(overSamplingSampleRate);

		setInputAmplitude(inputAmplitude);
		setResonance(resonance);		

		updateChaosAmount();
	}

	void setOversampling(int v)
	{
		oversampling = v;

		antiAliasFilterL.setSubDivision(oversampling);
		antiAliasFilterR.setSubDivision(oversampling);

		overSamplingSampleRate = hostSampleRate * oversampling;

		fmdFilterL->setSampleRate(overSamplingSampleRate);
		fmdFilterR->setSampleRate(overSamplingSampleRate);
	}

	void setSampleRate(double v)
	{
		hostSampleRate = v;
		
		silenceDetector.setSampleRate(hostSampleRate);

		overSamplingSampleRate = hostSampleRate * oversampling;

		fmdFilterL->setSampleRate(overSamplingSampleRate);
		fmdFilterR->setSampleRate(overSamplingSampleRate);
	}

	void setDryWet(double v) { rsEqualPowerGainFactors(v, &dryGain, &wetGain, 0.0, 1.0); }

	void setFrequency(double v) 
	{
		frequency = v;
		fmdFilterL->setFrequency(frequency);
		fmdFilterR->setFrequency(frequency);
	}

	void setResonance(double v)
	{
		resonance = v;
		fmdFilterL->setResonance(resonance);
		fmdFilterR->setResonance(resonance);
	}

	void setInputAmplitude(double v)
	{
		inputAmplitude = v;
		fmdFilterL->setInputAmplitude(inputAmplitude);
		fmdFilterR->setInputAmplitude(inputAmplitude);
	}

	void setOutputAmplitude(double v)
	{
		outputAmplitude = v;
	}

	// 0 to 1
	void setOutputDrive(double v)
	{
		outputDrive = v;
		clipper.setClipAmount(outputDrive);
	}

	void setFrequencyMod(double v) { frequencyMod = v; }
	void setAmplitudeMod(double v) { amplitudeMod = v; }

	void updateChaosAmount()
	{
		switch (StereoFMDFilters[algorithm].algorithmId)
		{
		case BYPASS:
			fmdFilterL->setChaosAmount(0);
			fmdFilterR->setChaosAmount(0);
			break;
		case FLOWERCHILD_REV1:
		case FLOWERCHILD_REV2:
		case FLOWERCHILD_REV3:
			fmdFilterL->setChaosAmount(chaosNoise);
			fmdFilterR->setChaosAmount(chaosNoise);
			break;
		case SPACEINVADERS_LP6:
			fmdFilterL->setChaosAmount(0);
			fmdFilterR->setChaosAmount(0);
			break;
		case HUMAN_LP6:
		case HUMAN_LP12:
		case HUMAN_BP6:
			fmdFilterL->setChaosAmount(chaosGleeb);
			fmdFilterR->setChaosAmount(chaosGleeb);
			break;
		case YELLOWJACKET_BP:
			fmdFilterL->setChaosAmount(chaosTone);
			fmdFilterR->setChaosAmount(chaosTone);
			break;
		case SUPERLOVE_LP6:
		case SUPERLOVE_LP12:
		case SUPERLOVE_BP6:
		case SUPERLOVE_HP6:
			fmdFilterL->setChaosAmount(chaosBias);
			fmdFilterR->setChaosAmount(chaosBias);
			break;
		case SINUSOIDRESONATOR_LP:
		case TRIANGLERESONATOR_LP:
		case SAWTOOTHRESONATOR_LP:
			fmdFilterL->setChaosAmount(chaosCrunch);
			fmdFilterR->setChaosAmount(chaosCrunch);
			break;
		case RSMET_LP6:
		case RSMET_LP12:
		case RSMET_LP18:
		case RSMET_LP24:
		case RSMET_HP6:
		case RSMET_HP12:
		case RSMET_HP18:
		case RSMET_HP24:
		case RSMET_BP6:
		case RSMET_BP12:
			fmdFilterL->setChaosAmount(chaosNoise);
			fmdFilterR->setChaosAmount(chaosNoise);
			break;
		}
	}

	void setChaosTone(double v) 
	{
		chaosTone = v;
		updateChaosAmount();
	}
	void setChaosNoise(double v) 
	{
		chaosNoise = v;
		updateChaosAmount();
	}
	void setChaosBias(double v) 
	{
		chaosBias = v;
		updateChaosAmount();
	}
	void setChaosGleeb(double v) 
	{
		chaosGleeb = v;
		updateChaosAmount();
	}
	void setChaosCrunch(double v) 
	{
		chaosCrunch = v;
		updateChaosAmount();
	}

	// 1 or 2
	void setNumChannels(int v) { isStereo = v > 1; }

	int getIsStereo() { return isStereo; }

	bool isSilent() { return abs(monoSignal) <= 1.e-6 && slewedOutputSignal <= 1.e-6; }

	void getSampleStereo(double InL, double InR, double* OutL, double* OutR);

	int getNumAlgorithmsAdded()
	{
		return StereoFMDFilters.size();
	}

	StringArray getAlgorithmHelpTexts()
	{
		StringArray ret;

		for (auto& a : StereoFMDFilters)
			ret.add(a.ch1->helpText);

		return std::move(ret);
	}

	StringArray getAlgorithmEnglishNames()
	{
		StringArray ret;

		for (auto& a : StereoFMDFilters)
			ret.add(a.ch1->englishName);

		return std::move(ret);
	}

	StringArray getAlgorithmLocalNames()
	{
		StringArray ret;

		for (auto& a : StereoFMDFilters)
			ret.add(a.ch1->localName);

		return std::move(ret);
	}

	void setBypassClipping(bool v)
	{
		clippingBypass = v;
	}

	vector<StereoFMDFilter> StereoFMDFilters;

protected:
	
	bool isStereo;
	bool clippingBypass = false;

	int algorithm = -1; // unset at construction
	
	double sampleRate = 44100;

	double frequency = 0;
	double resonance = 0;
	double inputAmplitude = 0;
	

	double dryGain = 0;
	double wetGain = 1;
	double outputAmplitude = 1;
	double outputDrive = 0;

	double monoSignal = 0;
	double slewedOutputSignal = 0;

	double hostSampleRate = 44100;
	double overSamplingSampleRate = 44100;
	double oversampling = 1;

	double amplitudeMod = 0;
	double frequencyMod = 0;

	double chaosAmount = 0;
	double chaosTone = 0.0;
	double chaosNoise = 0.0;
	double chaosBias = 0.5;
	double chaosGleeb = 0.5;
	double chaosCrunch = 0.0;
	
	rsSlewRateLimiterLinear<double, double> silenceDetector;

	RAPT::rsEllipticSubBandFilter<double, double> antiAliasFilterL;
	RAPT::rsEllipticSubBandFilter<double, double> antiAliasFilterR;

	FMDFilter* fmdFilterL = nullptr;
	FMDFilter* fmdFilterR = nullptr;

	GainCompensatedSoftClipper clipper;
};
