function capture()
{
    if(!this.video) return this;       
    if(!this._.videoTexture) this._.videoTexture=this.texture(this.video);
    
    this._.videoTexture.loadContentsOf(this.video);
    this.draw(this._.videoTexture);
        
    return this;
}
