#include "library/Midi.hxx"

string name="Walter's Distortion Oscs";
string description="Walter's Distortion Oscs";

array<string> inputParametersNames={"Morph", "Waveform", "Volume"};
array<double> inputParameters(inputParametersNames.length);
array<double> inputParametersDefault={0.0,0.0,0.0};

double sr = sampleRate;
double srQuarter = sampleRate * 0.25;
double PI = 3.1415926535897932384626433832795;
double halfPI = PI/2.0;
double noteNumber = 60;
double noteHz = 0.0;
double noteRamp = 0.0;
double ramp = 0.0;
double ramp2 = 0.0;
double sineAmp = 0.0;

double volume = 1.0;
double morph = 1.0;
int waveChosen = 0;

double ParabolSine(double x)
{
	double xin = x;
	if (x > 0.5) xin = x - 0.5;
	xin = xin * 4 - 1;
	double a = xin*xin;
	if (x > 0.5) return 0 - (1-a) * (1-a*0.202);
	return (1-a) * (1-a*0.202); //(1-x*x)*(1-x*x*0.202)
}

double tanHApprox(double x)
{
	if (x > 5.0) return 1.0;
	if (x < -5.0) return -1.0;
	double a = x * x;
	return x/(1+a/(3+a/(5+a/(7+a/(9+a*0.090909090909)))));
}

double midiNoteToHz(double x) { return 440 * pow(2,(x-69)/12); }
double updatePitchConversion() { return (srQuarter / (log10(noteHz) * noteHz)) * halfPI; }

bool initialize()
{
	noteHz = midiNoteToHz(noteNumber);
	noteRamp = (1 / sampleRate) * noteHz;
	sineAmp = updatePitchConversion() * 0.8;
	return true;
}

void processBlock(BlockData& data)
{
    uint nextEventIndex=0;
    for(uint i=0;i<data.samplesToProcess;i++)
    {
        while(nextEventIndex!=data.inputMidiEvents.length && data.inputMidiEvents[nextEventIndex].timeStamp<=double(i))
        {
            switch(MidiEventUtils::getType(data.inputMidiEvents[nextEventIndex]))
		    {
		        case kMidiNoteOn:
		        {
		            noteNumber = MidiEventUtils::getNote(data.inputMidiEvents[nextEventIndex]);
		        	noteHz = midiNoteToHz(noteNumber);
					noteRamp = (1 / sampleRate) * noteHz;
					sineAmp = updatePitchConversion() * 0.8;
		        }
			}
            nextEventIndex++;
        }

        double sampleValue = perSample() * volume;
        data.samples[0][i]=sampleValue;
		data.samples[1][i]=sampleValue;
    }
}

double perSample()
{
	switch(waveChosen)
	{
		case 0:
		{
			// Analog Saw (Sine version)
			double toSine = 0.0;
			ramp += noteRamp;
			ramp -= floor(ramp);
			toSine = (ramp * 2 - 1)*PI;
			return tanh(sin(toSine) * sineAmp * morph) * cos(toSine);
		}
		break;

		case 1:
			// Analog Saw (Parabol version)
			ramp += noteRamp;
			ramp -= floor(ramp);
			return tanh(ParabolSine(ramp) * sineAmp * morph) * ParabolSine((ramp+0.25)%1);
		break;

		case 2:
		{
			// Perfect Saw
			ramp += noteRamp;
			ramp -= floor(ramp);
			return acos(tanh(sin(ramp*PI*2) * sineAmp * morph) *  sin(((ramp+0.25)%1)*PI*2)) / (PI*0.5) - 1;
		}
		break;

		case 3:
			// Analog Square
			ramp += noteRamp;
			ramp -= floor(ramp);
			return tanh(ParabolSine(ramp) * sineAmp * morph) 
			* (tanh(ParabolSine(ramp) * sineAmp*0.5 * morph) 
				* ParabolSine((ramp+0.25)%1) * 0.5 + 0.5);
		break;

		case 4:
			// Square
			ramp += noteRamp;
			ramp -= floor(ramp);
			return tanh(ParabolSine(ramp) * sineAmp * morph);
		break;

		case 5:
		{
			// Tri
			ramp += noteRamp;
			ramp -= floor(ramp);
			double scaling = tanh((1.0 - (noteNumber / 127.0)) * 9.0);
			return acos(sin(ramp*PI*2) * morph * scaling) / PI * 2 - 1;
		}
		break;

		case 6:
		{
			// Bow Tri
			ramp += noteRamp;
			ramp -= floor(ramp);
			double bow = ParabolSine(ramp); 
			return tanh(bow * sineAmp * morph) * bow;
		}
		break;

		case 7:
		{
			// Distorted Bow Tri
			ramp += noteRamp;
			ramp -= floor(ramp);
			double bow = ParabolSine(ramp); 
			double sq = tanh(bow * sineAmp * morph);
			return tanh(sq*bow*2);
		}
		break;

		case 8:
		{
			// Walter Wave
			ramp += noteRamp;
			ramp -= floor(ramp);
			double bow = ParabolSine(ramp); 
			double sq = tanh(bow * sineAmp * morph);
			return sq*0.5+0.5-tanh(sq*bow*2);
		}
		break;

		case 9:
			// Parabol Sine
			ramp += noteRamp;
			ramp -= floor(ramp);
			return ParabolSine(ramp);
		break;

	}
	return 0.0;
}

void updateInputParameters() 
{
	morph = pow(inputParameters[0],4) * 0.999 + 0.001;
	waveChosen = int(inputParameters[1] * 9.999);
	volume = inputParameters[2];
}

int getTailSize() { return -1; }

