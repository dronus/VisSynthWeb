function polygon(sides,x,y,size,angle) {

    gl.polygon = gl.polygon || new Shader(null, '\
        uniform sampler2D texture;\
        uniform vec2 size;\
        uniform float sides;\
        uniform float angle;\
        uniform vec2 center;\
        uniform vec2 aspect;\
        varying vec2 texCoord;\
        float PI=3.14159; \
        void main() {\
            vec4 color = texture2D(texture, texCoord);\
            vec2 uv=texCoord-vec2(0.5,0.5)-center;\
            uv/=size;\
            \
            float a=atan(uv.x,uv.y)-angle; \
            float r=length(uv); \
            \
            float d = r / (cos(PI/sides)/cos(mod(a,(2.*PI/sides))-(PI/sides))); \
            \
            if(d<1.) \
              gl_FragColor=color; \
            else \
              gl_FragColor=vec4(0.); \
        }\
    ');

    simpleShader.call(this, gl.polygon, {
        size:[size*this.height/this.width,size],
        sides:Math.floor(sides),
        angle:angle,
        center: [x,y]
    });

    return this;
}

