function timeshift(time)
{
    // Store a stream of the last second in a ring buffer

    var max_frames=25;
    
    if(!this._.pastTextures) this._.pastTextures=[];

    var t=this._.texture;
    if(this._.pastTextures.length<max_frames)
      this._.pastTextures.push(new Texture(t.width,t.height,t.format,t.type));
    
    // copy current frame to the start of the queue, pushing all frames back
    var nt=this._.pastTextures.pop();
    this._.texture.use();
    nt.drawTo(function() { Shader.getDefaultShader().drawRect(); });
    this._.pastTextures.unshift(nt);

    // copy past frame from the queue to the current texture, if available
    var j=Math.abs(Math.floor(time) % max_frames);
    if(this._.pastTextures[j]) 
    {
      this._.pastTextures[j].use();
      this._.texture.drawTo(function() { Shader.getDefaultShader().drawRect(); });
    }

    return this;
}
