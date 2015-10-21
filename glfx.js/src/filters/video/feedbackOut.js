function feedbackOut(blend) {
    gl.feedbackOut = gl.feedbackOut || new Shader(null, '\
        uniform sampler2D texture;\
        uniform sampler2D feedbackTexture;\
        uniform float blend;\
        varying vec2 texCoord;\
        void main() {\
            vec4 original = texture2D(texture, texCoord);\
            vec4 feedback = texture2D(feedbackTexture, texCoord);\
            gl_FragColor = mix(original, feedback, blend);\
        }\
    ');

    var t=this._.texture;    
    if(!this._.feedbackTexture) 
      this._.feedbackTexture=new Texture(t.width,t.height,t.format,t.type);

    this._.feedbackTexture.ensureFormat(this._.texture);
    this._.feedbackTexture.use(1);
    gl.feedbackOut.textures({
        texture: 0,
        feedbackTexture: 1
    });
    simpleShader.call(this, gl.feedbackOut, {
        blend: blend
    });
    this._.feedbackTexture.unuse(1);

    return this;
}
