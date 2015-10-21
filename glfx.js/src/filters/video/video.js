function video()
{

    var v=this._.videoFilterElement;
    if(!v)
    {
      var v = document.createElement('video');
      v.autoplay = true;
      v.muted=true;
      v.loop=true;
      v.src="test.mp4";
      this._.videoFilterElement=v;
    }  
      
    // make sure the video has adapted to the video source
    if(v.currentTime==0 || !v.videoWidth) return this; 
    
    if(!this._.videoTexture) this._.videoTexture=this.texture(v);    
    this._.videoTexture.loadContentsOf(v);
    this.draw(this._.videoTexture);
        
    return this;
}
