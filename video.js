var wcvj = window.wcvj || {};

(function(wcvj){
	"use strict";
	var userMedia = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.oGetUserMedia || navigator.mozGetUserMedia || navigator.msGetUserMedia;

  if(!userMedia)
  {
    alert('No getUserMedia');
    return;
  }

	wcvj.webcam = function(){
				
		
		var filter = function(){};
		var pre_draw_callback=false;
		var post_draw_callback=false;		

		var video = document.createElement('video');
		video.autoplay = true;
		var canvas = fx.canvas();
		var texture;
		
		var canvasDraw = function(){
		
			if(pre_draw_callback) pre_draw_callback.call(this);
		
			texture.loadContentsOf(video);
			canvas.draw(texture);
			filter(canvas);
			canvas.update();

			if(post_draw_callback) post_draw_callback.call(this);

			requestAnimationFrame(canvasDraw);
		};
				
		var setFilter = function(newFilter){
			filter = newFilter;
		};

		var setCallback = function(pre_draw,post_draw){
			pre_draw_callback=pre_draw;
			post_draw_callback=post_draw;
		};
		

		var playInit = function(e){
			canvas.width = video.videoWidth;
			canvas.height = video.videoHeight;
			
			setTimeout(function(){
				texture = canvas.texture(video);
				canvasDraw();
			}, 500);
				
			
        };
		
		//event setup
		video.addEventListener('canplay', playInit, false);
        
 	userMedia.call(navigator, {video: true, audio: false}, function(videoStream){
      if (video.mozSrcObject !== undefined) {
				video.mozSrcObject = videoStream;
			} else
				video.src = URL.createObjectURL(videoStream);
			
		}, function(err){
			var evt = document.createEvent('Event');
			evt.initEvent("UserMediaError",true,true);
			evt.UserMediaError = err;
			video.dispatchEvent(evt);
		});
		
		return {canvas: canvas, setFilter: setFilter, setCallback: setCallback};
	};
}(window.wcvj));
