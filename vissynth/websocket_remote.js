
export let WebsocketRemote=function (session_url, server_url) {

  let dispatcher=new EventTarget();
  let feeds = {};
  // establish WebSocket connection to command server
  var websocket;
  var open_socket = () =>
  {
    server_url = server_url || (document.location.protocol=='https:'?'wss:':'ws:')+'//'+document.location.hostname+':'+document.location.port+document.location.pathname.replace('index.html','');
    websocket=new WebSocket(server_url);
    websocket.onopen=function(){
      // opt in for commands
      for(let feed in feeds)
        websocket.send(JSON.stringify({'method':'get', path:'/feeds'+session_url+feed,data:''}));
    };
    // opt-in for command feed from remote control server
    websocket.onmessage = event =>
    {
      var packet=JSON.parse(event.data);

      let base_path = '/feeds'+session_url;
      if(!packet.path.startsWith(base_path)) return;
      let key=packet.path.substr(base_path.length);
      let new_event = new Event(key);
      new_event.data =  packet.data;
      dispatcher.dispatchEvent(new_event);
    }
    websocket.onclose=function()
    {
      setTimeout(open_socket,1000);
    }
  }
  open_socket();

  this.addEventListener = function(type, listener, options) {
    if(!feeds[type] && websocket.readyState == 1)
      websocket.send(JSON.stringify({'method':'get', path:'/feeds'+session_url+type,data:''}));
    feeds[type]=true;

    dispatcher.addEventListener(type, (evt) => {
      let result = listener(evt);
      if(result)
        this.put('result',JSON.stringify(result));
    } , options);
  }

  this.put=function(path,data){
    if(websocket.readyState)
      websocket.send(JSON.stringify({'method':'put', path:'/feeds'+session_url+path,data:data}));
  }
}

