import {Shader} from "./shader.js";

Texture.fromElement = function(gl,element) {
    var texture = new Texture(gl,0, 0, gl.RGBA, gl.UNSIGNED_BYTE);
    texture.loadContentsOf(element);
    return texture;
};

Texture.formatKey=function(template)
{
      return template.width+"_"+template.height+"_"+template.format+"_"+template.type;
}

export function Texture(gl, width, height, format, type, filter) {
    this.gl = gl;
    this.id = gl.createTexture();

    gl.bindTexture(gl.TEXTURE_2D, this.id);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    this.setFilter(filter || gl.LINEAR);
    this.setFormat(width,height,format,type);
}

Texture.prototype.setFilter=function(filter)
{
  this.filter=filter;
  let gl=this.gl;
  gl.bindTexture(gl.TEXTURE_2D, this.id);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
}

Texture.prototype.getFormatKey=function()
{
  return Texture.formatKey(this);
}

Texture.prototype.loadContentsOf = function(element) {
    this.width = element.width || element.videoWidth;
    this.height = element.height || element.videoHeight;
    let gl=this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.id);
    gl.texImage2D(gl.TEXTURE_2D, 0, this.format, this.format, this.type, element);
};

Texture.prototype.load = function(data) {
    let gl=this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.id);
    gl.texImage2D(gl.TEXTURE_2D, 0, this.format, this.width, this.height, 0, this.format, this.type, data);
};

Texture.prototype.use = function(unit) {
    let gl=this.gl;
    gl.activeTexture(gl.TEXTURE0 + (unit || 0));
    gl.bindTexture(gl.TEXTURE_2D, this.id);
};

Texture.prototype.setFormat = function(width, height, format, type) {
    // change the format only if required
    if (width != this.width || height != this.height || format != this.format || type != this.type) {
        this.width = width;
        this.height = height;
        this.format = format;
        this.type = type;
        let gl=this.gl;
        gl.bindTexture(gl.TEXTURE_2D, this.id);
        gl.texImage2D(gl.TEXTURE_2D, 0, this.format, width, height, 0, this.format, this.type, null);
    }
};

Texture.prototype.clear = function() {
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.id);
    this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.format, this.width, this.height, 0, this.format, this.type, null);
};


Texture.prototype.setAsTarget = function(with_depth) {
    // start rendering to this texture
    let gl=this.gl;
    gl.framebuffer = gl.framebuffer || gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, gl.framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.id, 0);
            
    if(with_depth)
    {
      if(!this.depthbuffer)
      {
        this.depthbuffer=gl.createRenderbuffer();
        gl.bindRenderbuffer(gl.RENDERBUFFER, this.depthbuffer);
        gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, this.width, this.height);
      }
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, this.depthbuffer);
    }else
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, null);
    
    // TODO this forces GPU sync it seems, CPU is waiting. 
    // If removed, the load seem to show off on another GL feedback method (eg. getParameter) .
    /*if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
        throw new Error('incomplete framebuffer');
    }*/
    gl.viewport(0, 0, this.width, this.height);
};

Texture.prototype.copyTo = function(target) {
    this.use();
    target.setAsTarget();
    let gl=this.gl;
    gl.copyShader = gl.copyShader || new Shader(gl);
    gl.copyShader.drawRect();
};
