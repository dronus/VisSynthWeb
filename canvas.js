import {Texture} from "./texture.js";
import {Shader} from "./shader.js";
import {filters} from "./filters.js";
import * as Generators from "./generators.js"

// canvas and gl are available at global scope

export let Canvas = function(selector, session_url) {
    this.canvas=document.querySelector(selector);
    
    this.session_url=session_url;
    
    this.gl = this.canvas.getContext('experimental-webgl', { alpha: false, premultipliedAlpha: false });

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

    this.chain={};

    this.preview_cycle=0;
    this.preview_enabled=false;
    this.screenshot_cycle=0;
    this.preview_canvas=null;
    this.mediaRecorder;
    this.recordedBlobs = [];
    this.recorderContext=null;
    this.recorderCanvas=null;
    
    this.frame_time=0;
    this.last_time=0;
    this.effect_time=0;

    this.remote = null;
    this.proposed_fps=0;
}

Canvas.prototype.toTexture=function(element) {
    return Texture.fromElement(this.gl, element);
}

Canvas.prototype.update=function() {

    // get animation time
    var current_time=Date.now();
    this.frame_time=this.frame_time*0.9 + (current_time-this.last_time)*0.1;
    this.last_time=current_time;
    this.effect_time=current_time*0.001; // 1 units per second

    // enqueue next update
    var update_handler=this.update.bind(this);
    if(this.proposed_fps)
      
      setTimeout(function(){
        requestAnimationFrame(update_handler);
      },1000/this.proposed_fps);
    else
      requestAnimationFrame(update_handler);

    this.run_chain();

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
    if(this.preview_enabled && this.preview_cycle==1)
    {
      if(!this.preview_canvas)
      {
        this.preview_canvas=document.createElement('canvas');
        this.preview_canvas.width=this.preview_width; 
        this.preview_canvas.height=this.preview_height;
      }
      var ctx=this.preview_canvas.getContext('2d');
      ctx.drawImage(this.canvas,0,this.height-this.preview_height,this.preview_width,this.preview_height, 0, 0, this.preview_width,this.preview_height);
    }
    else if(this.preview_cycle==0)
    {
      var jpeg=this.preview_enabled ? this.preview_canvas.toDataURL('image/jpeg') : null;
      var data={frame_time:this.frame_time, jpeg:jpeg};
      var json=JSON.stringify(data);
      this.remote.put('preview',json);

      // only provide data every other frame if a preview image is send.
      // if only frame rate data is send, we keep the network calm.
      this.preview_cycle=this.preview_enabled ? 2 : 2;
    }
    this.preview_cycle--;

    // update canvas size to texture size...
    if(this.width!=this.texture.width || this.height!=this.texture.width)
    {
      this.width =this.texture.width;
      this.height=this.texture.height;
      this.canvas.width=this.width;
      this.canvas.height=this.height;
    }

    this.gl.viewport(0,0, this.width, this.height);
    filters.mirror_x.call(this,this); // for some reason, picture is horizontally mirrored. Store it into the canvas the right way.
    //this.texture.copyTo(this);

    this.gc();
    
    // reset switched flag, it is used by some filters to clear buffers on chain switch
    this.switched=false;

    // take screenshot if requested
    if(this.screenshot_cycle==1)
    {
      var pixels=canvas.toDataURL('image/jpeg');
      this.remote.put('screenshot',pixels);
      this.screenshot_cycle=0;
    }

    // take movie stream export frame if requested
    if(this.recorderContext)
    {
      // TODO if this is done for WebRTC, only do this copy if stream is actually running.
      this.recorderContext.drawImage(canvas,0,0);
      if(this.mediaRecorder) this.mediaRecorder.stream.getVideoTracks()[0].requestFrame();
    }

    return this;
}

// exchange output and input texture
Canvas.prototype.putTexture=function(texture)
{
    this.releaseTexture(this.texture);
    this.texture=texture;
}

Canvas.prototype.simpleShader=function(shader, uniforms, textureIn, textureOut) {
    var texture=(textureIn  || this.texture        );
    var target =(textureOut || this.getSpareTexture());

    texture.use();
    target .setAsTarget();
    shader.uniforms(uniforms).drawRect();

    if(!textureOut)
      this.putTexture(target);
};

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
// Otherwise filters are encouraged to pass their private working textures here every frame, ensuring chain updates are adopted (transiently losing the image).
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

var get_param_values=function(param,t)
{
  var args=[];
  if(!(param instanceof Object)) return param;
  var fn=Generators.generators[param.type];
  return fn.call(window,t,param);
}

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

Canvas.prototype.run_chain=function()
{
  Generators.prepare(); // reset effect chain generators to distinguish all random invocations in a single frame
  this.stack_prepare();
  for(var i=0; i<this.chain.length; i++)
    this.run_effect(this.chain[i],this.effect_time);
}

Canvas.prototype.setChain=function (effects)
{
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
Canvas.prototype.preview=function(enabled)
{
  // engage preview process
  this.preview_enabled=enabled;
  this.preview_cycle=2;
}

// receive screenshot request from remote
// called by UI
Canvas.prototype.screenshot=function()
{
  // engage screenshot process
  this.screenshot_cycle=1;
}

// start canvas capture stream and deliver video to UI on stop,
// called by UI
Canvas.prototype.recording=function(enabled) {
  if(enabled)
  {
    var options = {mimeType: 'video/webm'};

    if(!this.recorderCanvas) {
      this.recorderCanvas=document.createElement('canvas');
      this.recorderCanvas.width=this.width;
      this.recorderCanvas.height=this.height;
      this.recorderContext=this.recorderCanvas.getContext('2d');
    }

    const stream = this.recorderCanvas.captureStream(0);
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
    if(!this.recorderContext) {
      this.recorderCanvas=document.createElement('canvas');
      this.recorderCanvas.width=this.width;
      this.recorderCanvas.height=this.height;
      this.recorderContext=this.recorderCanvas.getContext('2d');
    }
    if(!this.webrtcOut) {
      this.webrtcOut=true;
      import("./webrtc.js").then(async(webrtc) => {
        this.webrtcOut=await webrtc.WebRTC("",this.recorderCanvas);
      });
    }
  }else{
    this.webrtcOut.hangup();
    this.webrtcOut=null;
    this.recorderContext=null;
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
  xmlHttp.onreadystatechange=function(){
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


