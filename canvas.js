import {Texture} from "./texture.js";
import {Shader} from "./shader.js";
import {filters} from "./filters.js";

// canvas and gl are available at global scope

export let Canvas = function(selector) {
    this.canvas=document.querySelector(selector);
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
}

Canvas.prototype.toTexture=function(element) {
    return Texture.fromElement(this.gl, element);
}

Canvas.prototype.update=function() {
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



