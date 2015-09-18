function analogize(exposure,gamma,glow,radius) {
    gl.analogize = gl.analogize || new Shader(null,'\
    \
      uniform sampler2D texture;\
      uniform sampler2D glow_texture;\
      varying vec2 texCoord;\
		  uniform float Glow; \
		  uniform float Exposure;\
		  uniform float Gamma;\
		  void main(void){\
		     vec3 color  = texture2D(glow_texture,vec2(texCoord)).rgb*Glow;\
		     color  += 	texture2D(texture,texCoord).rgb;\
		     color=1.0-exp(-Exposure*color);\
		     color=pow(color, vec3(Gamma,Gamma,Gamma));\
		     gl_FragColor.rgb = color;\
		     gl_FragColor.a = 1.0;\
		  } \
    ');

    // Store a copy of the current texture in the second texture unit
    this._.extraTexture.ensureFormat(this._.texture);
    this._.texture.use();
    this._.extraTexture.drawTo(function() {
        Shader.getDefaultShader().drawRect();
    });

    // Blur the current texture, then use the stored texture to detect edges
    this._.extraTexture.use(1);
    this.triangleBlur(radius);
    gl.analogize.textures({
        glow_texture: 0,
        texture: 1
    });
    simpleShader.call(this, gl.analogize, {
        Glow: glow,
        Exposure: exposure,
        Gamma: gamma
    });
    this._.extraTexture.unuse(1);

    return this;
}

