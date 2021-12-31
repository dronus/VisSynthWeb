import {Canvas} from "./canvas.js"
import {filters} from "./filters.js"
import {initAudioAnalysers} from "./audio.js"
import {generators,prepare} from "./generators.js"
import {WebsocketRemote} from "./websocket_remote.js"


let command_handler=function(js) {
  return window.eval("with(remote_cmds){"+js+"}");
}

let remote;


var time=0,frame_time=0; // running time
var preview_cycle=0;
var preview_enabled=false;
var screenshot_cycle=0;
var preview_canvas=null;
var chain=null;

var canvas;

// main update function, shows video frames via glfx.js canvas
var update = function()
{
  // enqueue next update
  if(canvas.proposed_fps)
    setTimeout(function(){
      requestAnimationFrame(update);
    },1000/canvas.proposed_fps);
  else
    requestAnimationFrame(update);

  // get animation time
  var current_time=Date.now();
  frame_time=frame_time*0.9 + (current_time-time)*0.1;
  time=current_time;
  var effect_time=time*0.001; // 1 units per second

  // run effect chain
  prepare(); // reset effect chain generators to distinguish all random invocations in a single frame
  if(chain) run_chain(chain,canvas,effect_time);

  // provide preview if requested
  // the preview is a downscaled image provided by the 'preview' effect
  // we crop the preview pixels of the canvas just BEFORE canvas.update, which will redraw the full resolution canvas.
  //
  // in repsect to just downsizing the final image this has two benefits:
  //
  // 1) it is much faster, as rescaling is done in WebGL context and not by 2d context drawImage
  //
  // 2) The 'preview' filter may be added to any chain position manually to tap the preview image between effects
  //
  if(preview_enabled && preview_cycle==1)
  {
    if(!preview_canvas)
    {
      preview_canvas=document.createElement('canvas');
      preview_canvas.width=canvas.preview_width; preview_canvas.height=canvas.preview_height;
    }
    var ctx=preview_canvas.getContext('2d');
    ctx.drawImage(canvas,0,canvas.height-canvas.preview_height,canvas.preview_width,canvas.preview_height, 0, 0, canvas.preview_width,canvas.preview_height);
  }
  else if(preview_cycle==0)
  {
    var jpeg=preview_enabled ? preview_canvas.toDataURL('image/jpeg') : null;
    var data={frame_time:frame_time, jpeg:jpeg};
    var json=JSON.stringify(data);
    remote.put('preview',json);

    // only provide data every other frame if a preview image is send.
    // if only frame rate data is send, we keep the network calm.
    preview_cycle=preview_enabled ? 2 : 2;
  }
  preview_cycle--;

  // redraw visible canvas
  canvas.update();

  // reset switched flag, it is used by some filters to clear buffers on chain switch
  canvas.switched=false;

  // take screenshot if requested
  if(screenshot_cycle==1)
  {
    var pixels=canvas.toDataURL('image/jpeg');
    remote.put('screenshot',pixels);
    screenshot_cycle=0;
  }

  // take movie stream export frame if requested
  if(recorderContext)
  {
    // TODO if this is done for WebRTC, only do this copy if stream is actually running.
    recorderContext.drawImage(canvas,0,0);
    if(mediaRecorder) mediaRecorder.stream.getVideoTracks()[0].requestFrame();
  }
};

// enumerate the available sources at startup
var source_ids={audio:[],video:[]};
var running=false;
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
  remote.put('devices',JSON.stringify(sources));
}

export var start=function(selector, session_url) {
  // initialize remote
  remote  = new WebsocketRemote(session_url, command_handler);
  
  // initialize canvas
  canvas=new Canvas(selector);
  // set video handler.
  // the video devices are started on demand.
  // this is used by the 'capture' effect to acquire the camera.
  canvas.video_source=get_video;

  // start frequent canvas updates
  if(!running)
  {
    running=true;
    update();
  }
}

// let the remote change the audio source
//
// this is a global function that is therefore available as a setup function in the filter chain
// TODO find a cleaner way to provide this function
//
var audio_device_index=0;
var audio_found=-1;
window.select_audio=function(device_index)
{
  audio_device_index=parseInt(device_index);
  if(audio_found==audio_device_index) return;
  audio_found=audio_device_index;

  var constraints = {
    video: false,
    audio:{deviceId:source_ids.audio[audio_device_index]}
  };
  navigator.mediaDevices.getUserMedia(constraints).then(function(stream){
    console.log("Got audio: "+constraints.audio.deviceId);
    // capture device was successfully acquired
    if(stream.getAudioTracks().length) initAudioAnalysers(stream);
  });
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


// helper functions for chain code generation

var get_param_values=function(param,canvas,t)
{
  var args=[];
  if(!(param instanceof Object)) return param;
  var fn=generators[param.type]; // from generators.js
  return fn.call(window,t,param);
}

var run_effect=function(effect,canvas,t)
{
  if(typeof effect == "string") return;
  var args=[];
  var fn=filters[effect.effect] ? filters[effect.effect] : window[effect.effect];
  for(var key in effect)
  {
    if(key=='effect') continue;
    args=args.concat(get_param_values(effect[key],canvas,t));
  }
  fn.apply(canvas,args);
}

var run_chain=function(chain,canvas,t)
{
  canvas.stack_prepare();
  for(var i=0; i<chain.length; i++)
    run_effect(chain[i],canvas,t);
}

// functions called by remote control
window.remote_cmds={};

// set effect chain to render
remote_cmds.setChain=function (effects)
{
  var havePreview=false;
  for(var i=0; i<effects.length; i++)
    if(effects[i].effect=='preview')
      havePreview=true;
  if(!havePreview)
    effects.push({'effect':'preview'});

  // set chain
  chain=effects;

  // set canvas 'switched' flag, that can be used by filters to reset buffers
  canvas.switched=true;
}

// receive device list request from remote
remote_cmds.devices=function()
{
  if(navigator.mediaDevices.enumerateDevices)
    navigator.mediaDevices.enumerateDevices().then(onSourcesAcquired);
  else
    onSourcesAcquired([]);
}
// fetch available capture devices for the first time and report them to UI.
// Also starts the rendering engine after device enumeration.
remote_cmds.devices();

// receive preview request from remote
remote_cmds.preview=function(enabled)
{
  // engage preview process
  preview_enabled=enabled;
  preview_cycle=2;
}

// receive screenshot request from remote
remote_cmds.screenshot=function()
{
  // engage screenshot process
  screenshot_cycle=1;
}

let mediaRecorder;
let recordedBlobs = [];
let recorderContext=null;
let recorderCanvas=null;

remote_cmds.stream=function(enabled) {
  if(enabled)
  {
    var options = {mimeType: 'video/webm'};

    if(!recorderContext) {
      recorderCanvas=document.createElement('canvas');
      recorderCanvas.width=canvas.width;
      recorderCanvas.height=canvas.height;
      recorderContext=recorderCanvas.getContext('2d');
    }

    const stream = recorderCanvas.captureStream(0);
    stream.getVideoTracks()[0].contentHint="detail";
    console.log('Started stream capture from canvas element: ', stream);
    mediaRecorder = new MediaRecorder(stream, options);
    console.log('Created MediaRecorder', mediaRecorder, 'with options', options);

    mediaRecorder.onstop = function(event)
    {
      console.log('Recorder stopped: ', event);
      const blob = new Blob(recordedBlobs, {type: 'video/webm'});
      const a = new FileReader();
      a.onload = function(e) {
        remote.put('screenshot',e.target.result);
      }
      a.readAsDataURL(blob);
      recordedBlobs = [];
    };

    mediaRecorder.ondataavailable = function(event)
    {
      if (event.data && event.data.size > 0) {
        recordedBlobs.push(event.data);
      }
    }
    mediaRecorder.start(1000);
    console.log('MediaRecorder started', mediaRecorder);
  }
  else
  {
    mediaRecorder.stop();
    mediaRecorder=null;
  }
}

let webrtcOut=null;
remote_cmds.webrtc=function(enabled) {
  if(enabled)
  {
    if(!recorderContext) {
      recorderCanvas=document.createElement('canvas');
      recorderCanvas.width=canvas.width;
      recorderCanvas.height=canvas.height;
      recorderContext=recorderCanvas.getContext('2d');
    }
    if(!webrtcOut) {
      webrtcOut=true;
      import("./webrtc.js").then(async(webrtc) => {
        webrtcOut=await webrtc.WebRTC("",recorderCanvas);
      });
    }
  }else{
    webrtcOut.hangup();
    webrtcOut=null;
    recorderContext=null;
  }
}

remote_cmds.switchChain=function(chain_index)
{
  chain_index+=2;

  // load startup chain (first three of chains.json : setup pre, current, setup after)
  var xmlHttp = new XMLHttpRequest();
  xmlHttp.open('GET','saves'+session_url+'chains.json',true);
  xmlHttp.send(null);
  xmlHttp.onreadystatechange=function(){
    if(xmlHttp.readyState!=4) return;
    if(xmlHttp.responseText)
    {
      var chains=JSON.parse(xmlHttp.responseText);
      if(chain_index>=chains.length) return;
      var full_chain=chains[0].concat(chains[chain_index],chains[1]);
      setChain(full_chain);
    }
  }
}

