function colorDisplacement(angle,amplitude) {
    gl.colorDisplacement = gl.colorDisplacement || new Shader(null,'\
    \
        uniform sampler2D texture;\
        varying vec2 texCoord;\
        uniform vec2 texSize;\
        uniform float angle;\
        uniform float amplitude;\
      void main(void){ \
        float pi=3.14159; \
        vec2 p3=vec2(pi*2./3.,pi*2./3.); \
        vec2 angles=vec2(angle,angle+pi/2.); \
        vec2 or=sin(angles+0.*p3)/texSize*amplitude; \
        vec2 og=sin(angles+1.*p3)/texSize*amplitude; \
        vec2 ob=sin(angles+2.*p3)/texSize*amplitude; \
        gl_FragColor=vec4( \
            texture2D(texture,texCoord+or).r, \
            texture2D(texture,texCoord+og).g, \
            texture2D(texture,texCoord+ob).b, \
        1.0); \
        } \
    ');

    simpleShader.call(this, gl.colorDisplacement, {
        angle: angle,    
        amplitude: amplitude,
        texSize: [this.width, this.height]        
    });

    return this;
}
