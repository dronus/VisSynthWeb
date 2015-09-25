function fastBlur(radius) {
    gl.fastBlur = gl.fastBlur || new Shader(null, '\
        uniform sampler2D texture;\
        uniform vec2 delta;\
        varying vec2 texCoord;\
        void main() {\
            vec4 color = vec4(0.0);\
            float b=1./4.;\
            color+=b*texture2D(texture, texCoord + delta * vec2( .5, .5) );\
            color+=b*texture2D(texture, texCoord + delta * vec2(-.5, .5) );\
            color+=b*texture2D(texture, texCoord + delta * vec2( .5,-.5) );\
            color+=b*texture2D(texture, texCoord + delta * vec2(-.5,-.5) );\
            gl_FragColor = vec4(color.rgb,1.); \
        }\
    ');

    for(var d=1.; d<=radius; d*=1.44)
    {
      simpleShader.call(this, gl.fastBlur, { delta: [d/this.width, d/this.height]});
    }
    return this;
}
