#ifndef __Sabrina_H
#define __Sabrina_H
#include "audioeffectx.h"
#include "aeffeditor.h"
#include <windows.h>
#include <wingdi.h>
#include <windowsx.h>
#include "svgdocument.h"


class Editor : public AEffEditor
{
	public:
    Editor(AudioEffectX *effect);
    virtual ~Editor();
    virtual bool getRect(ERect **rect);
    virtual bool open(void *ptr);
    virtual void close();
    void Resize(int x, int y);
    HWND         hWnd;
    int myWidth;
    int myHeight;
    bool resizing;
    bool redrawRequested;
    bool guiKnobChange;
    bool knobUpdate;
    AudioEffectX* 	   myEffect;

    double paramBoxLeft[128];
    double paramBoxTop[128];
	double paramBoxRight[128];
    double paramBoxBottom[128];
	double paramBoxCenterX[128];
	double paramBoxCenterY[128];
	int paramType[128];
	double docW;
	double docH;

	HBITMAP hdcVector;
	lunasvg::SVGDocument document;
	lunasvg::Bitmap bitmap;
	ERect r;
	int wsize;
	
	bool moveKnob;
	int rond;
	double knobClickValue;
	int knobClickY;
	int whichKnob;
	POINT wPoint;
	POINT gPoint;


 	private:
 	AudioEffectX*      effectx;
};

class Delay
{
	public:
    double * idelay;
    int Driver;
    double feedback;
    int rndNext;
    double rndAcc;
    double offset;
	double modInc;
    double modSpeed;
    double comb;
    double lfopercent;
    double diffSeed;

	Delay();
	double getDiffuse(double inn);
	double getDelay(double inn);
	double InterpolateLinear(double where, double *buff);
	double Parabol(double x);
	double Rnd();
	void SetOffsetSize(double x);
	double SetDiffSeed(double x, double y);
	void InitializeMod(double lfoS, double lfoV);
	void Initialize();
};

class Sabrina : public AudioEffectX
{
public:
	bool updateSupported;
	Editor* myEditor;
	Sabrina(audioMasterCallback audioMaster);
	~Sabrina();
	virtual void process(float **inputs, float **outputs, VstInt32 sampleFrames);
	virtual void processReplacing(float **inputs, float **outputs, VstInt32 sampleFrames);
	virtual void setProgramName(char *name);
	virtual void getProgramName(char *name);
	virtual bool getProgramNameIndexed (VstInt32 category, VstInt32 index, char* name);
	virtual void setParameter(VstInt32 index, float value);
	virtual float getParameter(VstInt32 index);
	virtual void getParameterLabel(VstInt32 index, char *label);
	virtual void getParameterDisplay(VstInt32 index, char *text);
	virtual void getParameterName(VstInt32 index, char *text);
	virtual void setSampleRate(float sampleRate);
	virtual bool getEffectName(char *name);
	virtual bool getVendorString(char *text);
	virtual bool getProductString(char *text);
	virtual VstInt32 getVendorVersion() { return 1000; }
  	

private:
	float fParam1;
	float fParam2;
	float fParam3;
	float fParam4;
	float fParam5;
	float fParam6;
	float fParam7;
	float fParam8;
	float fParam9;
	float fParam10;

	int delaySize;
	double mix;
    double lfoSpeed;
    double lfoVariation;
	double ch0;
	double ch1;
	double rereverb;
	double rndSeedDiff;
	char programName[32];

	Delay delayL;
	Delay delayR;
	Delay delayL2;
	Delay delayR2;
	Delay delayL3;
	Delay delayR3;
	Delay delayL4;
	Delay delayR4;
	Delay delayL5;
	Delay delayR5;
	Delay delayL6;
	Delay delayR6;
	Delay LDelay;
	Delay RDelay;
	Delay LPreDelay;
	Delay RPreDelay;

	// also add 6 early diffusion delays (3 per side)
};

#endif
