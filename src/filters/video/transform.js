function transform(x,y,scale,angle) {
    gl.transform = gl.transform || new Shader(null, '\
        uniform sampler2D texture;\
        uniform vec2 translation;\
        uniform vec4 xform;\
        varying vec2 texCoord;\
        uniform vec2 aspect;\
        void main() {\
          mat2 mat=mat2(xform.xy,xform.zw);\
          vec2 uv=(mat*(texCoord*aspect+translation-vec2(0.5,0.5))+vec2(0.5,0.5))/aspect; \
          if(uv.x>=0. && uv.y>=0. && uv.x<=1. && uv.y<=1.) \
            gl_FragColor = texture2D(texture,uv);\
          else \
            gl_FragColor = vec4(0.,0.,0.,0.); \
        }\
    ');
    
    console.log(x+" "+y+" "+scale+" "+angle);
    
    simpleShader.call(this, gl.transform, {
      translation: [x,y],
      xform: [
         Math.cos(angle)/scale, Math.sin(angle)/scale,
        -Math.sin(angle)/scale, Math.cos(angle)/scale
      ],
      aspect:[this.width/this.height,1.]
    });

    return this;
}

