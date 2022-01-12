
export let WebsocketRemote=function (session_url,command_handler) {
  // establish WebSocket connection to command server
  var websocket;
  var open_socket=function()
  {
    websocket=new WebSocket((document.location.protocol=='https:'?'wss:':'ws:')+'//'+document.location.hostname+':'+document.location.port+document.location.pathname.replace('index.html',''));
    websocket.onopen=function(){
      // opt in for commands
      websocket.send(JSON.stringify({'method':'get', path:'/feeds'+session_url+'command',data:''}));
    };
    // opt-in for command feed from remote control server
    websocket.onmessage=function(event)
    {
      var packet=JSON.parse(event.data);
      var path=packet.path, message=packet.data;

      if(path=='/feeds'+session_url+'command')
      {
        let result = command_handler(message);
        if(result){
          remote.put('result',JSON.stringify(result));
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

