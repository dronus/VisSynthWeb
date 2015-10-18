function blend(alpha,factor) {
    gl.blend = gl.blend || new Shader(null, '\
        uniform sampler2D texture;\
        uniform sampler2D texture1;\
        uniform float alpha;\
        uniform float factor;\
        varying vec2 texCoord;\
        void main() {\
            vec4 color  = texture2D(texture , texCoord);\
            vec4 color1 = texture2D(texture1, texCoord);\
            gl_FragColor = mix(color, color1, alpha) * factor;\
        }\
    ');

    var texture1=this.stack_pop();
    texture1.use(1);
    gl.blend.textures({texture: 0, texture1: 1});
    simpleShader.call(this, gl.blend, { alpha: alpha, factor: factor ? factor : 1.0 });
    texture1.unuse(1);

    return this;
}
