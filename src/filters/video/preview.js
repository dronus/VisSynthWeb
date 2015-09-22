function preview()
{
    // Draw a downscaled copy of the current texture to the viewport 
    
  /*  
    var t=this._.texture;
    
    if(!this._.previewTexture) 
      this._.previewTexture=new Texture(t.width/4,t.height/4,t.format,t.type);
    this._.previewTexture.ensureFormat(t.width/4,t.height/4,t.format,t.type );

    this._.texture.use();
    this._.previewTexture.drawTo(function() {
        Shader.getDefaultShader().drawRect();
    });
*/

    this.preview_width=320; this.preview_height=200;
    this._.texture.use();
    this._.flippedShader.drawRect(0,0,this.preview_width,this.preview_height);

    return this;
}


