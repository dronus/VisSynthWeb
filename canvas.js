import {Texture} from "./texture.js";
import {Shader} from "./shader.js";
import {filters} from "./filters.js";

// canvas and gl are available at global scope

export let Canvas = function(selector) {
    this.canvas=document.querySelector(selector);
    this.gl = this.canvas.getContext('experimental-webgl', { alpha: false, premultipliedAlpha: false });

    this._={};
    // initialize (use browser canvas size as default. may be changed by user-defined via "resolution"-filter)
    // create a template texture manually as template for future ones
    this._.template = new Texture(this.gl, this.canvas.width, this.canvas.height, this.gl.RGBA, this.gl.UNSIGNED_BYTE);
    // hold a list of managed spare textures
    this._.spareTextures=[];
    // hold a list of garbage collected textures
    this._.tempTextures=[];
    // create default texture for simpleShader
    this._.texture = this.getSpareTexture();
}


Canvas.prototype.texture=function(element) {
    return Texture.fromElement(this.gl, element);
}

Canvas.prototype.for_all_textures=function(callback){
    callback(this._.texture);
    callback(this._.spareTexture);
    callback(this._.extraTexture);
};

Canvas.prototype.update=function() {
    // update canvas size to texture size...
    if(this.width!=this._.texture.width || this.height!=this._.texture.width)
    {
      this.width =this._.texture.width;
      this.height=this._.texture.height;
      this.canvas.width=this.width;
      this.canvas.height=this.height;
    }

    this.gl.viewport(0,0, this.width, this.height);
    filters.mirror_x.call(this,this); // for some reason, picture is horizontally mirrored. Store it into the canvas the right way.
    //this._.texture.copyTo(this);

    this.gc();

    return this;
}

// exchange output and input texture
Canvas.prototype.putTexture=function(texture)
{
    this.releaseTexture(this._.texture);
    this._.texture=texture;
}

Canvas.prototype.simpleShader=function(shader, uniforms, textureIn, textureOut) {
    var texture=(textureIn  || this._.texture        );
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
    t=this._.template;

  var k=Texture.formatKey(t);

  if(candidate_texture)
    if(k==candidate_texture.getFormatKey())
      return candidate_texture;
    else
      this.releaseTexture(candidate_texture);

  if(!this._.spareTextures[k])
    this._.spareTextures[k]=[];

  if(this._.spareTextures[k].length)
    return this._.spareTextures[k].pop();
  else{
    console.log("canvas.getSpareTexture "+k);
    return new Texture(this.gl, t.width, t.height, t.format, t.type, t.filter);
  }
}

Canvas.prototype.getTemporaryTexture=function()
{
  var texture=getSpareTexture.apply(this,arguments);
  this._.temporary.push(texture);
}

Canvas.prototype.gc=function()
{
  var texture;
  while(texture=this._.tempTextures.pop())
    this.releaseTexture(texture);
}

// Put a texture back to the spare pool.
//
// Do NOT use a texture afterwards, as its binding and image is undefined.
// (If the texture is bound as a target again, the application may issue a feedback loop warning)
Canvas.prototype.releaseTexture=function(texture)
{
  var k=texture .getFormatKey();
  if(!this._.spareTextures[k])
    this._.spareTextures[k]=[];

  this._.spareTextures[k].push(texture);
}

Canvas.prototype.stack_push=function(from_texture)
{
  // push given or current image onto stack
  if(!from_texture) from_texture=this._.texture;


  // add another texture to empty stack pool if needed
  if(!this._.stackUnused.length)
    this._.stackUnused.push(this.getSpareTexture());

  // check for stack overflow
  if(this._.stack.length>10) 
  {
    console.log('glfx.js video stack overflow!');
    return this;
  }
  
  // copy current frame on top of the stack
  var nt=this._.stackUnused.pop();
  from_texture.copyTo(nt);
  this._.stack.push(nt);

  return nt;
}

Canvas.prototype.stack_pop=function()
{
  var texture=this._.stack.pop();
  if(!texture)
  {
    console.log('glfx.js video stack underflow!');
    return this._.texture;
  }
  this._.stackUnused.push(texture);

  return texture;
}

