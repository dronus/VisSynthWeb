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
        // hold a list of garbage collected textures
        this._.tempTextures=[];
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

        this.gc();

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
    canvas.getSpareTexture=function(candidate_texture,width,height,format,type)
    {
      var t;

      if(width && height)
        t={width:width, height:height, format:format || gl.RGBA, type: type || gl.UNSIGNED_BYTE};
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
        return new Texture(t.width, t.height, t.format, t.type, t.filter);
      }
    }
    
    canvas.getTemporaryTexture=function()
    {
      var texture=getSpareTexture.apply(this,arguments);
      this._.temporary.push(texture);
    }
    
    canvas.gc=function()
    {
      var texture;
      while(texture=this._.tempTextures.pop())
        this.releaseTexture(texture);
    }

    // Put a texture back to the spare pool.
    //
    // Do NOT use a texture afterwards, as its binding and image is undefined.
    // (If the texture is bound as a target again, the application may issue a feedback loop warning)
    canvas.releaseTexture=function(texture)
    {
      var k=texture .getFormatKey();
      if(!this._.spareTextures[k])
        this._.spareTextures[k]=[];

      this._.spareTextures[k].push(texture);
    }

    return canvas;
}();

