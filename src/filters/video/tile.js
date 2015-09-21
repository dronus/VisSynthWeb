function tile(size,center) {
    gl.tile = gl.tile || new Shader(null, '\
        uniform sampler2D texture;\
        uniform vec2 center;\
      	uniform float size;\
        varying vec2 texCoord;\
        void main() {\
          vec4 color = texture2D(texture, fract((texCoord-center)*size));\
          gl_FragColor = color;\
        }\
    ');

    simpleShader.call(this, gl.tile, {size:size,center: center});

    return this;
}

