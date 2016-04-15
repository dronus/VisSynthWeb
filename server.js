/*
 VisSynthWeb server - a long polling server for remote control
 
 This is a simple HTTP file server, with some special features:
 
 -REST-like long-polling pipeline
  GET requests to any location below the feeds/ path are delayed until information is placed there via a PUT request.
  A requesting client can idle on a GET request, until some remote control puts commands via PUT there. The requesting
  client is then answered immediately and the information dropped. Two web clients can send commands and data to each other
  using two path locations.
  
 -REST-like value store
  PUT requests to any location below the saves/ path store the data given as the request body to disk
  
 -Recorder tool
  the pathes recorder/start and recorder/stop allow to run and stop a hardwired avconv tool process to record the current
  screen content.
 
*/

var http = require('http');
var ws = require('ws');
var fs=require('fs');
var path=require('path');
var child_process = require('child_process');


var data={};
var pending={};

//var recorder_cmd="avconv -f x11grab -r 25 -s 1600x900 -i :0.0+0,0 -vcodec libx264 -pre lossless_ultrafast -threads 4 -y video.mov";
//var recorder_cmd="avconv";
//var recorder_args="-f x11grab -r 25 -s 1600x900 -i :0.0+0,0 -vcodec libx264 -pre lossless_ultrafast -threads 4 -y video.mov".split(" ");
var recorder_cmd="gst-launch-0.10";
var recorder_args="-e ximagesrc use-damage=0 ! ffmpegcolorspace ! nv_omx_h264enc bitrate=16000000 ! qtmux ! filesink location={FILENAME}";
var recorder=false;

// HTTP server for delivering the client and handle server-side commands
var server=http.createServer(function (req, res) {

  console.log("Serving "+req.url);

  var parts = req.url.split('?');
  parts[0]=parts[0].substring(1); // strip trailing / 
  var key=parts[0];

  if(fs.existsSync(key) && fs.statSync(key).isFile() && key.indexOf("..")==-1)
  {
    res.setHeader("Content-Type", "text/html");
    var instream=fs.createReadStream(key);
    instream.pipe(res);
  }
  else
    res.end();
});

// WebSocket server to forward command requests between the clients
var wss=new ws.Server({server:server});
wss.on('connection', function connection(ws) {
  // var location = url.parse(ws.upgradeReq.url, true);
  // you might use location.query.access_token to authenticate or share sessions
  // or ws.upgradeReq.headers.cookie (see http://stackoverflow.com/a/16395220/151312)
  ws.on('message', function incoming(message) {
    var packet=JSON.parse(message);
    var method=packet.method, path=packet.path, data=packet.data;
    console.log('WebSocket: '+method+' '+path);    
    var parts = path.split('?');
    var key=parts[0].substring(1); // strip trailing / 

    // allow opt-in
    if(method=='get') 
    {
      if(!pending[key]) pending[key]=[];
      pending[key].push(ws);
      console.log('WebSocket opted in for '+key);
    }    
    else if(key.match(/saves\/.*/))
    {
      // if it denotes a file in saves/, store it to disk
      fs.writeFileSync(key,data);
      console.log(key+' stored.');
    }
    else if(key.match(/recorder\/.*/))
    {
      if(!recorder && key.match(/recorder\/start/)){
        var args=recorder_args.replace('{FILENAME}',"recorded/"+Math.random()+".mov").split(' ');
        recorder=child_process.spawn(recorder_cmd,args, {stdio:'inherit'});
      }
      if(recorder && key.match(/recorder\/stop/)) {
        recorder.kill('SIGINT');
        recorder=false;
      }
        
      res.end();
    }
    else if(key.match(/shutdown/))
      child_process.spawn('sh',['shutdown.sh'], {stdio:'inherit'});
    else if(key.match(/restart/))
      child_process.spawn('sh',['run_chrome.sh'], {stdio:'inherit'});
    else if(key.match(/feeds\/.*/))
    {
      // if it denotes a feed in feeds/ answer pending requests for this key
      if(pending[key])
      {
        for(var i in pending[key])
        {
          console.log('deliver '+i);
          var target_ws=pending[key][i];
          if(target_ws.readyState==1) // still open
            target_ws.send(message);
          else
            delete pending[key][i]; // socket is gone, remove listener
        }
        //delete pending[key];
      }
    }
    else
      console.log('Invalid Websocket path:'+path);      
  });
});


var port=8082;
server.listen(port);
console.log("Listening at:%s", port);

