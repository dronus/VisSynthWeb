var gl;

canvas = function() {
    var canvas = document.createElement('canvas');
    gl = canvas.getContext('experimental-webgl', { alpha: false, premultipliedAlpha: false, antialias: true });
    if (!gl) 
        throw 'This browser does not support WebGL';

    canvas._={}; // "private" members go here
    canvas.textures=[];
    canvas.initialize=function() {

        // ready extensions to enable switch to float textures, if wanted.
        // if not supported, it should be fine as long as type UNSIGNED_BYTE is used as by default.
  	if (gl.getExtension('OES_texture_float')) gl.getExtension('OES_texture_float_linear');

        // create first texture manually as template for future ones
        this._.texture = new Texture(this.width, this.height, gl.RGBA, gl.UNSIGNED_BYTE);
        this.textures.push(this._.texture);
        // from now on we can create by template
        this._.spareTexture = this.createTexture();
        this._.extraTexture = this.createTexture();
    }

    canvas.update=function() {
        // update canvas size to texture size...
        if(this.width!=this._.texture.width || this.height!=this._.texture.width)
        {
          this.width =this._.texture.width;
          this.height=this._.texture.height;
        }

        gl.viewport(0,0, this.width, this.height);
        this.mirror_x(this); // for some reason, picture is horizontally mirrored. Store it into the canvas the right way.
        //this._.texture.copyTo(this);

        return this;
    }
    
    // exchange output and input texture
    canvas.swap=function()
    {
        var tmp=this._.texture;
        this._.texture=this._.spareTexture;
        this._.spareTexture=tmp;
    }
    
    canvas.simpleShader=function(shader, uniforms, textureIn, textureOut) {
        (textureIn  || this._.texture     ).use();
        (textureOut || this._.spareTexture).setAsTarget();
        shader.uniforms(uniforms).drawRect();
        
        if(!textureOut)
            this.swap();
    };
    
    canvas.setAsTarget=function(){
        gl.bindFramebuffer(gl.FRAMEBUFFER, null); // remove framebuffer binding left from last offscreen rendering (as set by Texture.setAsTarget)        
    }

    // hold a list of managed textures that would get updated by setFormat, setFilter, ...
    canvas.textures=[];

    // create an additional texture matched to this canvas settings. It is automatically adapted to future resolution and type settings.
    canvas.createTexture=function()
    {
      var template=this._.texture;
      var texture = new Texture(template.width, template.height, gl.RGBA, template.type);
      this.textures.push(texture);

      return texture;
    }

    return canvas;
}();

