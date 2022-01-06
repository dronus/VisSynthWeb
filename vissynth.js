import {Canvas} from "./canvas.js"
import {WebsocketRemote} from "./websocket_remote.js"
import {audio_engine} from "./audio.js"
import {devices} from "./devices.js"




let remotes=[];

// install a VisSynth video effect renderer to the HTML canvas element matching given selector.
// session_url can be used to run multiple remote control sessions on the same server.
export let VisSynth = function(selector, session_url) {

  session_url="/"+(session_url ? session_url+'_' : "");
  
  // initialize canvas
  let canvas=new Canvas(selector,session_url);
  
  // initialize remote
  let command_handler=function(js) {
    return eval(js);
  };
  let remote = new WebsocketRemote(session_url, command_handler);
  canvas.remote = remote;
  remotes.push(remote);

  // start frequent canvas updates
  canvas.update();
  
  return canvas;
}

devices.addEventListener("update",function() {
  for(let remote of remotes)
    remote.put('devices',JSON.stringify(devices));
});

// force update available capture devices to send out
// called by UI
var get_devices=function() {
  devices.update();
}

