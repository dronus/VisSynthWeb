var http = require('http');
var querystring = require('querystring');

var data={};

var fs=require('fs');

var server=http.createServer(function (req, res) {

  console.log("Serving "+req.url);

  var parts = req.url.split('?');
  parts[0]=parts[0].substring(1); // strip trailing / 
  var key=parts[0];
  var query=querystring.parse(parts[1]);  

  if(query.value)
  {
    // a new value is given, store it
    data[key]=query.value;
    res.end();
  }
  else if(fs.existsSync(parts[0]) && fs.statSync(parts[0]).isFile())
  {
    res.setHeader("Content-Type", "text/html");
    res.end(fs.readFileSync(parts[0]));
  }
  else
  {
    // no value is giiven, so return the old one and delete it afterwards.
    res.end(data[key]);
    delete data[key];
  }  
});

var port=8082;
server.listen(port);
console.log("Listening at:%s", port);

