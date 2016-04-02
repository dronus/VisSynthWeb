var http = require('http');
var Lcd  = require('lcd');

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
  lcd.on('ready', function () {
    console.log('LCD ready.');
  });
}catch(e)
{
  lcd=false;
  console.log(e);
};

set_display=function(text)
{
  console.log('DISPLAY:');
  console.log(text);
  console.log('');
  
  if(!lcd) return;
  lcd.setCursor(0, 0);
  lcd.print(text, function (err) {
    if (err) {
      throw err;
    }
  });
}

knobs=[];
add_knob=function(id,callback)
{
  // TODO implement  
  console.log('add_knob '+id+' STUB');
  
  // for stdin test feed
  knobs.push({id:id,callback:callback});
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
    knobs[i].callback(id,d==0 ? 'press' : 'change',d);
  }
});

/*process.stdin.on('end', () => {
  process.stdout.write('end');
});*/


require('./effects.js');
require('./ui_hardware.js');



