function motion(threshold,interval,damper) {
    gl.motionBlend = gl.motionBlend || new Shader(null, '\
        uniform sampler2D texture;\
        uniform sampler2D motionTexture;\
        uniform float blend;\
        varying vec2 texCoord;\
        void main() {\
            vec4 original = texture2D(texture, texCoord);\
            vec4 feedback = texture2D(motionTexture, texCoord);\
            gl_FragColor = mix(original, feedback, blend);\
        }\
    ');

    gl.motion = gl.motion || new Shader(null, '\
        uniform sampler2D texture;\
        uniform sampler2D motionTexture;\
        uniform float threshold;\
        varying vec2 texCoord;\
        void main() {\
            vec4 original = texture2D(texture, texCoord);\
            vec4 background = texture2D(motionTexture, texCoord);\
            float d=length(original.rgb-background.rgb);\
            gl_FragColor = d>threshold ? original : vec4(0.0,0.0,0.0,0.0);  \
        }\
    ');

    var t=this._.texture;
    if(!this._.motionTexture) 
      this._.motionTexture=new Texture(t.width,t.height,t.format,t.type);
    this._.motionTexture.ensureFormat(this._.texture);

    if(!this._.motionCycle || this._.motionCycle>interval)
    {
      // blend current image into mean motion texture
      this._.motionTexture.use(1);
      gl.motionBlend.textures({
          motionTexture: 1
      });
      simpleShader.call(this, gl.motionBlend, {
          blend: damper
      },this._.texture,this._.motionTexture);
      this._.motionTexture.unuse(1);

      this._.motionCycle=0;
    }
    this._.motionCycle++;

    // rebind, motionTexture was exchanged by simpleShader
    this._.motionTexture.use(1);
    gl.motion.textures({
        motionTexture: 1
    });
    simpleShader.call(this, gl.motion, {
        threshold: threshold
    });
    this._.motionTexture.unuse(1);

    return this;
}
