
function posterize(steps) {
    gl.posterize = gl.posterize || new Shader(null, '\
        uniform sampler2D texture;\
        uniform float steps;\
        varying vec2 texCoord;\
        void main() {\
            vec4 color = texture2D(texture, texCoord);\
            gl_FragColor = vec4(floor(color.rgb*(steps+vec3(1.)))/steps, color.a);\
        }\
    ');

    simpleShader.call(this, gl.posterize, { steps: Math.round(steps) });

    return this;
}
