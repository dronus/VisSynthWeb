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

    var wrapTexture=function(texture) {
        return {
            _: texture,
            loadContentsOf: function(element) {
                // Make sure that we're using the correct global WebGL context
                gl = this._.gl;
                this._.loadContentsOf(element);
            },
            destroy: function() {
                // Make sure that we're using the correct global WebGL context
                gl = this._.gl;
                this._.destroy();
            }
        };
    }

    canvas.texture=function(element) {
        return wrapTexture(Texture.fromElement(element));
    }

    canvas.initialize=function(width, height) {
        var type = gl.UNSIGNED_BYTE;

        // Go for floating point buffer textures if we can, it'll make the bokeh
        // filter look a lot better. Note that on Windows, ANGLE does not let you
        // render to a floating-point texture when linear filtering is enabled.
        // See http://crbug.com/172278 for more information.
        if (gl.getExtension('OES_texture_float') && gl.getExtension('OES_texture_float_linear')) {
            var testTexture = new Texture(100, 100, gl.RGBA, gl.FLOAT);
            try {
                // Only use gl.FLOAT if we can render to it
                testTexture.drawTo(function() { type = gl.FLOAT; });
            } catch (e) {
            }
            testTexture.destroy();
        }

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

    /*
       Draw a texture to the canvas, with an optional width and height to scale to.
       If no width and height are given then the original texture width and height
       are used.
    */
    canvas.draw=function(texture, width, height) {
       /* if (!this._.isInitialized || texture._.width != this.width || texture._.height != this.height) {
            initialize.call(this, width ? width : texture._.width, height ? height : texture._.height);
        }*/

        texture._.use();
        this._.texture.drawTo(function() {
            Shader.getDefaultShader().drawRect();
        });

        return this;
    }

    canvas.update=function() {
        this._.texture.use();
        gl.viewport(0, 0, this.width, this.height);        
        this._.flippedShader.drawRect();
        return this;
    }

    canvas.contents=function() {
        var texture = new Texture(this._.texture.width, this._.texture.height, gl.RGBA, gl.UNSIGNED_BYTE);
        this._.texture.use();
        texture.drawTo(function() {
            Shader.getDefaultShader().drawRect();
        });
        return wrapTexture(texture);
    }

    /*
       Get a Uint8 array of pixel values: [r, g, b, a, r, g, b, a, ...]
       Length of the array will be width * height * 4.
    */
    canvas.getPixelArray=function() {
        var w = this._.texture.width;
        var h = this._.texture.height;
        var array = new Uint8Array(w * h * 4);
        this._.texture.drawTo(function() {
            gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, array);
        });
        return array;
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
