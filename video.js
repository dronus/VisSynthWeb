

window.VideoEngine=function(){

    // user settable private callbacks
		var filter = function(){};
		var pre_draw_callback=false;
		var post_draw_callback=false;

		var setFilter = function(newFilter){
			filter = newFilter;
		};

		var setCallback = function(pre_draw,post_draw){
			pre_draw_callback=pre_draw;
			post_draw_callback=post_draw;
		};


    // <video> object for video decoding
		var video = document.createElement('video');
		video.autoplay = true;

    // glfx.js WebGL effect canvas object
		var canvas = fx.canvas();
		var texture;
		
		// main update function, shows video frames via glfx.js canvas
		var update = function(){
		
			if(pre_draw_callback) pre_draw_callback.call(this);
		
			texture.loadContentsOf(video);
			canvas.draw(texture);
			filter(canvas);
			canvas.update();

			if(post_draw_callback) post_draw_callback.call(this);

      // enqueue next update
			requestAnimationFrame(update);
		};
		
		// add our startup code to canplay handler of <video> object
		video.addEventListener('canplay', 
		
		function(e){
			canvas.width = video.videoWidth;
			canvas.height = video.videoHeight;
			texture = canvas.texture(video);
			
			// start frequent canvas updates
			update();
			
        }
		
		, false);

  // initalize getUserMedia() camera capture
	var userMedia = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.oGetUserMedia || navigator.mozGetUserMedia || navigator.msGetUserMedia;        
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

