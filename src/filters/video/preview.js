function preview()
{
    // Store a downscaled copy of the current texture in the preview texture unit
    var t=this._.texture;
    
    if(!this._.previewTexture) 
      this._.previewTexture=new Texture(t.width/4,t.height/4,t.format,t.type);
    this._.previewTexture.ensureFormat(t.width/4,t.height/4,t.format,t.type );

    this._.texture.use();
    this._.previewTexture.drawTo(function() {
        Shader.getDefaultShader().drawRect();
    });

    return this;
}
