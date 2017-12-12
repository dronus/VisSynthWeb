var gl;

function clamp(lo, value, hi) {
    return Math.max(lo, Math.min(value, hi));
}

/*function wrap(func) {
    return function() {
        // Make sure that we're using the correct global WebGL context
        gl = this._.gl;

        // Now that the context has been switched, we can call the wrapped function
        return func.apply(this, arguments);
    };
}
*/
canvas = function() {
    var canvas = document.createElement('canvas');
    try {
        gl = canvas.getContext('experimental-webgl', { alpha: false, premultipliedAlpha: false });
    } catch (e) {
        gl = null;
    }
    if (!gl) {
        throw 'This browser does not support WebGL';
    }
    canvas._ = {
        gl: gl,
        isInitialized: false,
        texture: null,
        spareTexture: null,
        flippedShader: null
    };

    canvas.texture=function(element) {
        return Texture.fromElement(element);
    }

    canvas.initialize=function(width, height) {
        var type = gl.UNSIGNED_BYTE;

        // ready extensions to enable switch to float textures, if wanted.
        // if not supported, it should be fine as long as type UNSIGNED_BYTE is used as by default.
  	if (gl.getExtension('OES_texture_float')) gl.getExtension('OES_texture_float_linear');

        if (this._.texture) this._.texture.destroy();
        if (this._.spareTexture) this._.spareTexture.destroy();
        this.width = width;
        this.height = height;
        this._.texture = new Texture(width, height, gl.RGBA, type);
        this._.spareTexture = new Texture(width, height, gl.RGBA, type);
        this._.extraTexture = this._.extraTexture || new Texture(0, 0, gl.RGBA, type);
        this._.flippedShader = this._.flippedShader || new Shader(null, '\
            uniform sampler2D texture;\
            varying vec2 texCoord;\
            void main() {\
                gl_FragColor = texture2D(texture, vec2(texCoord.x, 1.0 - texCoord.y));\
            }\
        ');
        this._.isInitialized = true;
    }

    canvas.update=function() {
        this._.texture.use();
        // update canvas size to texture size...
        if(this.width!=this._.texture.width || this.height!=this._.texture.width)
        {
          this.width =this._.texture.width;
          this.height=this._.texture.height;
        }
        gl.viewport(0, 0, this.width, this.height);        
        this._.flippedShader.drawRect();
        return this;
    }
    
    canvas.simpleShader=function(shader, uniforms, textureIn, textureOut) {
        (textureIn || this._.texture).use();
        this._.spareTexture.drawTo(function() {
            shader.uniforms(uniforms).drawRect();
        });
        this._.spareTexture.swapWith(textureOut || this._.texture);
    };

    return canvas;
};
canvas=canvas();
// exports.splineInterpolate = splineInterpolate;
