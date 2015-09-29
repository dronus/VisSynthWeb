function blend_alpha() {
    gl.blend_alpha = gl.blend_alpha || new Shader(null, '\
        uniform sampler2D texture1;\
        uniform sampler2D texture2;\
        varying vec2 texCoord;\
        void main() {\
            vec4 color1 = texture2D(texture1, texCoord);\
            vec4 color2 = texture2D(texture2, texCoord);\
            gl_FragColor = mix(color1, color2, color2.a);\
        }\
    ');

    var texture1=this.stack_pop();
    texture1.use(1);
    gl.blend_alpha.textures({texture1: 0, texture1: 1});
    simpleShader.call(this, gl.blend_alpha, {});
    texture1.unuse(1);

    return this;
}
