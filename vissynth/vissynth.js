import {Canvas} from "./canvas.js"
import {WebsocketRemote} from "./websocket_remote.js"
import {audio_engine} from "./audio.js"
import {devices} from "./devices.js"


// install a VisSynth video effect renderer to the HTML canvas element matching given selector.
// session_url can be used to run multiple remote control sessions on the same server.
export let VisSynth = function(selector, session_url) {

  session_url="/"+(session_url ? session_url+'_' : "");
  
  // initialize canvas
  let canvas=new Canvas(selector,session_url);
  
  // initialize remote
  let command_handler=function(evt) {
    return eval(evt.data);
  };
  let remote = new WebsocketRemote(session_url);
  remote.addEventListener("command",command_handler);
  canvas.remote = remote;
  devices.addEventListener("update",function() {
    remote.put('devices',JSON.stringify(devices));
  });

  // start frequent canvas updates, once capture devices are fetched.
  devices.addEventListener("update",() => canvas.update(1),{"once":true});
  devices.update();
  
  return canvas;
}

