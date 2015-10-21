var gl;

function clamp(lo, value, hi) {
    return Math.max(lo, Math.min(value, hi));
}

function wrapTexture(texture) {
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

function texture(element) {
    return wrapTexture(Texture.fromElement(element));
}

function initialize(width, height) {
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
    gl.current_viewport=[0, 0, width, height]; // our own viewport cache
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
function draw(texture, width, height) {
   /* if (!this._.isInitialized || texture._.width != this.width || texture._.height != this.height) {
        initialize.call(this, width ? width : texture._.width, height ? height : texture._.height);
    }*/

    texture._.use();
    this._.texture.drawTo(function() {
        Shader.getDefaultShader().drawRect();
    });

    return this;
}

function update() {
    this._.texture.use();
    this._.flippedShader.drawRect();
    return this;
}

function simpleShader(shader, uniforms, textureIn, textureOut) {
    (textureIn || this._.texture).use();
    this._.spareTexture.drawTo(function() {
        shader.uniforms(uniforms).drawRect();
    });
    this._.spareTexture.swapWith(textureOut || this._.texture);
}

function replace(node) {
    node.parentNode.insertBefore(this, node);
    node.parentNode.removeChild(node);
    return this;
}

function contents() {
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
function getPixelArray() {
    var w = this._.texture.width;
    var h = this._.texture.height;
    var array = new Uint8Array(w * h * 4);
    this._.texture.drawTo(function() {
        gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, array);
    });
    return array;
}

function wrap(func) {
    return function() {
        // Make sure that we're using the correct global WebGL context
        gl = this._.gl;

        // Now that the context has been switched, we can call the wrapped function
        return func.apply(this, arguments);
    };
}

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

    // Core methods
    canvas.texture = wrap(texture);
    canvas.initialize=wrap(initialize);
    canvas.draw = wrap(draw);
    canvas.update = wrap(update);
    canvas.replace = wrap(replace);
    canvas.contents = wrap(contents);
    canvas.getPixelArray = wrap(getPixelArray);

    // Filter methods
    canvas.brightnessContrast = wrap(brightnessContrast);
    canvas.hexagonalPixelate = wrap(hexagonalPixelate);
    canvas.hueSaturation = wrap(hueSaturation);
    canvas.colorHalftone = wrap(colorHalftone);
    canvas.triangleBlur = wrap(triangleBlur);    
    canvas.fastBlur = wrap(fastBlur);
    canvas.unsharpMask = wrap(unsharpMask);
    canvas.perspective = wrap(perspective);
    canvas.matrixWarp = wrap(matrixWarp);
    canvas.bulgePinch = wrap(bulgePinch);
    canvas.tiltShift = wrap(tiltShift);
    canvas.dotScreen = wrap(dotScreen);
    canvas.edgeWork = wrap(edgeWork);
    canvas.lensBlur = wrap(lensBlur);
    canvas.erode = wrap(erode);
    canvas.dilate = wrap(dilate);
    canvas.zoomBlur = wrap(zoomBlur);
    canvas.noise = wrap(noise);
    canvas.denoise = wrap(denoise);
    canvas.curves = wrap(curves);
    canvas.swirl = wrap(swirl);
    canvas.ink = wrap(ink);
    canvas.vignette = wrap(vignette);
    canvas.vibrance = wrap(vibrance);
    canvas.sepia = wrap(sepia);
    // dronus' filter methods
    canvas.capture = wrap(capture);
    canvas.video = wrap(video);
    canvas.stack_prepare=wrap(stack_prepare);
    canvas.stack_push=wrap(stack_push);
    canvas.stack_pop=wrap(stack_pop);
    canvas.stack_swap=wrap(stack_swap);
    canvas.blend=wrap(blend);
    canvas.blend_alpha=wrap(blend_alpha);
    canvas.colorkey=wrap(colorkey);
    canvas.lumakey=wrap(lumakey);
    canvas.displacement=wrap(displacement);
    canvas.mesh_displacement=wrap(mesh_displacement);
    canvas.patch_displacement=wrap(patch_displacement);
    canvas.particles=wrap(particles);
    canvas.posterize=wrap(posterize);
//    canvas.=wrap();
    canvas.superquadric=wrap(superquadric);
    canvas.supershape=wrap(supershape);
    canvas.feedbackIn = wrap(feedbackIn);
    canvas.feedbackOut = wrap(feedbackOut);
    canvas.grid = wrap(grid);
    canvas.kaleidoscope = wrap(kaleidoscope);
    canvas.tile = wrap(tile);
    canvas.denoisefast = wrap(denoisefast);    
    canvas.localContrast=wrap(localContrast);
    canvas.preview=wrap(preview);
    canvas.life=wrap(life);
    canvas.smoothlife=wrap(smoothlife);
    canvas.ripple=wrap(ripple);
    canvas.colorDisplacement=wrap(colorDisplacement);
    canvas.analogize=wrap(analogize);
    canvas.motion=wrap(motion);
    canvas.gauze=wrap(gauze);
    canvas.mandelbrot=wrap(mandelbrot);
    canvas.timeshift=wrap(timeshift);
    canvas.reaction=wrap(reaction);
    canvas.relief=wrap(relief);  
    canvas.transform=wrap(transform);
    canvas.polygon = wrap(polygon);
    canvas.matte = wrap(matte);
    canvas.waveform=wrap(waveform);
    canvas.spectrogram=wrap(spectrogram);
    // hexapode's filters methods
    canvas.color = wrap(color);
    canvas.levels = wrap(levels);
    canvas.absolute = wrap(absolute);
    canvas.rainbow = wrap(rainbow);    
    canvas.sobel = wrap(sobel);
    canvas.toHSV = wrap(toHSV);
    canvas.invertColor = wrap(invertColor);
    canvas.noalpha = wrap(noalpha);
    canvas.mirror = wrap(mirror);

    return canvas;
};
// exports.splineInterpolate = splineInterpolate;
