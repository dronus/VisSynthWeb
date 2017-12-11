var Lcd  = require('lcd');

try{
  lcd = new Lcd({rs: 174, e: 192, data: [190,191,18,21], cols: 40, rows: 2});
  lcd.on('ready',function(){
     lcd.setCursor(0, 0);
     lcd.print('VisSynth Box 0.1 booting... ');
  });
}catch(e)
{
  lcd=false;
  console.log(e);
};
