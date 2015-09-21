function mandelbrot(center,scale,angle,iterations) {

    iterations=Math.min(15,Math.round(iterations));
    gl.mandelbrot=gl.mandelbrot || {};
    gl.mandelbrot[iterations] = gl.mandelbrot[iterations] || new Shader(null, '\
        uniform sampler2D texture;\
        uniform vec4 xform;\
        uniform vec2 center;\
        varying vec2 texCoord;\
        mat2 mat=mat2(xform.xy,xform.zw);\
        void main() {\
            vec2 position=mat*(texCoord-center);\
            float x = position.x; \
            float y = position.y; \
            float xx = 0.0; \
            float yy = 0.0; \
            for (int iter = 0;iter < '+iterations+';iter++){ \
              float xx2 = xx*xx; \
              float yy2 = yy*yy; \
              float temp = xx2 - yy2 + x; \
              yy = 2.0*xx*yy + y; \
              xx = temp; \
            } \
            gl_FragColor = texture2D(texture, vec2(xx,yy)/8.0+vec2(0.5,0.5));\
        }\
    ');

    simpleShader.call(this, gl.mandelbrot[iterations], {
        xform: [
           Math.cos(angle)*scale, Math.sin(angle)*scale,
          -Math.sin(angle)*scale, Math.cos(angle)*scale
        ],
        center: [center[0]-this.width/2,center[1]-this.height/2], // TODO remove this fix to cope with UI values top-left origin
        texSize: [this.width, this.height]
    });

    return this;
}

