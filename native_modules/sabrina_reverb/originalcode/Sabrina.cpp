/*
  ToDO:
    Gui Optimization
    -- Limit HDC CreateCompatibleDC to a single instance instad of redraw anew each wm_paint
    -- Have a Bitmap for Each Control, and draw control to main window upon changeBITBLT sub rect,  
      and then have an update on wm_paint to the main window backround buffer if needed
      -- possibly have each one as a different control, this will make it only redraw its own
    -- possibl modify the svg for each control to only include the elements within ithe bounds
    -- Make it easier to go from svg to gui skin
    -- Add an about screen
    -- Enhance the look of the GUI, more impressive and sleek
    -- GUI Ideas - RAUM style knobs, Vector of Sabrina

    Some Reverb Controls From Others
    ● Mix
    ● Predelay
    ● Recycle / Decay
    ● Damping [Eq on Feedback] (High F, High Mix, Low F, Low Mix)
    ● Size
    ● Attack? -- possibly a natural fade in (ABS inp -> and LP)
    ● Modultion (Rate, Amplitude)
    ● Diffusion (Early Mix, Late Mix)
    ● LP/HP / EQ (High F, Low F)
    ● CrossOver Amount
    ● Controls for Each Late and early
    ● Shimmer
    ● Variation (Hidden knob)

  -- LP
  -- Predelay Effects
    -- Chorus before Reverb
    -- Vibrato before Reverb
  -- Shimmer, increase pitch in feedback loop (possibly have 2 reads that move at a higher speed, fasing in at start, fading out at end)
  -- Stereo Circle (a circle with l and r opposite each other as pickup and mix out), multiple lines

  -- Fade a Convolve with multiple samples to emulate

*/

#include "Sabrina.h"
#include <math.h>
#include <cstdlib>
#include <windows.h>
#include <wingdi.h>
#include <windowsx.h>
#include "svgdocument.h"
#include "skin.h"

int maxDelaySize = 0;
double sampleRateG = 0.0;

Delay::Delay()
{
    Initialize();
};

void Delay::Initialize() 
{
    this->Driver = 0;
    this->feedback = 0.0;
    this->rndNext = rand();    
    Rnd();Rnd();Rnd();

    SetOffsetSize(0.06);  // the size is here
    this->modInc = fabs(Rnd());
    this->modInc = this->diffSeed;
    //SetDiffSeed(0.5,0.06);
    InitializeMod(1.0,0.001);
    this->lfopercent = 0.0;
}

double Delay::SetDiffSeed(double x, double y)
{
  this->rndNext = 7;
  this->rndAcc = x;  
  this->diffSeed = fabs(Rnd());
  this->modInc = fabs(Rnd());
  this->offset = (double(maxDelaySize) * this->diffSeed * (y * 0.1 + 0.0000001)) + 1.0; 
  return fabs(Rnd());
}

void Delay::SetOffsetSize(double x)
{
    //this->offset = (double(maxDelaySize) * Rnd() * x) + 1.0;  // the size is here
    this->offset = (double(maxDelaySize) * Rnd() * (x * 0.1 + 0.0000001)) + 1.0;

    //this->offset = (double(maxDelaySize) * this->diffSeed * (x * 0.1 + 0.0000001)) + 1.0;  // the size is here
}

double Delay::getDelay(double inn)
{
    this->modInc = fmod(this->modInc + this->modSpeed,1.0);
    double lfo = this->Parabol(this->modInc) * 0.5 + 0.5;
    double mod = (this->offset - (this->offset * (lfo * lfopercent))) + 1;

    this->Driver = (this->Driver + 1) % maxDelaySize;
    double del = InterpolateLinear(fmod(this->Driver + (maxDelaySize - mod), maxDelaySize),this->idelay);
    this->idelay[this->Driver] = inn;// + del * this->feedback;
    return del;

    // this->Driver = (this->Driver + 1) % maxDelaySize;
    // double del = InterpolateLinear(fmod(this->Driver + (double(maxDelaySize) - this->offset), double(maxDelaySize)),this->idelay);
    // this->idelay[this->Driver] = inn;// + del * this->feedback;
    // return del;
}

double Delay::getDiffuse(double inn)
{
    this->modInc = fmod(this->modInc + this->modSpeed,1.0);
    double lfo = this->Parabol(this->modInc) * 0.5 + 0.5;
    double mod = (this->offset - (this->offset * (lfo * lfopercent))) + 1;

    this->Driver = (this->Driver + 1) % maxDelaySize;
    //double del = InterpolateLinear(fmod(this->Driver + (maxDelaySize - this->offset), maxDelaySize),this->idelay);
    double del = InterpolateLinear(fmod(this->Driver + (maxDelaySize - mod), maxDelaySize),this->idelay);
    this->idelay[this->Driver] = (0.0-inn) - del * this->feedback;
    return inn * this->feedback - del * (1.0-this->feedback*this->feedback);
}

double Delay::InterpolateLinear(double where, double * buff)
{
    int Before = int(floor(where))  % maxDelaySize;
    int After = int(floor(where)+1) % maxDelaySize;
    double mixa = where - Before;
    return buff[Before] * (1-mixa) + buff[After] * mixa;
}

double Delay::Parabol(double x)
{
    double fit = fmod(2.0 * x, 2.0) - 1.0;
    return 4.0 * fit * (1.0-fabs(fit));
}

double Delay::Rnd()
{
    this->rndNext = (this->rndNext + 109) % 123094;
    this->rndAcc = Parabol(Parabol(((this->rndNext+this->rndAcc+10))*134987.489798+1987.19687)*1987.4987+98497.19879);
    return this->rndAcc * 0.5 + 0.5;
}

void Delay::InitializeMod(double lfoS, double lfoV)
{
    //double seconds = lfoS;// + (Rnd() * lfoV);
    double seconds = lfoS + (Rnd() * lfoV);
    this->modSpeed = (1.0 / seconds) / sampleRateG; // (1.0 / seconds) / samplerate(1 second)
}

AudioEffect *createEffectInstance(audioMasterCallback audioMaster)
{
    return new Sabrina(audioMaster);
}

LRESULT CALLBACK WindowProc(HWND hWnd, UINT message, WPARAM wParam, LPARAM lParam)
{
  #ifdef _WIN64
     Editor* myEditor = (Editor*)GetWindowLongPtr(hWnd, GWLP_USERDATA);
  #else
     Editor* myEditor = (Editor*)GetWindowLong(hWnd, GWL_USERDATA);
  #endif

  switch (message)
  {
    case WM_CREATE:
    {
        int err = SetTimer(hWnd, 1, 34, NULL);
        if(err == 0) MessageBox(hWnd, "Could not SetTimer()!", "Error", MB_OK | MB_ICONEXCLAMATION);
        
        // MessageBox(hWnd, "WM_CREATE", "Hey", MB_OK | MB_ICONEXCLAMATION);

        // if (myEditor != NULL)
        // {
        //     myEditor->bitmap = myEditor->document.renderToBitmap(myEditor->bitmap.width(),myEditor->bitmap.height());
        //     myEditor->hdcVector = CreateBitmap(myEditor->bitmap.width(),myEditor->bitmap.height(),1,32, myEditor->bitmap.data());
        //     MessageBox(hWnd, "EditorCreated", "Error", MB_OK | MB_ICONEXCLAMATION);
        // }
      break;
    }

    case WM_TIMER:
    {
       if (myEditor != NULL)
        {
          if (myEditor->redrawRequested)
          {
              myEditor->redrawRequested = false; 
              InvalidateRect(hWnd, NULL, 0);
              myEditor->bitmap = myEditor->document.renderToBitmap(myEditor->bitmap.width(),myEditor->bitmap.height());
              DeleteObject(myEditor->hdcVector);
              myEditor->hdcVector = CreateBitmap(myEditor->bitmap.width(),myEditor->bitmap.height(),1,32, myEditor->bitmap.data());

              PAINTSTRUCT ps;
              HDC dc = BeginPaint(hWnd, &ps);
              HDC hdcMem = CreateCompatibleDC(dc);
              HGDIOBJ oldone3 = SelectObject(hdcMem, myEditor->hdcVector);
              BitBlt(dc,0,0,myEditor->bitmap.width(),myEditor->bitmap.height(), hdcMem, 0, 0, SRCCOPY);
              SelectObject(hdcMem, oldone3);
              DeleteDC(hdcMem);

              EndPaint(hWnd, &ps);
              if (myEditor->guiKnobChange)
              {
                myEditor->guiKnobChange = false;
                myEditor->myEffect->updateDisplay();
              }
          }
        }
        return 0;
        break;
    }

    case WM_PAINT:
    {
        // if (myEditor != NULL)
        // {
        //   if (myEditor->redrawRequested)
        //   {
        //       myEditor->redrawRequested = false; 
        //       InvalidateRect(hWnd, NULL, 0);
        //       bitmap = document.renderToBitmap(bitmap.width(),bitmap.height());
        //       DeleteObject(hdcVector);
        //       hdcVector = CreateBitmap(bitmap.width(),bitmap.height(),1,32, bitmap.data());
        //   }
        // }
      if (myEditor != NULL)
        {
          PAINTSTRUCT ps;
          HDC dc = BeginPaint(hWnd, &ps);
          HDC hdcMem = CreateCompatibleDC(dc);
          HGDIOBJ oldone3 = SelectObject(hdcMem, myEditor->hdcVector);
          BitBlt(dc,0,0,myEditor->bitmap.width(),myEditor->bitmap.height(), hdcMem, 0, 0, SRCCOPY);
          SelectObject(hdcMem, oldone3);
          DeleteDC(hdcMem);

          EndPaint(hWnd, &ps);
          //myEditor->myEffect->updateDisplay();
        return 0;
      }
        break;
    }

    case WM_ERASEBKGND: return 1; break;

    case WM_MOUSEWHEEL:
      if (myEditor != NULL && !(myEditor->moveKnob)) 
      {
        POINT wPoint;
        wPoint.x = LOWORD(lParam);
        wPoint.y = HIWORD(lParam);
        
        ScreenToClient(hWnd,&wPoint);
        int clickdownX = wPoint.x;
        int clickdownY = wPoint.y;

        int cycleThrough = 0;
        bool clickedTrue = false;
        while(myEditor->paramType[cycleThrough] != 0 && !clickedTrue)
        {
          if (clickdownX > myEditor->bitmap.width() * myEditor->paramBoxLeft[cycleThrough] && clickdownY > myEditor->bitmap.height() * myEditor->paramBoxTop[cycleThrough]
          && clickdownX < myEditor->bitmap.width() *  myEditor->paramBoxRight[cycleThrough]  && clickdownY < myEditor->bitmap.height() *  myEditor->paramBoxBottom[cycleThrough]  )
          {
            myEditor->whichKnob = cycleThrough;
            clickedTrue = true;
          }
          cycleThrough++;
        }

        double boats = 1.0;
        switch(LOWORD(wParam))
        {
          case MK_SHIFT | MK_CONTROL: boats = 256.0; break;
          case MK_CONTROL: boats = 128.0; break;
          case MK_SHIFT: boats = 32.0; break;
          default: boats = 8.0; break;
        }
        double whato2 = (myEditor->myEffect->getParameter(myEditor->whichKnob) * 360.0) + ((short int) HIWORD(wParam) / boats);
        if (whato2 < 0.0) whato2 = 0.0;
        if (whato2 > 360.0) whato2 = 360.0;
        
        // myEditor->redrawRequested = true;
        // myEditor->myEffect->setParameter(whichKnob, whato2 / 360.0);
                  
        myEditor->knobUpdate = true;
        myEditor->redrawRequested = true;
        myEditor->guiKnobChange = true;
        myEditor->myEffect->setParameter(myEditor->whichKnob, whato2 / 360.0);
        //if(!myEditor->myEffect->updateDisplay()) 
        // myEditor->myEffect->updateDisplay();
          //PostMessage(hWnd,WM_PAINT,0,0);
        // PostMessage(hWnd,WM_PAINT,0,0);
      }
      break;

    case WM_LBUTTONUP: 
    {
      if (myEditor->moveKnob)
      {
        myEditor->moveKnob = false;
        myEditor->knobUpdate = false;
        myEditor->myEffect->endEdit(myEditor->whichKnob);
        ReleaseCapture();
      }
      if (myEditor->resizing)
      {
        myEditor->resizing = false;
        ReleaseCapture();
      }
      ShowCursor(true);
      break;
    }

    case WM_LBUTTONDOWN: 
    {
      GetCursorPos(&(myEditor->gPoint));
      int clickdownX = LOWORD(lParam);
      int clickdownY = HIWORD(lParam);
      if (clickdownX > myEditor->bitmap.width() * 0.95 && clickdownY > myEditor->bitmap.height() * 0.95)
      {
          myEditor->resizing = true;
          SetCapture(hWnd);
      }

      if (myEditor != NULL)
      {
        POINT wPoint;
        int cycleThrough = 0;
        bool clickedTrue = false;
        while(myEditor->paramType[cycleThrough] != 0 && !clickedTrue)
        {
          if (clickdownX > myEditor->bitmap.width() * myEditor->paramBoxLeft[cycleThrough] && clickdownY > myEditor->bitmap.height() * myEditor->paramBoxTop[cycleThrough]
            && clickdownX < myEditor->bitmap.width() *  myEditor->paramBoxRight[cycleThrough]  && clickdownY < myEditor->bitmap.height() *  myEditor->paramBoxBottom[cycleThrough]  )
          {
            SetCursor(NULL);  // invisible cursor
            myEditor->whichKnob = cycleThrough;
            myEditor->moveKnob = true;
            SetCapture(hWnd);
            GetCursorPos(&wPoint);
            ScreenToClient(hWnd,&wPoint);
            myEditor->knobClickY = wPoint.y;
            myEditor->knobClickValue = myEditor->myEffect->getParameter(myEditor->whichKnob);
            myEditor->myEffect->beginEdit(myEditor->whichKnob);
            clickedTrue = true;
          }
          cycleThrough++;
        }
      }
      break;
    }

    case WM_MOUSEMOVE:
    {
      if (myEditor != NULL)
        {
        if (myEditor->resizing)
        {
          POINT wPoint;
          GetCursorPos(&wPoint);
          ScreenToClient(hWnd,&wPoint);
          int aWidth = wPoint.x;
          if (aWidth < 100) aWidth = 100;
          int aHeight = aWidth;
          SetWindowPos(hWnd,HWND_TOP,0,0,aWidth,aHeight,SWP_NOMOVE);  
        }

        if (myEditor->moveKnob)
        {
          double boats = 2.0;
          bool isCtrl = (GetKeyState(VK_CONTROL) & (1 << 15));
          bool isShift = GetKeyState(VK_SHIFT) & 32768;
          if (!isCtrl && isShift) boats = 8.0;
          if (isCtrl && !isShift) boats = 32.0;
          if (isCtrl && isShift) boats = 64.0;

          POINT pPoint;
          GetCursorPos(&pPoint);
          ScreenToClient(hWnd,&pPoint);          
          double whato = ((myEditor->knobClickY - pPoint.y) / boats) + (myEditor->knobClickValue * 360.0);
          if (whato < 0.0) whato = 0.0;
          if (whato > 360.0) whato = 360.0;
          //knobClickY = pPoint.y;
          myEditor->knobClickValue = whato / 360.0;

          //ClientToScreen(hWnd,)
          SetCursorPos(myEditor->gPoint.x,myEditor->gPoint.y);


            myEditor->guiKnobChange = true;
            myEditor->knobUpdate = true;
            myEditor->redrawRequested = true;
            myEditor->myEffect->setParameter(myEditor->whichKnob, myEditor->knobClickValue);
            //if(!myEditor->myEffect->updateDisplay()) 
            //myEditor->myEffect->updateDisplay();
              //PostMessage(hWnd,WM_PAINT,0,0);
        }
      }
      break;
    }

    case WM_SIZE:
    {
      if (myEditor != NULL)
        {
        //bitmap = document.renderToBitmap(300,300);
        int nWidth = LOWORD(lParam);
        if (nWidth < 100) nWidth = 100;
        int nHeight = nWidth;
        //int nHeight = HIWORD(lParam);

        myEditor->bitmap = myEditor->document.renderToBitmap(nWidth,nHeight);
        DeleteObject(myEditor->hdcVector);
        myEditor->hdcVector = CreateBitmap(myEditor->bitmap.width(),myEditor->bitmap.height(),1,32, myEditor->bitmap.data());

        HDC rdc = GetDC(hWnd);
        HDC hdcMem = CreateCompatibleDC(rdc);

        HGDIOBJ oldone2 = SelectObject(hdcMem, myEditor->hdcVector);
        BitBlt(rdc,0,0,myEditor->bitmap.width(),myEditor->bitmap.height(), hdcMem, 0, 0, SRCCOPY);
        SelectObject(hdcMem, oldone2);
        DeleteDC(hdcMem);
        ReleaseDC(hWnd, rdc);

        if (myEditor != NULL) myEditor->Resize(myEditor->bitmap.width(),myEditor->bitmap.height());
      }
        break;
    }

    case WM_DESTROY:

      KillTimer(hWnd, 1);
      // MessageBox(hWnd, "WM_DESTROY", "Hey", MB_OK | MB_ICONEXCLAMATION);
      //DeleteObject(myEditor->hdcVector);
      break;

    // case WM_KEYUP:
    //     // if (VK_CONTROL == wParam) ctrl == 0;
    //     break;
    // case WM_KEYDOWN:
    //     if (VK_ESCAPE == wParam) DestroyWindow(hwnd);
    //     //int ctrl =  GetKeyState(VK_CONTROL) & (1 << 15);
    //     // if (VK_CONTROL == wParam) ctrl == 1;
    //     break;

    default:
        break;
  }

  return DefWindowProc(hWnd, message, wParam, lParam);
}

void Editor::Resize(int x, int y)
{
  this->effectx->sizeWindow(x,y);
}


Editor::Editor (AudioEffectX *effectx): AEffEditor(effectx)//, effectx(effectx)
{
    this->hdcVector = NULL;
    this->wsize = 100;
    this->resizing = false;
    this->moveKnob = false;
    this->rond = 0;
    this->knobClickValue = 0.0;
    this->knobClickY = 0;
    this->whichKnob = 0;
    
    // Embedded
     std::string s = background_svg;
     this->document.loadFromData(s);
    // Loaded From File
    //document.loadFromFile("C:\\HackettApp\\Plugins\\WH_Sabrina\\background.svg");

    int countElem = 0;
    lunasvg::SVGElement* indexEl;
    lunasvg::SVGElement* indexElType;
    docW = this->document.documentWidth();
    docH = this->document.documentHeight();
    
    this->bitmap = this->document.renderToBitmap(this->bitmap.width(),this->bitmap.height());
    this->hdcVector = CreateBitmap(this->bitmap.width(),this->bitmap.height(),1,32, this->bitmap.data());

    while ((indexEl = this->document.getElementById("p" +  std::to_string(++countElem)) ) != NULL)
    {
        if ((indexElType = this->document.getElementById("p" +  std::to_string(countElem) + "_knob")) != NULL) 
        {
            paramType[countElem-1] = 1;
            indexElType->removeElement();
        }
        if ((indexElType = this->document.getElementById("p" +  std::to_string(countElem) + "_slider")) != NULL) 
        {
            paramType[countElem-1] = 2;
            indexElType->removeElement();
        }
        if ((indexElType = this->document.getElementById("p" +  std::to_string(countElem) + "_button")) != NULL) 
        {
            paramType[countElem-1] = 3;
            indexElType->removeElement();
        }
        paramBoxLeft[countElem-1] = std::stof(indexEl->getAttribute("x"));
        paramBoxTop[countElem-1] = std::stof(indexEl->getAttribute("y"));
        paramBoxRight[countElem-1] = (std::stof(indexEl->getAttribute("width"))) + paramBoxLeft[countElem-1];
        paramBoxBottom[countElem-1] = (std::stof(indexEl->getAttribute("height"))) + paramBoxTop[countElem-1];
        paramBoxCenterX[countElem-1] = (paramBoxLeft[countElem-1] + paramBoxRight[countElem-1]) * 0.5;
        paramBoxCenterY[countElem-1] = (paramBoxTop[countElem-1] + paramBoxBottom[countElem-1]) * 0.5;
        paramBoxLeft[countElem-1] = paramBoxLeft[countElem-1] / docW;
        paramBoxTop[countElem-1] = paramBoxTop[countElem-1] / docH;
        paramBoxRight[countElem-1] = paramBoxRight[countElem-1] / docW;
        paramBoxBottom[countElem-1] = paramBoxBottom[countElem-1] / docH;

        // paramBoxCenterX[countElem-1] = (paramBoxLeft[countElem-1] + paramBoxRight[countElem-1]) * 0.5;
        // paramBoxCenterY[countElem-1] = (paramBoxTop[countElem-1] + paramBoxBottom[countElem-1]) * 0.5;
        indexEl->removeElement();
        //indexEl->setAttribute("style", "fill:#000;");
    }
    this->guiKnobChange = false;
    this->redrawRequested = false;
    this->effectx = effectx;
    this->myEffect = effectx;
    this->resizing = false;
    effect->setEditor(this);
}

Editor::~Editor () 
{
    DeleteObject(this->hdcVector);
}

bool Editor::open (void *ptr)
{
      WNDCLASSW windowClass;
      windowClass.style         = CS_DBLCLKS;
      windowClass.lpfnWndProc   = WindowProc;
      windowClass.cbClsExtra    = 0;
      windowClass.cbWndExtra    = 0;
      windowClass.hInstance     = NULL; //(HINSTANCE)hInstance;
      windowClass.hIcon         = NULL; //LoadIcon((HINSTANCE)hInstance,MAKEINTRESOURCE(IDI_ICON));
      windowClass.hCursor       = LoadCursor( NULL, IDC_ARROW );
      windowClass.hbrBackground = NULL;
      windowClass.lpszMenuName  = 0;
      windowClass.lpszClassName = L"SabrinaClass";
      RegisterClassW(&windowClass);

     this->hWnd = CreateWindowExW
        (
            0,
            L"SabrinaClass",
            L"",
            WS_CHILD | WS_VISIBLE,
            0,
            0,
            this->bitmap.width(),
            this->bitmap.height(),
            (HWND)ptr,
            NULL,
            NULL,
            this
        );

      #ifdef _WIN64
        SetWindowLongPtr(this->hWnd, GWLP_USERDATA, (LONG_PTR)this);
      #else
        SetWindowLong(this->hWnd, GWL_USERDATA, (LONG)this);
      #endif

    ShowWindow(this->hWnd, SW_SHOWNORMAL);
    return true;
}

bool Editor::getRect (ERect **erect)
{
    //static ERect r = {0, 0, 400, 400 };   // Size
    // static ERect r = {0, 0, bitmap.width(), bitmap.height() };   // Size
    this->r = {0, 0, this->bitmap.width(), this->bitmap.height() }; 
    *erect = &(this->r);
    return true;
}

void Editor::close () 
{
  UnregisterClassW(L"SabrinaClass", NULL);//(HINSTANCE)hInstance);
}

Sabrina::Sabrina(audioMasterCallback audioMaster)	: AudioEffectX(audioMaster, 1, 8)	// 1 program, 6 parameters
{
  this->myEditor = new Editor(this);
  editor = this->myEditor;
  this->updateSupported = this->updateDisplay();

  sampleRateG = this->sampleRate;

  this->lfoSpeed = 1.0;
  this->lfoVariation = 0.001;
  this->mix = 0.0;
  this->ch0 = 0;
  this->ch1 = 0;
  this->rereverb = 0.5;
  setNumInputs(2);		    
	setNumOutputs(2);		    
	setUniqueID('sbrn');
	// DECLARE_VST_DEPRECATED(canMono) ();				      
	canProcessReplacing();	
	strcpy(programName, "Sabrina");	

  setParameter(7, 0.001f);
  // setParameter(8, 0.5f);
  
  setParameter(6, 0.83f);
  setParameter(5, 0.07f);
  setParameter(4, 0.70f);
  setParameter(3, 0.02f);
  setParameter(2, 0.70f);
  setParameter(1, 0.35f);
  setParameter(0, 0.43f);
}

void Sabrina::setSampleRate(float sampleRate)
{
    AudioEffectX::setSampleRate(sampleRate);
    sampleRateG = sampleRate;

    maxDelaySize = int(sampleRateG * 4.0); // maybe 2 instead? half the memory

    delayL.idelay = new double [maxDelaySize];
    delayR.idelay = new double [maxDelaySize];
    delayL2.idelay = new double [maxDelaySize];
    delayR2.idelay = new double [maxDelaySize];
    delayL3.idelay = new double [maxDelaySize];
    delayR3.idelay = new double [maxDelaySize];
    delayL4.idelay = new double [maxDelaySize];
    delayR4.idelay = new double [maxDelaySize];
    delayL5.idelay = new double [maxDelaySize];
    delayR5.idelay = new double [maxDelaySize];
    delayL6.idelay = new double [maxDelaySize];
    delayR6.idelay = new double [maxDelaySize];
    LDelay.idelay = new double [maxDelaySize];
    RDelay.idelay = new double [maxDelaySize];

    delayL.Initialize();
    delayR.Initialize();
    delayL2.Initialize();
    delayR2.Initialize();
    delayL3.Initialize();
    delayR3.Initialize();
    delayL4.Initialize();
    delayR4.Initialize();
    delayL5.Initialize();
    delayR5.Initialize();
    delayL6.Initialize();
    delayR6.Initialize();
    LDelay.Initialize();
    RDelay.Initialize();

    // setParameter(8, 0.5f);
    setParameter(7, 0.001f);
    setParameter(6, 0.83f);
    setParameter(5, 0.07f);
    setParameter(4, 0.70f);
    setParameter(3, 0.02f);
    setParameter(2, 0.70f);
    setParameter(1, 0.35f);
    setParameter(0, 0.43f);
}

Sabrina::~Sabrina() 
{
    // delete all memory used
}

bool Sabrina::getProductString(char* text) { strcpy(text, "Sabrina"); return true; }
bool Sabrina::getVendorString(char* text)  { strcpy(text, "We Love Walter"); return true; }
bool Sabrina::getEffectName(char* name)    { strcpy(name, "Sabrina"); return true; }
void Sabrina::setProgramName(char *name) { strcpy(programName, name); }
void Sabrina::getProgramName(char *name) { strcpy(name, programName); }
bool Sabrina::getProgramNameIndexed (VstInt32 category, VstInt32 index, char* name)
{
	if (index == 0) 
	{
	    strcpy(name, programName);
	    return true;
	}
	return false;
}

void Sabrina::setParameter(VstInt32 index, float value)
{
  
  double fintne;

  // use params field here

	switch(index)
  {  
    // Mix
    case 0: 
      if (this->fParam1 != value)
      {
        myEditor->document.getElementById("knob_mix")->setAttribute("transform", "rotate(" + std::to_string(value * 270.0) + "," 
          + std::to_string(myEditor->paramBoxCenterX[index]) + "," + std::to_string(myEditor->paramBoxCenterY[index]) + ")");
        // if (!this->myEditor->knobUpdate)
        // {
          myEditor->redrawRequested = true;
          //PostMessage(this->myEditor->hWnd,WM_PAINT,0,0);
        // }
      }
      this->fParam1 = value;
      this->mix = value;
      
      break;

    // Diffusion Size
    case 1:
      if (this->fParam2 != value)
      {
        myEditor->document.getElementById("knob_diffsize")->setAttribute("transform", "rotate(" + std::to_string(value * 270.0) + "," 
          + std::to_string(myEditor->paramBoxCenterX[index]) + "," + std::to_string(myEditor->paramBoxCenterY[index]) + ")");
        // if (!this->myEditor->knobUpdate)
        // {
          myEditor->redrawRequested = true;
          //PostMessage(this->myEditor->hWnd,WM_PAINT,0,0);
        // }
      }
      this->fParam2 = value; 
      delayL.SetOffsetSize(value);
      delayR.SetOffsetSize(value);
      delayL2.SetOffsetSize(value);
      delayR2.SetOffsetSize(value);
      delayL3.SetOffsetSize(value);
      delayR3.SetOffsetSize(value);
      delayL4.SetOffsetSize(value);
      delayR4.SetOffsetSize(value);
      delayL5.SetOffsetSize(value);
      delayR5.SetOffsetSize(value);
      delayL6.SetOffsetSize(value);
      delayR6.SetOffsetSize(value);
      break;

    // Diffusion Amount
    case 2: 
      if (this->fParam3 != value)
      {
        myEditor->document.getElementById("knob_diffamnt")->setAttribute("transform", "rotate(" + std::to_string(value * 270.0) + "," 
          + std::to_string(myEditor->paramBoxCenterX[index]) + "," + std::to_string(myEditor->paramBoxCenterY[index]) + ")");
        // if (!this->myEditor->knobUpdate)
        // {
          myEditor->redrawRequested = true;
          //PostMessage(this->myEditor->hWnd,WM_PAINT,0,0);
        // }
      }
      this->fParam3 = value; 
      delayL.feedback = value;
      delayR.feedback = value;
      delayL2.feedback = value;
      delayR2.feedback = value;
      delayL3.feedback = value;
      delayR3.feedback = value;
      delayL4.feedback = value;
      delayR4.feedback = value;
      delayL5.feedback = value;
      delayR5.feedback = value;
      delayL6.feedback = value;
      delayR6.feedback = value;
      break;

    // Delay Size
    case 3: 
      if (this->fParam4 != value)
      {
        // myEditor->redrawRequested = true;
        // PostMessage(this->myEditor->hWnd,WM_PAINT,0,0);
      }
      this->fParam4 = value;
      LDelay.offset = (double(maxDelaySize-2) * value * 0.1) + 1.0;
      RDelay.offset = (double(maxDelaySize-2) * value * 0.1) + 1.0;
      
      break;

    // Recycle
    case 4:
      if (this->fParam5 != value)
      {
        myEditor->document.getElementById("knob_recycle")->setAttribute("transform", "rotate(" + std::to_string(value * 270.0) + "," 
          + std::to_string(myEditor->paramBoxCenterX[index]) + "," + std::to_string(myEditor->paramBoxCenterY[index]) + ")");
        // if (!this->myEditor->knobUpdate)
        // {
          myEditor->redrawRequested = true;
          //PostMessage(this->myEditor->hWnd,WM_PAINT,0,0);
        // }
      }
      this->fParam5 = value;
      this->rereverb = value;
      break;

    // LFO Amplitude
    case 5: 
      if (this->fParam6 != value)
      {
        myEditor->document.getElementById("knob_lfoamp")->setAttribute("transform", "rotate(" + std::to_string(value * 270.0) + "," 
          + std::to_string(myEditor->paramBoxCenterX[index]) + "," + std::to_string(myEditor->paramBoxCenterY[index]) + ")");
        // if (!this->myEditor->knobUpdate)
        // {
          myEditor->redrawRequested = true;
          //PostMessage(this->myEditor->hWnd,WM_PAINT,0,0);
        // }
      }
      this->fParam6 = value;
      fintne = value * 0.1;
      delayL.lfopercent = fintne;
      delayR.lfopercent = fintne;
      delayL2.lfopercent = fintne;
      delayR2.lfopercent = fintne;
      delayL3.lfopercent = fintne;
      delayR3.lfopercent = fintne;
      delayL4.lfopercent = fintne;
      delayR4.lfopercent = fintne;
      delayL5.lfopercent = fintne;
      delayR5.lfopercent = fintne;
      delayL6.lfopercent = fintne;
      delayR6.lfopercent = fintne;
      LDelay.lfopercent = fintne;
      RDelay.lfopercent = fintne;
      break;

    // LFO Base Speed
    case 6: 
      if (this->fParam7 != value) 
      {
        myEditor->document.getElementById("knob_lfospeed")->setAttribute("transform", "rotate(" + std::to_string(value * 270.0) + "," 
          + std::to_string(myEditor->paramBoxCenterX[index]) + "," + std::to_string(myEditor->paramBoxCenterY[index]) + ")");
        // if (!this->myEditor->knobUpdate)
        // {
          myEditor->redrawRequested = true;
          //PostMessage(this->myEditor->hWnd,WM_PAINT,0,0);
        // }
      }
      this->fParam7 = value;
      this->lfoSpeed = ((1.0 - value) * 1.95 + 0.5) * 0.5; // 0.05 - 2.0 seconds
      delayL.InitializeMod(this->lfoSpeed,this->lfoVariation);
      delayR.InitializeMod(this->lfoSpeed,this->lfoVariation);
      delayL2.InitializeMod(this->lfoSpeed,this->lfoVariation);
      delayR2.InitializeMod(this->lfoSpeed,this->lfoVariation);
      delayL3.InitializeMod(this->lfoSpeed,this->lfoVariation);
      delayR3.InitializeMod(this->lfoSpeed,this->lfoVariation);
      delayL4.InitializeMod(this->lfoSpeed,this->lfoVariation);
      delayR4.InitializeMod(this->lfoSpeed,this->lfoVariation);
      delayL5.InitializeMod(this->lfoSpeed,this->lfoVariation);
      delayR5.InitializeMod(this->lfoSpeed,this->lfoVariation);
      delayL6.InitializeMod(this->lfoSpeed,this->lfoVariation);
      delayR6.InitializeMod(this->lfoSpeed,this->lfoVariation);
      LDelay.InitializeMod(this->lfoSpeed,this->lfoVariation);
      RDelay.InitializeMod(this->lfoSpeed,this->lfoVariation);
      break;

    // LFO Variation
    case 7:
      if (this->fParam8 != value) 
      {
        //myEditor->redrawRequested = true;
        //PostMessage(this->myEditor->hWnd,WM_PAINT,0,0);
      }
      this->fParam8 = value;
      this->lfoVariation = (1.0 - value) * 0.25;
      delayL.InitializeMod(this->lfoSpeed,this->lfoVariation);
      delayR.InitializeMod(this->lfoSpeed,this->lfoVariation);
      delayL2.InitializeMod(this->lfoSpeed,this->lfoVariation);
      delayR2.InitializeMod(this->lfoSpeed,this->lfoVariation);
      delayL3.InitializeMod(this->lfoSpeed,this->lfoVariation);
      delayR3.InitializeMod(this->lfoSpeed,this->lfoVariation);
      delayL4.InitializeMod(this->lfoSpeed,this->lfoVariation);
      delayR4.InitializeMod(this->lfoSpeed,this->lfoVariation);
      delayL5.InitializeMod(this->lfoSpeed,this->lfoVariation);
      delayR5.InitializeMod(this->lfoSpeed,this->lfoVariation);
      delayL6.InitializeMod(this->lfoSpeed,this->lfoVariation);
      delayR6.InitializeMod(this->lfoSpeed,this->lfoVariation);
      LDelay.InitializeMod(this->lfoSpeed,this->lfoVariation);
      RDelay.InitializeMod(this->lfoSpeed,this->lfoVariation);
      break;

    // RND Seed
    // case 8: 
    //   this->fParam9 = value;
    //   this->rndSeedDiff = value;

    //   // set every randomness from this
    //   double setNext;
    //   double setSize;
    //   setSize = this->fParam2;
      // setNext = delayL.SetDiffSeed(rndSeedDiff,setSize);
      // setNext = delayR.SetDiffSeed(setNext,setSize);
      // setNext = delayL2.SetDiffSeed(setNext,setSize);
      // setNext = delayR2.SetDiffSeed(setNext,setSize);
      // setNext = delayL3.SetDiffSeed(setNext,setSize);
      // setNext = delayR3.SetDiffSeed(setNext,setSize);
      // setNext = delayL4.SetDiffSeed(setNext,setSize);
      // setNext = delayR4.SetDiffSeed(setNext,setSize);
      // setNext = delayL5.SetDiffSeed(setNext,setSize);
      // setNext = delayR5.SetDiffSeed(setNext,setSize);
      // setNext = delayL6.SetDiffSeed(setNext,setSize);
      // setNext = delayR6.SetDiffSeed(setNext,setSize);
      // setNext = LDelay.SetDiffSeed(setNext,setSize);
      // setNext = RDelay.SetDiffSeed(setNext,setSize);
      // break;
    case 9: 
      this->fParam10 = value; 
      break;
  }

    //if (updateSupported)
    //{
    //updateDisplay();
    //}
    //else
    //if (!updateSupported) 
    
    // when daw(BW) sends setParam, it expects redraw
    // when editor send setParam, it expects redraw on getParameter (updatedisplay sends getparamter)
    
    // bw reacts to updatedisplay by calling getparameter for all params, 
    // when redrawwindow put in setparameter, it lags, possibly many calls each for setting

    // bitmap = document.renderToBitmap(bitmap.width(),bitmap.height());
    // DeleteObject(hdcVector);
    // hdcVector = CreateBitmap(bitmap.width(),bitmap.height(),1,32, bitmap.data());

    // HDC rdc = GetDC(this->myEditor->hWnd);
    // HDC hdcMem = CreateCompatibleDC(rdc);
    // HGDIOBJ oldone = SelectObject(hdcMem, hdcVector);
    // BitBlt(rdc,0,0,bitmap.width(),bitmap.height(), hdcMem, 0, 0, SRCCOPY); // Size
    // SelectObject(hdcMem, oldone);
    // DeleteDC(hdcMem);
    // ReleaseDC(this->myEditor->hWnd, rdc);
}

float Sabrina::getParameter(VstInt32 index)
{
	float v=0;

  switch(index)
  {
    case 0: v = this->fParam1; break;
    case 1: v = this->fParam2; break;
    case 2: v = this->fParam3; break;
    case 3: v = this->fParam4; break;
    case 4: v = this->fParam5; break;
    case 5: v = this->fParam6; break;
    case 6: v = this->fParam7; break;
    case 7: v = this->fParam8; break;
    case 8: v = this->fParam9; break;
    case 9: v = this->fParam10; break;
  }

  if (this->myEditor->knobUpdate) PostMessage(this->myEditor->hWnd,WM_PAINT,0,0);
  //if (updateSupported) 
  // if(imSending) - use updatedisplay yo call getparam
  //PostMessage(this->myEditor->hWnd,WM_PAINT,0,0);
  return v;
}

void Sabrina::getParameterName(VstInt32 index, char *label)
{
	switch(index)
  {
    // lfo modulation base speed in seconds range  = 0.00 to 2.0
    // lfo modulation speed variation margin in second range = 0.0 to 1.0
    // lfo modulation amplitude percentage (amount to apply to reduce the primary offset towards zero offset)
    // option apply to delay only, or to delay and to diffusion

    case 0: strcpy(label, "Mix"); break;
    case 1: strcpy(label, "Diffusion Size"); break;
    case 2: strcpy(label, "Diffusion Amnt"); break;
    case 3: strcpy(label, "Delay Size"); break;
    case 4: strcpy(label, "Recycle"); break;
    case 5: strcpy(label, "LFO Amplitude"); break;
    case 6: strcpy(label, "LFO Base Speed"); break;
    case 7: strcpy(label, "LFO Variation"); break;
    case 8: strcpy(label, "Diffusion Seed"); break;
    case 9: strcpy(label, "None  "); break;
  }
}

#include <stdio.h>
void int2strng(VstInt32 value, char *string) { sprintf(string, "%d", value); }

void Sabrina::getParameterDisplay(VstInt32 index, char *text)
{
	switch(index)
  {
    case 0: int2strng((VstInt32)(100 * fParam1     ), text); break;
    case 1: int2strng((VstInt32)(100 * fParam2     ), text); break;
    case 2: int2strng((VstInt32)(100 * fParam3     ), text); break;
    case 3: int2strng((VstInt32)(100 * fParam4     ), text); break;
    case 4: int2strng((VstInt32)(100 * fParam5     ), text); break;
    case 5: int2strng((VstInt32)(100 * fParam6     ), text); break;
    case 6: int2strng((VstInt32)(100 * fParam7     ), text); break;
    case 7: int2strng((VstInt32)(100 * fParam8     ), text); break;
    case 8: int2strng((VstInt32)(100 * fParam9     ), text); break;
    case 9: int2strng((VstInt32)(100 * fParam10     ), text); break;
  }
}

void Sabrina::getParameterLabel(VstInt32 index, char *label)
{
	switch(index)
  {
    case 0: strcpy(label, "%"); break;
    case 1: strcpy(label, "%"); break;
    case 2: strcpy(label, "%"); break;
    case 3: strcpy(label, "%"); break;
    case 4: strcpy(label, "%"); break;
    case 5: strcpy(label, "%"); break;
    case 6: strcpy(label, "%"); break;
    case 7: strcpy(label, "%"); break;
    case 8: strcpy(label, "%"); break;
    case 9: strcpy(label, "%"); break;
  }
}

void Sabrina::process(float **inputs, float **outputs, VstInt32 sampleFrames)
{
    processReplacing(inputs,outputs,sampleFrames);
}

void Sabrina::processReplacing(float **inputs, float **outputs, VstInt32 sampleFrames)
{
  float *in1 = inputs[0]; --in1;
  float *in2 = inputs[1]; --in2;
  float *out1 = outputs[0]; --out1;
  float *out2 = outputs[1]; --out2;
  float ioSample0, ioSample1;

  while(--sampleFrames >= 0)
  {
    ioSample0 = *++in1; ioSample1 = *++in2;
    
    this->ch0 = delayL.getDiffuse(delayL2.getDiffuse(delayL3.getDiffuse(delayL4.getDiffuse(delayL5.getDiffuse(delayL6.getDiffuse(ioSample0 + LDelay.getDelay(this->ch1) * this->rereverb))))));
    this->ch1 = delayR.getDiffuse(delayR2.getDiffuse(delayR3.getDiffuse(delayR4.getDiffuse(delayR5.getDiffuse(delayR6.getDiffuse(ioSample1 + RDelay.getDelay(this->ch0) * this->rereverb))))));

    // this->ch0 = delayL.getDiffuse(delayL2.getDiffuse(delayL3.getDiffuse(delayL4.getDiffuse(delayL5.getDiffuse(delayL6.getDiffuse(LPreDelay.getDelay(ioSample0) + LDelay.getDelay(this->ch1) * this->rereverb))))));
    // this->ch1 = delayR.getDiffuse(delayR2.getDiffuse(delayR3.getDiffuse(delayR4.getDiffuse(delayR5.getDiffuse(delayR6.getDiffuse(RPreDelay.getDelay(ioSample1) + RDelay.getDelay(this->ch0) * this->rereverb))))));

    // delayL.getDiffuse(0.0);
    // this->ch0 = delayL.modInc;
    // this->ch1 = this->ch0;

    ioSample0 = this->ch0 * this->mix + ioSample0 * (1.0-this->mix);
    ioSample1 = this->ch1 * this->mix + ioSample1 * (1.0-this->mix);

    *++out1 = ioSample0;
    *++out2 = ioSample1;
  }
}
