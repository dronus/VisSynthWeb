import {Texture} from "./texture.js";
import {Shader} from "./shader.js";
import {filters} from "./filters.js";
import * as Generators from "./generators.js"

// create a VisSynthWeb Canvas from given HTML canvas element, session_url (for remote control)
export let Canvas = function(selector, session_url) {
    this.canvas=document.querySelector(selector);
    
    this.session_url=session_url;
    
    // preserveDrawingBuffer is needed on Chrome to make canvas.captureStream work with requestAnimationFrame:
    // - when using requestAnimationFrame to schedule canvas updates, captureStream delivers a black image
    // - using setTimeout to schedule update provides a working captureStream
    // - so does using preserveDrawingBuffer:true here.
    this.gl = this.canvas.getContext('webgl', {'preserveDrawingBuffer':true});

    // container for filter state variables..
    // filters should not add properties outside of this.
    this._={};

    // initialize (use browser canvas size as default. may be changed by user-defined via "resolution"-filter)
    // create a template texture manually as template for future ones
    this.template = new Texture(this.gl, this.canvas.width, this.canvas.height, this.gl.RGBA, this.gl.UNSIGNED_BYTE);
    // hold a list of managed spare textures
    this.spareTextures=[];
    // hold a list of garbage collected textures
    this.tempTextures=[];
    // create default texture for simpleShader
    this.texture = this.getSpareTexture();
    // create shader registry
    this.shaders={};
    // create stack
    this.stack=[];
    this.stackUnused=[];

    // the currently running effect chain
    this.chain={};

    // states for delivery of preview, screenshots and stream recordings
    this.preview_cycle=0;
    this.preview_enabled=false;
    this.screenshot_flag=false;
    this.preview_canvas=null;
    this.mediaRecorder;
    
    // time for stats and time-dependent effects
    this.frame_time=0;
    this.last_time=0;

    // the proposed fps can be set to limit the rendering fps
    this.proposed_fps=0;

    // the remote control handle (for replying to remote commands)
    this.remote = null;
}

// create a texture from a given HTML element
Canvas.prototype.toTexture=function(element) {
    return Texture.fromElement(this.gl, element);
}

// render a frame, 
// provide streaming / preview / screenshot output and
// update the visible canvas element.
Canvas.prototype.update=function() {
    // compute frame and animation time
    var current_time=Date.now();
    this.frame_time=this.frame_time*0.9 + (current_time-this.last_time)*0.1;
    this.last_time=current_time;

    // enqueue next update
    var update_handler=this.update.bind(this);
    if(this.proposed_fps)
      setTimeout(update_handler,1000/this.proposed_fps);
    else
      requestAnimationFrame(update_handler);

    // render effect chain !
    this.run_chain(current_time);

    // provide preview if requested
    if(this.preview_enabled && this.preview_cycle==1)
      this.capturePreview();
    if(this.preview_cycle==0)
      this.sendStats();
    this.preview_cycle^=1;

    // render final image to visible canvas.
    // update canvas size to texture size, if needed
    if(this.width!=this.texture.width || this.height!=this.texture.width)
    {
      this.width =this.texture.width;
      this.height=this.texture.height;
      this.canvas.width=this.width;
      this.canvas.height=this.height;
    }
    this.gl.viewport(0,0, this.width, this.height);
    // for some reason, picture is horizontally mirrored. Store it into the canvas the right way.
    filters.mirror_x.call(this,this);

    // release temporary textures
    this.gc();
    
    // take screenshot if requested
    if(this.screenshot_flag)
      this.sendScreenshot();

    // encode stream for recording if requested
    if(this.mediaRecorder)
      this.mediaRecorder.stream.getVideoTracks()[0].requestFrame();

    return this;
}

Canvas.prototype.capturePreview=function() {
  // the preview is a downscaled image provided by the 'preview' effect
  // we copy the preview pixels from the canvas just BEFORE canvas is finally drawn, which will redraw the final image.
  //
  // The 'preview' filter may be added to any chain position manually to tap the preview image between effects
  //
  // TODO skip preview filter, if it would be the last image
  //
  var ctx=this.preview_canvas.getContext('2d');
  // draw downsaled version
  ctx.drawImage(this.canvas,0,0,this.width,this.height, 0, 0, this.preview_width,this.preview_height);
}

Canvas.prototype.sendStats=function() {
  var data={frame_time:this.frame_time};
  var json=JSON.stringify(data);
  this.remote.put('stats',json);
}

Canvas.prototype.sendScreenshot=function() {
  var pixels=canvas.toDataURL('image/jpeg');
  this.remote.put('screenshot',pixels);
  this.screenshot_flag=false;
}

// replace current working texture
Canvas.prototype.putTexture=function(texture)
{
    this.releaseTexture(this.texture);
    this.texture=texture;
}

// render canvas-sized rectangle to apply a given shader to every pixel
Canvas.prototype.simpleShader=function(shader, uniforms, textureIn, textureOut) {
    var texture=(textureIn  || this.texture        );
    var target =(textureOut || this.getSpareTexture());

    texture.use();
    target .setAsTarget();
    shader.uniforms(uniforms).drawRect();

    if(!textureOut)
      this.putTexture(target);
};

// set the visible canvas as render target
Canvas.prototype.setAsTarget=function(){
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null); // remove framebuffer binding left from last offscreen rendering (as set by Texture.setAsTarget)
}

// Retrieve a working texture matched to this canvas or size settings.
//
// -If a candidate texture is given, it is validated to match the current format and returned unchanged (image is kept) if so.
//  So getSpareTexture can be easily used for lazy creation.
//
// -if there is no candidate or it is not matching the current format, a valid texture is returned (either recycled or created). The image is undefined then.
//
// If the texture is for transient use, it should be freed later by releaseTexture().
// Otherwise filters are encouraged to pass their private working textures here every frame, ensuring format updates are adopted (transiently losing the image).
//
Canvas.prototype.getSpareTexture=function(candidate_texture,width,height,format,type)
{
  var t;

  if(width && height)
    t={width:width, height:height, format:format || this.gl.RGBA, type: type || this.gl.UNSIGNED_BYTE};
  else
    t=this.template;

  var k=Texture.formatKey(t);

  if(candidate_texture)
    if(k==candidate_texture.getFormatKey())
      return candidate_texture;
    else
      this.releaseTexture(candidate_texture);

  if(!this.spareTextures[k])
    this.spareTextures[k]=[];

  if(this.spareTextures[k].length)
    return this.spareTextures[k].pop();
  else{
    console.log("canvas.getSpareTexture "+k);
    return new Texture(this.gl, t.width, t.height, t.format, t.type, t.filter);
  }
}

// release all temporary textures (called after each rendering)
Canvas.prototype.gc=function()
{
  var texture;
  while(texture=this.tempTextures.pop())
    this.releaseTexture(texture);
}

// Put a texture back to the spare pool.
//
// Do NOT use a texture afterwards, as its binding and image is undefined.
// (If the texture is bound as a target again, the application may issue a feedback loop warning)
Canvas.prototype.releaseTexture=function(texture)
{
  var k=texture .getFormatKey();
  if(!this.spareTextures[k])
    this.spareTextures[k]=[];

  this.spareTextures[k].push(texture);
}

Canvas.prototype.getShader=function(name, vertexSource, fragmentSource){
  if(!this.shaders[name])
    this.shaders[name] = new Shader(this.gl, vertexSource, fragmentSource);

  return this.shaders[name];
}

// push (copy) a texture to the "stack"
Canvas.prototype.stack_push=function(from_texture)
{
  // push given or current image onto stack
  if(!from_texture) from_texture=this.texture;


  // add another texture to empty stack pool if needed
  if(!this.stackUnused.length)
    this.stackUnused.push(this.getSpareTexture());

  // check for stack overflow
  if(this.stack.length>10) 
  {
    console.log('glfx.js video stack overflow!');
    return this;
  }
  
  // copy current frame on top of the stack
  var nt=this.stackUnused.pop();
  from_texture.copyTo(nt);
  this.stack.push(nt);

  return nt;
}

// fetch and remove the topmost texture from the "stack"
Canvas.prototype.stack_pop=function()
{
  var texture=this.stack.pop();
  if(!texture)
  {
    console.log('glfx.js video stack underflow!');
    return this.texture;
  }
  this.stackUnused.push(texture);

  return texture;
}

// prepare stack in front of running a chain.
// checks for textures still left on the stack.
Canvas.prototype.stack_prepare=function() {
  // report if stack is still full
  if(this.stack.length)
    console.log("glfx.js video stack leaks "+this.stack.length+" elements.");

  // pop any remaining elements
  while(this.stack.length)
    this.releaseTexture(this.stack.pop());
    
  // release all freed elements
  while(this.stackUnused.length)
    this.releaseTexture(this.stackUnused.pop());
}


// helper functions for chain code generation
// fetch parameters from effect, and optionally execute "generator" assigned to.
var get_param_values=function(param,t)
{
  var args=[];
  if(!(param instanceof Object)) return param;
  var fn=Generators.generators[param.type];
  return fn.call(window,t,param);
}

// render a single effect
Canvas.prototype.run_effect=function(effect,t)
{
  if(typeof effect == "string") return;
  var args=[];
  var fn=filters[effect.effect] ? filters[effect.effect] : window[effect.effect];
  for(var key in effect)
  {
    if(key=='effect') continue;
    args=args.concat(get_param_values(effect[key],t));
  }
  fn.apply(this,args);
}

// render the whole effect chain
Canvas.prototype.run_chain=function(current_time)
{
  Generators.prepare(); // reset effect chain generators to distinguish all random invocations in a single frame
  this.stack_prepare();
  for(var i=0; i<this.chain.length; i++)
    this.run_effect(this.chain[i],current_time*0.001);
  // reset switched flag, it is used by some filters to clear buffers on chain switch
  this.switched=false;
}

// set current effect chain
Canvas.prototype.setChain=function (effects)
{
  // make sure there is always a "preview" output,
  // if there is none in the chain, it is appended to the end
  // (showing the final output)
  var havePreview=false;
  for(var i=0; i<effects.length; i++)
    if(effects[i].effect=='preview')
      havePreview=true;
  if(!havePreview)
    effects.push({'effect':'preview'});

  // set chain
  this.chain=effects;

  // set canvas 'switched' flag, that can be used by filters to reset buffers
  this.switched=true;
}

// receive preview request from remote
// called by UI
Canvas.prototype.preview=function(enabled) {

  if(enabled)
  {
    if(!this.preview_canvas)
    {
      this.preview_canvas=document.createElement('canvas');
      this.preview_canvas.width=this.preview_width; 
      this.preview_canvas.height=this.preview_height;
    }
  
    if(!this.previewOut) {
      this.previewOut=true;
      import("./webrtc.js").then(async(webrtc) => {
        this.previewOut=await webrtc.WebRTC("","/webrtc_preview"+this.session_url,this.preview_canvas);
      });
    }
  }else{
    this.previewOut.hangup();
    this.previewOut=null;
  }

  // engage preview process
  this.preview_enabled=enabled;
}

// receive screenshot request from remote
// called by UI
Canvas.prototype.screenshot=function() {
  // engage screenshot process
  this.screenshot_flag=true;
}

// start canvas capture stream and deliver video to UI on stop.
// this records compressed video to RAM, until stop is called,
// the video is sent to the UI then as a single file.
// called by UI
Canvas.prototype.recording=function(enabled) {
  if(enabled)
  {
    var options = {mimeType: 'video/webm'};

    const stream = this.canvas.captureStream(0);
    stream.getVideoTracks()[0].contentHint="detail";
    console.log('Started stream capture from canvas element: ', stream);
    this.mediaRecorder = new MediaRecorder(stream, options);
    console.log('Created MediaRecorder', this.mediaRecorder, 'with options', options);

    let recordedBlobs=[];

    let remote = this.remote;
    this.mediaRecorder.onstop = function(event)
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

    this.mediaRecorder.ondataavailable = function(event)
    {
      if (event.data && event.data.size > 0) {
        recordedBlobs.push(event.data);
      }
    }
    this.mediaRecorder.start(1000);
    console.log('MediaRecorder started', this.mediaRecorder);
  }
  else
  {
    this.mediaRecorder.stop();
    this.mediaRecorder=null;
  }
}

// start canvas WebRTC stream
// called by UI
Canvas.prototype.webrtc=function(enabled) {
  if(enabled)
  {
    if(!this.webrtcOut) {
      this.webrtcOut=true;
      import("./webrtc.js").then(async(webrtc) => {
        this.webrtcOut=await webrtc.WebRTC("","/webrtc_out"+this.session_url,this.canvas);
      });
    }
  }else{
    this.webrtcOut.hangup();
    this.webrtcOut=null;
  }
}

// switch chain by index,
// called by UI
Canvas.prototype.switchChain=function(chain_index)
{
  chain_index+=2;

  // load startup chain (first three of chains.json : setup pre, current, setup after)
  var xmlHttp = new XMLHttpRequest();
  xmlHttp.open('GET','saves'+this.session_url+'chains.json',true);
  xmlHttp.send(null);
  xmlHttp.onreadystatechange=() => {
    if(xmlHttp.readyState!=4) return;
    if(xmlHttp.responseText)
    {
      var chains=JSON.parse(xmlHttp.responseText);
      if(chain_index>=chains.length) return;
      var full_chain=chains[0].concat(chains[chain_index],chains[1]);
      this.setChain(full_chain);
    }
  }
}


