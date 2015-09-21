function blend_alpha() {
    gl.blend_alpha = gl.blend_alpha || new Shader(null, '\
        uniform sampler2D texture_alpha;\
        uniform sampler2D texture1;\
        uniform sampler2D texture2;\
        varying vec2 texCoord;\
        void main() {\
            vec4 color1 = texture2D(texture1, texCoord);\
            vec4 color2 = texture2D(texture2, texCoord);\
            float alpha = dot(texture2D(texture_alpha,texCoord).rgb,vec3(1./3.));\
            gl_FragColor = mix(color1, color2, alpha);\
        }\
    ');

    var texture1=this.stack_pop();
    var texture2=this.stack_pop();
    texture1.use(1);
    texture2.use(2);    
    gl.blend_alpha.textures({texture_alpha: 0, texture1: 1, texture2: 2});
    simpleShader.call(this, gl.blend_alpha, {});
    texture1.unuse(1);
    texture2.unuse(2);

    return this;
}
