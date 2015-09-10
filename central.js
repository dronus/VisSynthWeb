var http = require('http');
var querystring = require('querystring');

var data={};

var server=http.createServer(function (req, res) {

  console.log("Serving "+req.url);

  var parts = req.url.split('?');
  var key=parts[0];
  var query=querystring.parse(parts[1]);  

  if(query.value)
  {
    // a new value is given, store it
    data[key]=query.value;
    res.end();
  }
  else
  {
    // no value is given, so return the old one and delete it afterwards.
    res.end(data[key]);
    delete data[key];
  }  
});

var port=8081;
server.listen(port);
console.log("Listening at:%s", port);

