
/*
  WiFi UDP remote for VisSynthWeb

  -Use cc3200 WiFi link to connect a VisSynth Box
  -Use 20x4 character LCD or OLED to display UI
  -Use 4 pushbutton encoders to navigate and adjust

 */

#include <WiFi.h>
#include <LiquidCrystal.h>
#include "Encoder.h"


// TODO select LCD / OLED pins
LiquidCrystal lcd(11,12,13,14,15,16);

void encoderChange(int,int);
// TODO select encoder pins
Encoder encoders[4]={
  Encoder(1,1,1,&encoderChange),
  Encoder(1,1,1,&encoderChange),
  Encoder(1,1,1,&encoderChange),
  Encoder(1,1,1,&encoderChange)  
};

// your network name also called SSID
char ssid[] = "VisSynth Box II";
// your network password
// char password[] = "supersecret";

unsigned int localPort = 8083;      // local port to listen on

char packetBuffer[255]; //buffer to hold incoming packet
char ReplyBuffer[] = "DEADBEEF";       // a string to send back

WiFiUDP Udp;

void setup() {
  //Initialize serial and wait for port to open:
  Serial.begin(115200);
  Serial.println("VisSynth Remote");

  // init lcd
  lcd.begin(20, 4);
  lcd.println("VisSynth Remote");

  // connect WiFi  
  Serial.print("Attempting to connect to Network named: ");
  Serial.println(ssid);
  WiFi.begin(ssid);
  while ( WiFi.status() != WL_CONNECTED) {
    // print dots while we wait to connect
    Serial.print(".");
    delay(300);
  }
  
  Serial.println("\nYou're connected to the network");
  Serial.println("Waiting for an ip address");
  
  while (WiFi.localIP() == INADDR_NONE) {
    // print dots while we wait for an ip addresss
    Serial.print(".");
    delay(300);
  }

  Serial.println("\nIP Address obtained");
  printWifiStatus();

  lcd.println("Connected");

  Serial.println("\nWaiting for a connection from a client...");
  Udp.begin(localPort);
}

void encoderChange(int id, int delta)
{
    // send button event to the server
    Udp.beginPacket(Udp.remoteIP(), Udp.remotePort());
    Udp.print(id);
    Udp.print(" ");
    Udp.print(delta);
    Udp.println();
    Udp.endPacket();  
}

void loop() {

  // if there's data available, read a packet
  int packetSize = Udp.parsePacket();
  if (packetSize)
  {
    Serial.print("Received packet of size ");
    Serial.println(packetSize);
    Serial.print("From ");
    IPAddress remoteIp = Udp.remoteIP();
    Serial.print(remoteIp);
    Serial.print(", port ");
    Serial.println(Udp.remotePort());

    // read the packet into packetBufffer
    int len = Udp.read(packetBuffer, 255);
    if (len > 0) packetBuffer[len] = 0;
    Serial.println("Contents:");
    Serial.println(packetBuffer);
        
    lcd.setCursor(0, 0);
    lcd.print(packetBuffer);

    // send a reply, to the IP address and port that sent us the packet we received
    Udp.beginPacket(Udp.remoteIP(), Udp.remotePort());
    Udp.write(ReplyBuffer);
    Udp.endPacket();
  }
}


void printWifiStatus() {
  // print the SSID of the network you're attached to:
  Serial.print("SSID: ");
  Serial.println(WiFi.SSID());

  // print your WiFi IP address:
  IPAddress ip = WiFi.localIP();
  Serial.print("IP Address: ");
  Serial.println(ip);

  // print the received signal strength:
  long rssi = WiFi.RSSI();
  Serial.print("signal strength (RSSI):");
  Serial.print(rssi);
  Serial.println(" dBm");
}

