
export let WebsocketRemote=function (session_url,feeds) {
  // establish WebSocket connection to command server
  var websocket;
  var open_socket = () =>
  {
    websocket=new WebSocket((document.location.protocol=='https:'?'wss:':'ws:')+'//'+document.location.hostname+':'+document.location.port+document.location.pathname.replace('index.html',''));
    websocket.onopen=function(){
      // opt in for commands
      for(let feed in feeds)
        websocket.send(JSON.stringify({'method':'get', path:'/feeds'+session_url+feed,data:''}));
    };
    // opt-in for command feed from remote control server
    websocket.onmessage = event =>
    {
      var packet=JSON.parse(event.data);
      var path=packet.path, message=packet.data;

      let base_path = '/feeds'+session_url;
      if(!path.startsWith(base_path)) return;
      let key=path.substr(base_path.length);
      let handler=feeds[key];
      if(handler)
      {
        let result = handler(message);
        if(result){
          this.put('result',JSON.stringify(result));
        }
      }
    }
    websocket.onclose=function()
    {
      setTimeout(open_socket,1000);
    }
  }
  open_socket();

  this.put=function(path,data){
    if(websocket.readyState)
      websocket.send(JSON.stringify({'method':'put', path:'/feeds'+session_url+path,data:data}));
  }
}

