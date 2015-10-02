function mandelbrot(x,y,scale,angle,iterations) {

    iterations=Math.min(15,Math.abs(iterations));

    // use a single shader.
    // another implementation used one shaderi source per int(iterations), but Odroid XU4 crashed on that. On U3, it was fine.
    gl.mandelbrot = gl.mandelbrot || new Shader(null, '\
        uniform sampler2D texture;\
        uniform vec4 xform;\
        uniform vec2 center;\
        uniform float iterations; \
        varying vec2 texCoord;\
        mat2 mat=mat2(xform.xy,xform.zw);\
        void main() {\
            vec2 c=mat*(texCoord-center);\
            vec2 z; \
            vec2 nz=c; \
            for (int iter = 0;iter <= 15; iter++){ \
              if(iter>=int(iterations)) break;  \
              z = nz; \
              nz = vec2(z.x*z.x-z.y*z.y, 2.0*z.x*z.y) + c ; \
            } \
            vec2 pos=mix(z,nz,fract(iterations));\
            gl_FragColor = texture2D(texture, pos/8.0+vec2(0.5,0.5));\
        }\
    ');

    simpleShader.call(this, gl.mandelbrot, {
        xform: [
           Math.cos(angle)*scale, Math.sin(angle)*scale,
          -Math.sin(angle)*scale, Math.cos(angle)*scale
        ],
        iterations  : iterations,
        center: [x-this.width/2,y-this.height/2], // TODO remove this fix to cope with UI values top-left origin
        texSize: [this.width, this.height]
    });

    return this;
}

