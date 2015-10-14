var http = require('http');

var data={};
var pending={};

var fs=require('fs');


var server=http.createServer(function (req, res) {

  console.log("Serving "+req.url);

  var parts = req.url.split('?');
  parts[0]=parts[0].substring(1); // strip trailing / 
  var key=parts[0];

  if(req.method=='PUT')
  {
    // a new value is given, fetch body data and store it
    if(!data[key]) data[key]='';
    req.on('data',function(chunk){data[key]+=chunk;});
    req.on('end' ,function()
    {    
      res.end();
     
      // if it denotes a file, store it.
      if(key.match('.*chains.json'))
      {
        fs.writeFileSync(key,data[key]);
        delete data[key];
      }

      // answer pending requests for this key
      var waiter=pending[key];
      if(pending[key])
      {
        pending[key].end(data[key]);        
        delete pending[key];
        delete data[key];
      }
    });
  }
  else if(fs.existsSync(key) && fs.statSync(key).isFile() && key.indexOf("..")==-1)
  {
    res.setHeader("Content-Type", "text/html");
    res.end(fs.readFileSync(key));
  }
  else
  {
    if(pending[key]) pending[key].end();
    pending[key]=res;
  }  
});

var port=8082;
server.listen(port);
console.log("Listening at:%s", port);

