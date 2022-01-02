import {Canvas} from "./canvas.js"
import {WebsocketRemote} from "./websocket_remote.js"
import {audio_engine} from "./audio.js"





let remotes=[];

// install a VisSynth video effect renderer to the HTML canvas element matching given selector.
// session_url can be used to run multiple remote control sessions on the same server.
export let VisSynth = function(selector, session_url) {

  // initialize canvas
  let canvas=new Canvas(selector,session_url);
  
  // initialize remote
  let command_handler=function(js) {
    return eval(js);
  };
  let remote = new WebsocketRemote(session_url, command_handler);
  canvas.remote = remote;
  remotes.push(remote);
  
  // set video handler.
  // the video devices are started on demand.
  // this is used by the 'capture' effect to acquire the camera.
  canvas.video_source=get_video;

  // start frequent canvas updates
  canvas.update();
}

// enumerate the available sources at startup
var source_ids={audio:[],video:[]};
var onSourcesAcquired=function(sources)
{
  source_ids={audio:[],video:[]};
  for (var i = 0; i != sources.length; ++i) {
    var source = sources[i];
    var kind=source.kind;

    // on the newer navigator.mediaDevices.enumerateDevices interface, kind is "audioinput" or "videoinput" and so on..
    kind=kind.replace('input','');

    if(kind=='audio' || kind=='video')
    {
      source_ids[kind].push(source.id || source.deviceId);
    }
  }
  // send out device data to UI
  for(let remote of remotes)
    remote.put('devices',JSON.stringify(sources));
  // pass to audio_engine
  audio_engine.source_ids=source_ids;
}

// get the video feed from a capture device name by source_index into source_ids
// opens the capture device and starts streaming on demand
// the consumer may receive a still starting <video> object, so it has to add and handle 'canplay' event before properties like videoWidth are read.
//
// TODO this also grabs one audio source, selected by audio_device_index if not already done.
// this should be done somewhere else (eg. audio depending filters) but if we don't do it now,
// the user may be asked twice, first for camera, then for microphone.
// There is no clean solution to this, as any chain may use any audio / video source...
// maybe we should at least delay device grabbing until the pre_chain is evaluated for the first time,
// we can then ask for the sources that will most likely be the only ones for the full session.
var videos={};
var get_video=function(source_index,width,height)
{
  source_index = source_index | 0;

  // just return video, if already started
  if(videos[source_index])
    return videos[source_index];

  console.log("Acquire stream for device index "+source_index);

  // create a new <video> element for decoding the capture stream
  var video = document.createElement('video');
  videos[source_index]=video;

  var constraints = {
    video:
    {
      deviceId: source_ids.video[source_index],
      width:{}, height:{}
    },
    audio:false
  };

  // enforce resolution, if asked to
  if(width && height)
  {
      constraints.video.width=width;  constraints.video.height=height;
  }

  navigator.mediaDevices.getUserMedia(constraints).then(function(stream){
    console.log("Got camera!");

    requestAnimationFrame(function(){});

    // capture device was successfully acquired
    video.autoplay = true;
    video.muted=true;
    if (video.srcObject !== undefined)
      video.srcObject = stream;
    else if (video.mozSrcObject !== undefined)
      video.mozSrcObject = stream;
    else
      video.srcObject = stream;
      video.play();
  });
}

// list available capture devices
// called by UI
var devices=function()
{
  if(navigator.mediaDevices.enumerateDevices)
    navigator.mediaDevices.enumerateDevices().then(onSourcesAcquired);
  else
    onSourcesAcquired([]);
}
// fetch available capture devices for the first time and report them to UI.
devices();

