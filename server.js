/*
 VisSynthWeb server -
 A simple HTTP file and WebSocket message hub.
 
 - HTTP file server
  - serving the whole directory
  - serve directory 'indexes' as JSON arrays
  - allows POST uploads to directory "files/"

 - Websocket server with MQTT-like publish-subscribe- message hub, using a simple JSON protocol:
  - {'method':'get','path':PATH}  subscribes for messages on path PATH (or 'topic' in MQTT terms)
  - {'method':'put','path':PATH, 'data': data} publish DATA onto PATH,
     this JSON message is distributed as-is to all subscribers of PATH.
*/

var http = require('http');
var ws = require('ws');
var fs=require('fs');
var multiparty = require('multiparty');
// var util = require('util');

var mime_types={
  html : 'text/html',
  js   : 'application/javascript',
  json : 'application/json',
  bin   : 'application/octet-stream',
  svg  : 'image/svg+xml',
  css  : 'text/css',
  png  : 'image/png',
  jpg  : 'image/jpg',
  jpeg : 'image/jpg',
  ico : 'image/ico',
  mov  : "video/quicktime",
  mp4  : "video/mp4",
  webm : "video/webm",
  woff : "font/woff",
  ttf  : "font/ttf"
};
var data={};
var pending={};

// HTTP server for delivering the client and handle server-side commands
var server=http.createServer(function (req, res) {

  console.log("Serving "+req.url);

  var parts = req.url.split('?');
  parts[0]=parts[0].substring(1); // strip trailing / 
  var key=parts[0];

  // serve files
  if(req.method=='GET' && fs.existsSync(key) && fs.statSync(key).isFile() && key.indexOf("..")==-1)
  {
    var n = key.lastIndexOf('.');
    var suffix = key.substring(n+1);
    res.setHeader("Content-Type", mime_types[suffix] || 'application/octet-stream');
    var instream=fs.createReadStream(key);
    instream.pipe(res);
  }
  // serve directory index
  else if(req.method=='GET' && fs.existsSync(key) && fs.statSync(key).isDirectory() && key.indexOf("..")==-1)
  {
    fs.readdir(key, function(err, files) {
      res.write(JSON.stringify(files));
      res.end();
    })
  }
  // handle POST file uploads
  else if(req.method=='POST')
  {
    res.setHeader('Content-Type','text/plain');
    res.writeHead(200);
    res.write("uploading...\n"); 

    var form = new multiparty.Form({uploadDir:'tmp/',maxFilesSize:1000000000});
    form.on('progress',function(received,total){
      // provide some response to mitgate browser timeout
      // and allow for progress indicatior (WIP)
      res.write(total+'/'+received+'\n');
    });
    form.on('file',function(name,file){
      // console.log('file: '+util.inspect(file));
      res.write('File received: '+file.path);
      fs.renameSync(file.path,'files/'+file.originalFilename)
      res.end();
    });
    form.parse(req, function(err, fields, files) {
      if(err)
      {
        res.write("upload failed: "+err);
        res.end();
      }
      // console.log('parse: '+util.inspect({fields: fields, files: files}));
    });
  }
  else
    res.end();
});

// WebSocket server to forward command requests between the clients
var wss=new ws.Server({server:server});
wss.on('connection', function connection(ws) {
  ws.on('message', function incoming(message) {
    var packet=JSON.parse(message);
    var method=packet.method;

    var parts = packet.path.split('?');
    var key=parts[0].substring(1); // strip trailing / 

    // allow opt-in
    if(method=='get') 
    {
      if(!pending[key]) pending[key]=[];
      pending[key].push(ws);
      console.log('WebSocket opted in for '+key);
    }    
    else if(method=='put' && key.match(/saves\/.*/))
    {
      // if it denotes a file in saves/, store it to disk
      fs.writeFileSync(key,packet.data);
      console.log(key+' stored.');
    }
    else if(method=='put')
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
      }
    }
    else
      console.log('Invalid Websocket path:'+packet.path);
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


var port=parseInt(process.argv[2]) || 8082;
server.listen(port);
console.log("Listening at:%s", port);

