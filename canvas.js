var gl;

canvas = function() {
    var canvas = document.createElement('canvas');
    gl = canvas.getContext('experimental-webgl', { alpha: false, premultipliedAlpha: false, antialias: true });
    if (!gl) 
        throw 'This browser does not support WebGL';

    canvas._={}; // "private" members go here
    canvas.textures=[];
    canvas.initialize=function() {

        this._={};
        // create a template texture manually as template for future ones
        this._.template = new Texture(this.width, this.height, gl.RGBA, gl.UNSIGNED_BYTE);
        // hold a list of managed spare textures
        this._.spareTextures=[];
        // create default texture for simpleShader
        this._.texture = this.getSpareTexture();
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
    canvas.putTexture=function(texture)
    {
        this.releaseTexture(this._.texture);
        this._.texture=texture;
    }
    
    canvas.simpleShader=function(shader, uniforms, textureIn, textureOut) {
        var texture=(textureIn  || this._.texture        );
        var target =(textureOut || this.getSpareTexture());

        texture.use();
        target .setAsTarget();
        shader.uniforms(uniforms).drawRect();
        
        if(!textureOut)
          this.putTexture(target);
    };
    
    canvas.setAsTarget=function(){
        gl.bindFramebuffer(gl.FRAMEBUFFER, null); // remove framebuffer binding left from last offscreen rendering (as set by Texture.setAsTarget)        
    }

    // create an additional texture matched to this canvas settings.
    canvas.getSpareTexture=function(candidate_texture)
    {
      var t=this._.template;
      var k=t.getFormatKey();
      
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
        return new Texture(t.width, t.height, t.format, t.type);
      }
    }

    canvas.releaseTexture=function(texture)
    {
      var k=texture .getFormatKey();
      if(!this._.spareTextures[k])
        this._.spareTextures[k]=[];

      this._.spareTextures[k].push(texture);
    }

    return canvas;
}();

