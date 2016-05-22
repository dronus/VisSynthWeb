

class Encoder
{
private:
  void (*callback)(int,int);
  int pinA,pinB,pinButton;

  bool stateA, stateB, stateButton;

  static Encoder* encoders[4];
  static int lastEncoder;
  
  static void globalChange(void)
  {
    for(int i=0; i<lastEncoder; i++)
    {
      Encoder* e=encoders[i];

      bool a=digitalRead(e->pinA);
      bool b=digitalRead(e->pinB);
      
      if(a!=e->stateA || b!=e->stateB)
      {
        int delta = (a!=e->stateA) == (a==b)  ? -1 : 1;
        e->callback(i,delta);
        e->stateA=a; e->stateB=b;
      }
    }
  }

  static void globalButton(void)
  {
    for(int i=0; i<lastEncoder; i++)
    {
      Encoder* e=encoders[i];

      bool button=digitalRead(e->pinButton);

      if(button!=e->stateButton)
      {
        if(button) e->callback(i,0);
        e->stateButton=button;
      }
    }
  }

public:
  Encoder(){};
  Encoder(int _pinA, int _pinB, int _pinButton, void (*_callback)(int,int))
  {
    callback=_callback;
    pinA=_pinA; pinB=_pinB; pinButton=_pinButton;
    
    pinMode(pinA,INPUT_PULLUP);
    pinMode(pinB,INPUT_PULLUP);
    pinMode(pinButton,INPUT_PULLUP);
    
    attachInterrupt(pinA, Encoder::globalChange, CHANGE);
    attachInterrupt(pinB, Encoder::globalChange, CHANGE);
    attachInterrupt(pinButton, Encoder::globalButton, CHANGE);
    
    Encoder::encoders[lastEncoder]=this;
    lastEncoder++;
  }

};

int Encoder::lastEncoder=0;
Encoder* Encoder::encoders[4];


