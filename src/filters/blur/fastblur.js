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
            gl_FragColor = color; \
        }\
    ');

    for(var i=0; i<Math.sqrt(radius); i++)
    {
      simpleShader.call(this, gl.fastBlur, { delta: [i/this.width, i/this.height]});
    }
    return this;
}
