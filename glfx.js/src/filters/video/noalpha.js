function noalpha() {
    gl.noalpha = gl.noalpha || new Shader(null, '\
        uniform sampler2D texture;\
        varying vec2 texCoord;\
        void main() {\
            vec4 color = texture2D(texture, texCoord);\
            gl_FragColor = vec4(color.rgb,1.);\
        }\
    ');
    simpleShader.call(this, gl.noalpha, {});
    return this;
}
