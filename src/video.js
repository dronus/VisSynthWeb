var wcvj = window.wcvj || {};

wcvj.videoIsSupported = function(){ return !!(navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia || navigator.msGetUserMedia); };
wcvj.webglIsSupported = function(){
			var can = document.createElement('canvas');
			return !!(window.WebGLRenderingContext && (can.getContext('webgl') || can.getContext('experimental-webgl')));
		};

(function(wcvj){
	"use strict";
	var userMedia = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.oGetUserMedia || navigator.mozGetUserMedia || navigator.msGetUserMedia;
	var url = window.webkitURL || window.mozURL || window.msURL || window.URL;
	
	var requestAnimFrame = (function(){
		return  window.requestAnimationFrame ||
			window.webkitRequestAnimationFrame ||
			window.mozRequestAnimationFrame    ||
			window.oRequestAnimationFrame      ||
			window.msRequestAnimationFrame     ||
			function( callback ){
				window.setTimeout(callback, 1000 / 60);
			};
	})();
	
	wcvj.webcam = function(el, options){
		//check options
		options = typeof options !== 'undefined' ? options : {};
		options.canvas = typeof options.canvas !== 'undefined' ? options.canvas : false;
		options.draw = typeof options.draw !== 'undefined' ? options.draw : false;
        options.autoplay = typeof options.autoplay !== 'undefined' ? options.autoplay : true;
        options.resolution = typeof options.resolution !== 'undefined' ? options.resolution: 'default';
		
		var webgl = function(){
			var can = document.createElement('canvas');
			return !!(window.WebGLRenderingContext && (can.getContext('webgl') || can.getContext('experimental-webgl')));
		};
		
		if(window.fx !== undefined && wcvj.webglIsSupported()){
			options.glfx = typeof options.glfx !== undefined ? options.glfx : false;
		}else{
			options.glfx = false;
		}
		
		var video;
		var canvas, ctx, ctx3, texture, filter;
		
		
		filter = [];
		
		video = document.getElementById(el);
		
		if(video === null){
			//id not there create element
			video = document.createElement('video');
			video.id = el;
			video.autoplay = options.autoplay;
			video.innerHTML = "Your browser does not support video";
		}else{
			video.autoplay = options.autoplay;
		}
		
		if(options.glfx && wcvj.webglIsSupported()){
			canvas = fx.canvas();
		}else if(options.canvas){
			canvas = document.createElement('canvas');
			ctx = canvas.getContext('2d');
			ctx3 = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
			canvas.innerHTML = "Your browser does not support canvas";
        }
        
        //determine resolution
        
        var quickRes = {
            "1080p": {
                "mandatory": {
                    "minWidth": "1920",
                    "minHeight": "1080"
                }
            },
            "UXGA": {
                "mandatory": {
                    "minWidth": "1600",
                    "minHeight": "1200"
                }
            },
            "720p": {
                "mandatory": {
                    "minWidth": "1280",
                    "minHeight": "720"
                }
            },
            "SVGA": {
                "mandatory": {
                    "minWidth": "800",
                    "minHeight": "600"
                }
            },
            "VGA": {
                "mandatory": {
                    "minWidth": "640",
                    "minHeight": "480"
                }
            },
            'default': true
        };
        
        var resolution = typeof options.resolution === 'string' ? quickRes[options.resolution] : options.resolution;
        //one final check. If someone uses a string that does not exist just use default
        if (resolution === undefined) {
            resolution = quickRes['default'];
        }
		
		var defaultDraw = function(){
			ctx.drawImage(video, 0, 0);
		};
		
		if(!options.draw){
			options.draw = defaultDraw;
		}
		
		var canvasDraw = function(){
			if(options.glfx){
				texture.loadContentsOf(video);
				canvas.draw(texture);
				for(var f=0; f<filter.length; f++){
					canvas[filter[f][0]].apply(canvas, filter[f][1]);
				}
				canvas.update();
			}else{
				options.draw.apply(canvas, [ctx, ctx3, video]);
			}
			requestAnimFrame(canvasDraw);
		};
		
		var setDraw = function(newDraw){
			if(options.canvas){
				options.draw = newDraw;
				ctx.save();
				ctx.setTransform(1, 0, 0, 1, 0, 0);
				ctx.clearRect(0, 0, canvas.width, canvas.height);
				ctx.restore();
			}
		};
		
		var setFilter = function(newFilter){
			filter = newFilter;
		};
		
		var forceUpdate = function(){
			if(options.glfx){
				canvas.update();
			}
		};
		
		var playInit = function(e){
			if(options.canvas || options.glfx){
				canvas.width = video.videoWidth;
				canvas.height = video.videoHeight;
			}
			
			setTimeout(function(){
				if(options.glfx){
					texture = canvas.texture(video);
					canvasDraw();
				}
			}, 500);
				
			if(options.canvas){
				canvasDraw();
			}
			
        };
        
        var killStream = function killStream() {
            if (video.src !== null) {
                video.pause();
                //chrome should be empty string
                video.src = '';
                stream.stop();
            }
        };
		
		//event setup
		video.addEventListener('canplay', playInit, false);
        
        var stream;

		userMedia.call(navigator, {video: resolution, audio: false}, function(videoStream){
            stream = videoStream;
            if (video.mozSrcObject !== undefined) {
				video.mozSrcObject = stream;
			} else if(navigator.mozGetUserMedia){
				video.src = stream;
			} else if(url){
				//should get everything else
				video.src = url.createObjectURL(stream);
			}else{
				video.src = stream;
			}
			
		}, function(err){
			var evt = document.createEvent('Event');
			evt.initEvent("UserMediaError",true,true);
			evt.UserMediaError = err;
			video.dispatchEvent(evt);
		});
		
		return {video: video, canvas: canvas, setDraw: setDraw, setFilter: setFilter, update: forceUpdate, killStream: killStream};
	};
}(window.wcvj));
