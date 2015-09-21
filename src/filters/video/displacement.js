function displacement(strength) {
    gl.displacement = gl.displacement || new Shader(null, '\
        uniform sampler2D displacement_map;\
        uniform sampler2D texture;\
        uniform float strength;\
        varying vec2 texCoord;\
        void main() {\
            vec2 data = texture2D(displacement_map, texCoord).rg;\
            vec2 pos=texCoord + (data - vec2(0.5,0.5)) * strength; \
            gl_FragColor = texture2D(texture,pos);\
        }\
    ');

    var texture=this.stack_pop();
    texture.use(1);
    gl.displacement.textures({displacement_map: 0, texture: 1});
    simpleShader.call(this, gl.displacement, { strength: strength });
    texture.unuse(1);

    return this;
}
