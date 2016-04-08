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

var data={};
var pending={};

var fs=require('fs');
var path=require('path');
var child_process = require('child_process');

//var recorder_cmd="avconv -f x11grab -r 25 -s 1600x900 -i :0.0+0,0 -vcodec libx264 -pre lossless_ultrafast -threads 4 -y video.mov";
var recorder_cmd="avconv";
var recorder_args="-f x11grab -r 25 -s 1600x900 -i :0.0+0,0 -vcodec libx264 -pre lossless_ultrafast -threads 4 -y video.mov".split(" ");
var recorder=false;

var server=http.createServer(function (req, res) {

  
  console.log("Serving "+req.url);

  var parts = req.url.split('?');
  parts[0]=parts[0].substring(1); // strip trailing / 
  var key=parts[0];

  if(req.method=='PUT')
  {
    // a new value is given, fetch body data and store it
    data[key]='';
    req.on('data',function(chunk){data[key]+=chunk;});
    req.on('end' ,function()
    {    
      res.end();
     
      if(key.match(/saves\/.*/))
      {
        // if it denotes a file in saves/, store it to disk
        fs.writeFileSync(key,data[key]);
        delete data[key];
        console.log(key+' stored.');
      }      
      else if(key.match(/feeds\/.*/) && pending[key])
      {
        // if it denotes a feed in feeds/ answer pending requests for this key
        pending[key].end(data[key]);        
        delete pending[key];
        delete data[key];
      }
      else if(key.match(/shutdown/))
      	child_process.spawn('sh',['shutdown.sh'], {stdio:'inherit'});
      else if(key.match(/restart/))
      	child_process.spawn('sh',['run_chrome.sh'], {stdio:'inherit'});
      else
        res.end('Invalid PUT path');
    });
  }
  else if(key.match(/feeds\/.*/))
  {
    // data in feeds/ is delivered by long polling
    if(pending[key]) pending[key].end();
    pending[key]=res;
  }  
  else if(key.match(/recorder\/.*/))
  {
    if(!recorder && key.match(/recorder\/start/)){
      recorder_args.pop();
      recorder_args.push("recorded/"+Math.random()+".mov");
      recorder=child_process.spawn(recorder_cmd,recorder_args, {stdio:'inherit'});
    }
    if(recorder && key.match(/recorder\/stop/)) {
      recorder.kill('SIGTERM');
      recorder=false;
    }
      
    res.end();
  }
  else if(fs.existsSync(key) && fs.statSync(key).isFile() && key.indexOf("..")==-1)
  {
    res.setHeader("Content-Type", "text/html");
    var instream=fs.createReadStream(key);
    instream.pipe(res);
  }
  else
    res.end();
});

var port=8082;
server.listen(port);
console.log("Listening at:%s", port);

