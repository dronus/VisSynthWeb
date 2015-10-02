function absolute(size, angle) {
    gl.absolute = gl.absolute || new Shader(null, '\
        uniform sampler2D texture;\
        varying vec2 texCoord;\
        void main() {\
          vec4 rgba = texture2D(texture, texCoord);\
          vec3 abs_rgb  = abs(rgba.rgb-vec3(0.5))*2.0; \
          gl_FragColor = vec4(abs_rgb,rgba.a);\
        }\
    ');

    simpleShader.call(this, gl.absolute, {});

    return this;
}
