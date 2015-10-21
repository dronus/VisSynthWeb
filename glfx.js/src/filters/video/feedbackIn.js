function feedbackIn()
{
    // Store a copy of the current texture in the feedback texture unit

    var t=this._.texture;
    if(!this._.feedbackTexture) 
      this._.feedbackTexture=new Texture(t.width,t.height,t.format,t.type);
    
    this._.feedbackTexture.ensureFormat(this._.texture);
    this._.texture.use();
    this._.feedbackTexture.drawTo(function() {
        Shader.getDefaultShader().drawRect();
    });

    return this;
}
