function mandelbrot(center,scale,angle,iterations_float) {

    iterations_float=Math.min(15,Math.abs(iterations_float));
    
    var iterations=Math.floor(iterations_float);
    gl.mandelbrot=gl.mandelbrot || {};
    gl.mandelbrot[iterations] = gl.mandelbrot[iterations] || new Shader(null, '\
        uniform sampler2D texture;\
        uniform vec4 xform;\
        uniform vec2 center;\
        uniform float iterations_fract; \
        varying vec2 texCoord;\
        mat2 mat=mat2(xform.xy,xform.zw);\
        void main() {\
            vec2 c=mat*(texCoord-center);\
            vec2 z; \
            vec2 nz=c; \
            for (int iter = 0;iter < '+iterations+';iter++){ \
              z = nz; \
              nz = vec2(z.x*z.x-z.y*z.y, 2.0*z.x*z.y) + c ; \
            } \
            vec2 pos=mix(z,nz,iterations_fract);\
            gl_FragColor = texture2D(texture, pos/8.0+vec2(0.5,0.5));\
        }\
    ');

    simpleShader.call(this, gl.mandelbrot[iterations], {
        xform: [
           Math.cos(angle)*scale, Math.sin(angle)*scale,
          -Math.sin(angle)*scale, Math.cos(angle)*scale
        ],
        iterations_fract: iterations_float-iterations,
        center: [center[0]-this.width/2,center[1]-this.height/2], // TODO remove this fix to cope with UI values top-left origin
        texSize: [this.width, this.height]
    });

    return this;
}

