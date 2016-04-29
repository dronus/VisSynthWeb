var http = require('http');
var Lcd  = require('lcd');
var Encoder = require('./encoder.js');
var WebSocket = require('ws');


var base_host='nf-vissynthbox-ii.local';
var base_port='8082';


var websocket;
onopen=onupdate=onclose=null;
var open_socket=function()
{
  websocket=new WebSocket('ws://'+base_host+':'+base_port);
 
  console.log('WebSocket open: '+base_host);
 
  websocket.on('open',function(){
    // opt in for update feed
    this.send(JSON.stringify({'method':'get', path:'/feeds'+session_url+'update',data:''}));
    console.log('WebSocket open.');
    if(onopen) onopen();
  });
  websocket.on('message', function(data)
  {
    var packet=JSON.parse(data);
    var path=packet.path, message=packet.data;        
    if(path=='/feeds'+session_url+'update')
    {
      if(onupdate) onupdate(message);
    }
  });
  websocket.on('close',function()
  {
    console.log('WebSocket closed.');  
    setTimeout(open_socket,1000);
    if(onclose) onclose();
  });
  websocket.on('error',function(err)
  {
    console.log('WebSocket error: '+err);
  });
}



// provide functions needed by hardware UI

session_url='/';

set_host=function(host)
{
  base_host=host;
  websocket.close();
  open_socket();
}

put=function(url,data)
{
  console.log('PUT: '+url);
  websocket.send(JSON.stringify({'method':'put','path':url,'data':data}));  
}

get=function(url,callback,error_callback)
{
  console.log('GET: '+url);
  var req=http.request({
    host:base_host,
    port:base_port,
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
  }).on('error',function(err){
    console.log('GET error: '+url+' '+err);
    // delay callback for 1s as we would otherwise do repeated roundtrips without delay for long polling calls
    error_callback(url);
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
  require('./ui_hardware.js');
  open_socket();
});




