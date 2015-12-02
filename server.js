var http = require('http');

var data={};
var pending={};

var fs=require('fs');
var path=require('path');
var child_process = require('child_process');

//var recorder_cmd="avconv -f x11grab -r 25 -s 1600x900 -i :0.0+0,0 -vcodec libx264 -pre lossless_ultrafast -threads 4 -y video.mov";
var recorder_cmd="avconv";
var recorder_args="-f x11grab -r 25 -s {RESOLUTION} -i :0.0+0,0 -vcodec libx264 -pre lossless_ultrafast -threads 4 -y video.mov"
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
      // TODO how to get w,h? UI need to send it... but it doesn't know.
      // UI may read it from "resolution" filter, but it is not sure if the capture source actually provided the resolution or the screen matches it.
      // even worse, the image is already rescaled to the desktop size, so it may be pulled up again...
      // maybe avconv can adapt the actual screen size by itself?
      var args=recorder_args.replace("{RESOLUTION}",w+"x"+h).split();
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
  else if(path.existsSync(key) && fs.statSync(key).isFile() && key.indexOf("..")==-1)
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

