function tile(size) {
    gl.tile = gl.tile || new Shader(null, '\
        uniform sampler2D texture;\
        varying vec2 texCoord;\
      	uniform float size;\
        void main() {\
          vec4 color = texture2D(texture, fract(texCoord*size));\
          gl_FragColor = color;\
        }\
    ');

    simpleShader.call(this, gl.tile, {size:size});

    return this;
}

