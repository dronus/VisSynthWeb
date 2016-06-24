
#include <OLEDFourBit.h>
#include <stdio.h>





#define redFlyReset 2


void die(const char* msg)
{
  Serial.println(msg);
}

bool redFlyTimeout(int ms)
{
  int j;
  for(j=0;!Serial1.available() && j<ms; j++) delay(1);
  if(j==ms) return false;
  else      return true;
}

void redFlyFlush()
{
  while (Serial1.available()) 
  {
    Serial1.read();
    if(!Serial1.available()) delay(3);
  }
}

bool redFlyInit()
{
  pinMode(redFlyReset,OUTPUT);

  digitalWrite(redFlyReset,LOW);
  delay(50);
  digitalWrite(redFlyReset,HIGH);
  delay(110);
  
  Serial1.begin(9600);
  
  //auto baud rate detection
  for(int i=4; i!=0; i--) //try 4 times
  {
    Serial1.write(0x1C); //transmit 0x1C
    if(!redFlyTimeout(200)) continue;
    if(Serial1.read() == 0x55) //wait for 0x55
    {
      Serial1.write(0x55); //transmit 0x55
      redFlyTimeout(100);
      redFlyFlush();
      //skip firmware upgrade question at power on
      Serial1.write('n');
      Serial1.write('\n');

      redFlyTimeout(1000);  // "Loading..."
      redFlyFlush();
      redFlyTimeout(2000);  // "Loaded"
      redFlyFlush();

      return true;
    }
  }
  return false;
}

bool redFlyCommand(const char* cmd)
{
  char response[256];
  size_t size=256;

  response[0]=='E';  // do not allow OK if no answer

  redFlyFlush();
//  delay(100);
  Serial1.print(cmd);
  Serial1.print("\r\n");

  while(!Serial1.available()); // wait for response
  pinMode(BLUE_LED,OUTPUT);
  digitalWrite(BLUE_LED,HIGH);
  int i=0;
  for (; i<size && Serial1.available(); i++) {
    response[i]=Serial1.read();
    if(response[i]=='\n') break; 
    for(int j=0; !Serial1.available() && j<333; j++) delay(3);  // wait max. 1000ms acquire response
  }
  digitalWrite(BLUE_LED,LOW);  

  if(i==size)
  {
    Serial.print("RedFly Response Overflow at: ");
    Serial.println(cmd);
    response[i-1]=0;    
    Serial.println(response);
    return false;
  }
  if(i>0 && response[i]!='\n') 
  {
    Serial.print("RedFly Timeout at: ");
    Serial.println(cmd);
    Serial.println(response);
    return false;
  }
  response[i]=0;

  redFlyFlush();

  if(response[0]=='O') 
    return true;  // OK
  else
  {
    Serial.print("RedFly Error at: ");
    Serial.println(cmd);
    Serial.println(response);
    return false;   // ERROR or something
  }
}


bool redFlySend(const char* cmd)
{
  redFlyCommand(cmd);
}

void redFlyWait()
{
  while(!Serial1.available()); // wait for response
  redFlyFlush();
}


// initialize the library with the numbers of the interface pins
// LiquidCrystal lcd(54,53,52,51,50,49,48);
OLEDFourBit lcd(70,69,68,67,66,65,64);




void setup() {
 

  pinMode(71,OUTPUT);
  digitalWrite(71,LOW);  // disable 5v regulator
 
  pinMode(63,OUTPUT);
  digitalWrite(63,LOW);  // CS
  pinMode(62,OUTPUT);
  digitalWrite(62,LOW); // RESET
  delay(100);
  digitalWrite(62,HIGH); // RESET
  delay(100);

  lcd.begin(20, 4);

  //pinMode(BLUE_LED,OUTPUT);
  //analogWrite(BLUE_LED,15);
  //analogWrite(GREEN_LED,10);


  //attachInterrupt(60,isr1,RISING,1);
//  GPIO_setCallback(PUSH2,isr1);
//  GPIO_enableInt(PUSH2);

//  attachInterrupt(PUSH1,isr1,RISING);
/*  attachInterrupt(54,isr0,CHANGE);
  attachInterrupt(55,isrB,CHANGE);  */



  Serial.begin(9600);

  lcd.home();
  lcd.print("INIT ");

  bool success=false;

  while(!success)
  {
    Serial.println("RedFly init");
    if(!redFlyInit())
      die("RedFly init error.");
    else
      Serial.println("RedFly ready.");

    if(!redFlyCommand("AT+RSI_BAND=0")) continue;
    if(!redFlyCommand("AT+RSI_INIT")) continue;
    if(!redFlyCommand("AT+RSI_NETWORK=IBSS,0,0")) continue;
    if(!redFlyCommand("AT+RSI_AUTHMODE=4")) continue;
    if(!redFlyCommand("AT+RSI_SCAN=0")) continue;
    if(!redFlyCommand("AT+RSI_JOIN=VisSynthBox II,0,0")) continue;
    if(!redFlyCommand("AT+RSI_IPCONF=0,168.254.20.10,255.255.0.0,168.254.10.10")) continue;
    if(!redFlyCommand("AT+RSI_LUDP=8083")) continue;
    if(!redFlyCommand("AT+RSI_UDP=168.254.10.10,8083,9083")) continue;

    success=true;
  }
  
  Serial.println("RedFly init succeed.");

  lcd.print("READY");

  pinMode(RED_LED,OUTPUT);
  digitalWrite(RED_LED,HIGH);
}



class Encoder
{
  public: 
    uint8_t p0,p1,pb;
    uint8_t state=0;
    int delta;
    bool pressed;
    int id;

    Encoder(int _id, uint8_t _p0, uint8_t _p1, uint8_t _pb)
    {
      id=_id; p0=_p0; p1=_p1; pb=_pb;
    };
    
    void update()
    {
      pinMode(p0,INPUT_PULLDOWN);
      pinMode(p1,INPUT_PULLDOWN);
      pinMode(pb,INPUT_PULLDOWN);

      uint8_t new_state=digitalRead(p0)+digitalRead(p1)*2+digitalRead(pb)*4;
      if(new_state != state)
      {
        uint8_t change=new_state ^ state;
        if(change==4)
        {
          if(new_state==4) pressed=true;
        }
        else if(new_state==1)
        {
          uint8_t pin=change-1;
          int d=pin*2-1;
          delta+=d;          
        }
      }  
      state=new_state;
    }
    
    void check(void(*callback)(int,int))
    {
      if(delta!=0)
      {
        int tmp_delta=delta;
        delta=0;
        callback(id,tmp_delta);
      }
      if(pressed)
      {
        pressed=false;
        callback(id,0);
      }
    };
};


int value=0;
void encoder_callback(int id, int d)
{
  value+=d;
  // if(d==0) lcd.println("PRESS");
  // else     lcd.println(value);

  String msg="{\"k\":";
  msg+=String(id)+",\"d\":"+String(d)+"}\n";
  String cmd="AT+RSI_SND=2,";
  cmd+=msg.length();
  cmd+=",8080,192.168.0.2,";
  cmd+=msg;

  redFlySend(cmd.c_str());
}


#define pin_eb 55
#define pin_e1 54
#define pin_e0 53


Encoder enc0(0,53,54,55);
Encoder enc1(1,50,51,52);
Encoder enc2(2,47,48,49);
Encoder enc3(3,44,45,46);

String buffer;
void loop() {
  enc0.check(encoder_callback);
  enc1.check(encoder_callback);
  enc2.check(encoder_callback);
  enc3.check(encoder_callback);      
  
  int i=0;
  buffer="";
  if(Serial1.available())
  {
    while(Serial1.available()){
      char c=Serial1.read();
      Serial.print(c);
      if(c>30 && c<128) buffer+=c;
      if(!Serial1.available()) delay(2);
    }
    int opening=buffer.lastIndexOf("{");
    int closing=buffer.lastIndexOf("}");
    if(opening>0 && closing > 0) 
      buffer=buffer.substring(opening+1,closing);
    while(buffer.length()<40) buffer+=" ";
    lcd.home();
    lcd.print(buffer);
  }
  
  
}

