var http = require('http');
var Lcd  = require('lcd');
var Encoder = require('./encoder.js');
// provide functions needed by hardware UI

session_url='/';

put=function(url,data)
{
  console.log('PUT: '+url);
  var req=http.request({
    port:8082,
    method:'PUT',
    path:url
  });
  
  req.write(data);
  req.end();
}

get=function(url,callback)
{
  console.log('GET: '+url);
  var req=http.request({
    port:8082,
    path:url
  },function(res){
    if(!callback) return;
    res.setEncoding('utf8');
    var body='';
   res.on('data', function(chunk){
      body+=chunk;
    });
    res.on('end', function(){
      callback(body);
    })    
  });
  req.end();
}

try{
  lcd = new Lcd({rs: 174, e: 192, data: [190,191,18,21], cols: 40, rows: 2});
}catch(e)
{
  lcd=false;
  console.log(e);
};

function pad(text,length)
{
 while(text.length<length) text+=' ';
 return text;
}

var lcd_update=false;
var lcd_text='';
set_display=function(text)
{
  console.log('DISPLAY:');
  console.log(text);
  console.log('');
  
  if(!lcd) return;
  lcd_text=text;

 if(!lcd_update)
   lcd_update=setTimeout(function(){
     lcd_update=false;
     var lines=lcd_text.split('\n');
     lcd.setCursor(0, 0);
     lcd.print(pad(lines[0],40)+lines[1]);
   },100);
  
}

knobs=[];
add_knob=function(id,callback)
{
  console.log('add_knob '+id);
  
  // for stdin test feed
  knobs.push({id:id,callback:callback});

  var encoders={
    patch:function(id,callback){Encoder.add(id,22,30,29,callback); },
    layer:function(id,callback){Encoder.add(id,24,25,31,callback); },
    param:function(id,callback){Encoder.add(id,28,19,209,callback); },
    value:function(id,callback){Encoder.add(id,172,171,173,callback); },
  };

  if(encoders[id]) 
    encoders[id](id,callback);
};

process.stdin.on('readable', function(){
  process.stdin.setEncoding('utf8');
  var chunk = process.stdin.read();
  if (chunk !== null) {
    var parts=chunk.split(' ');
    var i=parseInt(parts[0]);
    var d=parseInt(parts[1]);
    if(!knobs[i]) return;
    var id=knobs[i].id;
    knobs[i].callback(id,d);
  }
});

/*process.stdin.on('end', () => {
  process.stdout.write('end');
});*/


  lcd.on('ready', function () {
    console.log('LCD ready.');
    require('./effects.js');
    require('./ui_hardware.js');
  });



