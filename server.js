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
var multiparty = require('multiparty');

//debug:
var util = require('util');

var mime_types={
	html : 'text/html',
	js   : 'application/javascript',
	json : 'application/json',
	svg  : 'image/svg+xml',
	css  : 'text/css',
	png  : 'image/png',
	jpg  : 'image/jpg',
	jpeg : 'image/jpg',
  mov  : "video/quicktime",
  mp4  : "video/mp4",
  webm : "video/webm"
};
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
    var n = key.lastIndexOf('.');
    var suffix = key.substring(n+1);
    res.setHeader("Content-Type", mime_types[suffix]);
    var instream=fs.createReadStream(key);
    instream.pipe(res);
  }
  else if(key=='upload')
	{
	
		// var writeStream = fs.createWriteStream('./testfile');
	
		var form = new multiparty.Form();
		form.uploadDir='tmp/';
		form.on('file',function(name,file){
			console.log('file: '+util.inspect(file));		
			res.writeHead(200, {'content-type': 'text/plain'});
			res.write('File received: '+file.path);
			fs.rename(file.path,'files/'+file.originalFilename)
		});
		form.parse(req, function(err, fields, files) {
			console.log('parse: '+util.inspect({fields: fields, files: files}));
      res.end();
    });
	}
  else if(key=='files')
  {
    fs.readdir("files", function(err, files) {
      res.write(JSON.stringify(files));
      res.end();
    })
  }
  else if(key=='screens')
  {
    child_process.exec('DISPLAY=:0 xrandr |grep -E -o  "[0-9]+x[0-9]+ "',function(err,stdout,stderr){
      var modes_text=stdout.split('\n');
      var modes=[];
      for(var key in modes_text)
      {
        var mode_text=modes_text[key];
        if(!mode_text) continue;
        modes.push(mode_text.trim());
      }
      res.write(JSON.stringify(modes));
      res.end();
    });
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
    //console.log('WebSocket: '+method+' '+path);    
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
    }
    else if(key.match(/screens\/.*/))
    {      
      var mode=key.split('/')[1];
      console.log('/screens: try to set mode '+mode);
      child_process.spawn('sh',['set_mode.sh',mode], {stdio:'inherit'});
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
          var target_ws=pending[key][i];
          if(target_ws.readyState!=1) // still open? 
            delete pending[key][i]; // socket is gone, remove listener (should not happen)
          else if(target_ws!=ws) // still open and not the sender itself (no echo!)
            target_ws.send(message);
        }
        //delete pending[key];
      }
    }
    else
      console.log('Invalid Websocket path:'+path);      
  });
  ws.on('close',function(){
    // remove all opts for this socket
    for (key in pending)
      for (i in pending[key])
        if(pending[key][i]==ws)
        {
          console.log('WebSocket opted out for '+key);
          pending[key].splice(i,1);
        }
  });
});


var port=8082;
server.listen(port);
console.log("Listening at:%s", port);

