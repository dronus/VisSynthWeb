function transform(x,y,scale,angle) {
    gl.transform = gl.transform || new Shader(null, '\
        uniform sampler2D texture;\
        uniform vec2 translation;\
        uniform vec4 xform;\
        varying vec2 texCoord;\
        void main() {\
          mat2 mat=mat2(xform.xy,xform.zw);\
          gl_FragColor = texture2D(texture, mat*(texCoord+translation));\
        }\
    ');
    
    console.log(x+" "+y+" "+scale+" "+angle);
    
    simpleShader.call(this, gl.transform, {
      translation: [x,y],
      xform: [
         Math.cos(angle)*scale, Math.sin(angle)*scale,
        -Math.sin(angle)*scale, Math.cos(angle)*scale
      ]
    });

    return this;
}

