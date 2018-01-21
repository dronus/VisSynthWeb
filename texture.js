var Texture = (function() {

    Texture.fromElement = function(element) {
        var texture = new Texture(0, 0, gl.RGBA, gl.UNSIGNED_BYTE);
        texture.loadContentsOf(element);
        return texture;
    };

    function Texture(width, height, format, type) {
        this.gl = gl;
        this.id = gl.createTexture();
        this.width = width;
        this.height = height;
        this.format = format;
        this.type = type;

        gl.bindTexture(gl.TEXTURE_2D, this.id);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
//        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
//        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        var internalFormat=(this.type==gl.FLOAT ? gl.RGBA32F : gl.RGBA8);
        if (width && height) gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, width, height, 0, this.format, this.type, null);
    }

    Texture.prototype.load = function(data) {
        gl.bindTexture(gl.TEXTURE_2D, this.id);
        gl.texImage2D(gl.TEXTURE_2D, 0, this.format, this.width, this.height, 0, this.format, this.type, data);
    };
    
    Texture.prototype.loadContentsOf = function(element) {
        this.width = element.width || element.videoWidth;
        this.height = element.height || element.videoHeight;
        gl.bindTexture(gl.TEXTURE_2D, this.id);
        gl.texImage2D(gl.TEXTURE_2D, 0, this.format, this.format, this.type, element);
    };

    Texture.prototype.initFromBytes = function(width, height, data) {
        this.width = width;
        this.height = height;
        this.format = gl.RGBA;
        this.type = gl.UNSIGNED_BYTE;
        gl.bindTexture(gl.TEXTURE_2D, this.id);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, this.type, new Uint8Array(data));
    };

    Texture.prototype.destroy = function() {
        gl.deleteTexture(this.id);
        this.id = null;
    };

    Texture.prototype.use = function(unit) {
        gl.activeTexture(gl.TEXTURE0 + (unit || 0));
        gl.bindTexture(gl.TEXTURE_2D, this.id);
    };

    Texture.prototype.unuse = function(unit) {
        gl.activeTexture(gl.TEXTURE0 + (unit || 0));
        gl.bindTexture(gl.TEXTURE_2D, null);
    };

    Texture.prototype.ensureFormat = function(width, height, format, type) {
        // allow passing an existing texture instead of individual arguments
        if (arguments.length == 1) {
            var texture = arguments[0];
            width = texture.width;
            height = texture.height;
            format = texture.format;
            type = texture.type;
        }

        // change the format only if required
        if (width != this.width || height != this.height || format != this.format || type != this.type) {
            this.width = width;
            this.height = height;
            this.format = format;
            this.type = type;
            gl.bindTexture(gl.TEXTURE_2D, this.id);
            var internalFormat=(this.type==gl.FLOAT ? gl.RGBA32F : gl.RGBA8);
            gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, width, height, 0, this.format, this.type, null);
        }
    };

    Texture.prototype.drawTo = function(callback,with_depth) {
        // start rendering to this texture
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
        }
        
        // TODO this forces GPU sync it seems, CPU is waiting. 
        // If removed, the load seem to show off on another GL feedback method (eg. getParameter) .
        /*if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
            throw new Error('incomplete framebuffer');
        }*/
        gl.viewport(0, 0, this.width, this.height);

        // do the drawing
        callback();

        // stop rendering to this texture
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, null);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    };
    

    Texture.prototype.copyTo = function(target) {
        this.use();
        target.drawTo(function() {
            Shader.getDefaultShader().drawRect();
        });
    };
    
    // clear this texture to black
    Texture.prototype.clear = function() {
        gl.bindTexture(gl.TEXTURE_2D, this.id);
        gl.texImage2D(gl.TEXTURE_2D, 0, this.format, this.width, this.height, 0, this.format, this.type, null);
    }
    
    var canvas = null;

    function getCanvas(texture) {
        if (canvas == null) canvas = document.createElement('canvas');
        canvas.width = texture.width;
        canvas.height = texture.height;
        var c = canvas.getContext('2d');
        c.clearRect(0, 0, canvas.width, canvas.height);
        return c;
    }

    Texture.prototype.swapWith = function(other) {
        var temp;
        temp = other.id; other.id = this.id; this.id = temp;
        temp = other.width; other.width = this.width; this.width = temp;
        temp = other.height; other.height = this.height; this.height = temp;
        temp = other.format; other.format = this.format; this.format = temp;
    };

    return Texture;
})();
