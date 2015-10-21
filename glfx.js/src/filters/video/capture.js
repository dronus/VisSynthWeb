function capture(source_index)
{
    source_index=Math.floor(source_index);    
    var v=this.video_source(source_index);
    
    // make sure the video has adapted to the capture source
    if(!v || v.currentTime==0 || !v.videoWidth) return this; 
    
    if(!this._.videoTexture) this._.videoTexture=this.texture(v);    
    this._.videoTexture.loadContentsOf(v);
    this.draw(this._.videoTexture);
        
    return this;
}
