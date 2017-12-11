/**
 * Adapter for connecting a thin (low-power) remote client to the VisSynth server 
 *  -Runs besides server.js on the server machine to provide a stateless simple low-level interface
 *  -Uses hardware_ui.js as UI-defining layer, that is shared by all hardware UI's and the HTML-based emulator hardware_ui.html
 *  -Interfaces remote by low level encoder and LCD message packets over UDP
 *  -Connects the VisSynth Server by Websockets like the browser UI would do
 *  -Holds state of loaded chains
 */


var http = require('http');
var WebSocket = require('ws');

var base_host='localhost';
var base_port='8082';

var remote_host='192.168.0.102',remote_port='8083';

var websocket;
onopen=onupdate=onclose=null;
var open_socket=function()
{
  websocket=new WebSocket('ws://'+base_host+':'+base_port);
 
  console.log('WebSocket open: '+base_host);
 
  websocket.on('open',function(){
    // opt in for update feed
try{
    this.send(JSON.stringify({'method':'get', path:'/feeds'+session_url+'update',data:''}));
   }
catch(e)
{
console.log(e);
}
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
    console.log('WebSocket closed remotely.');  
    if(this==websocket) 
    {
      setTimeout(open_socket,1000);
      if(onclose) onclose();
    }
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
  websocket.close();
  base_host=host;
  open_socket();
}

put=function(url,data)
{
  console.log('PUT: '+url);
  try{
  websocket.send(JSON.stringify({'method':'put','path':url,'data':data}));  
   }
catch(e)
{
console.log(e);
}
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

// provide UDP sockets or WebSockets???
const dgram = require('dgram');
const server = dgram.createSocket('udp4');

server.on('error', function(err) {
  console.log("server error: "+err.stack);
  server.close();
});

server.on('message', function(msg, rinfo) {
  console.log("server got: "+msg+" from "+rinfo.address+":"+rinfo.port);

  var data=JSON.parse(''+msg);
  var knob_nr=data['k'];
  var delta=data['d'];

  var knob=knobs[knob_nr];
  if(!knob) return;
  knob.callback(knob.id, delta);
});

server.on('listening', function() {
  var address = server.address();
  console.log("server listening"+address.address+":"+address.port);
});

server.bind(8083);


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
  
  lcd_text=text;

 if(!lcd_update)
   lcd_update=setTimeout(function(){
     lcd_update=false;
     var lines=lcd_text.split('\n');
     var message=pad(lines[0],20)+pad(lines[1],20)+pad(lines[2],20)+pad(lines[3],20);
     var buffer=new Buffer('{'+message+'}');
     server.send(buffer,0,buffer.length,remote_port,remote_host,function(err){if(err) console.log("err: "+err)});
   },100);  
}

knobs=[];
add_knob=function(id,callback)
{
  console.log('add_knob '+id);
  
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
    knobs[i].callback(id,d);
  }
});

/*process.stdin.on('end', () => {
  process.stdout.write('end');
});*/


require('./ui_hardware_v2.js');
open_socket();




