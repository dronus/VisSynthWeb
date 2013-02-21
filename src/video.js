var wcvj = window.wcvj || {};

wcvj.videoIsSupported = function(){ return !!(navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia || navigator.msGetUserMedia); };

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
		options.autoPlay = typeof options.autoPlay !== 'undefined' ? options.autoPlay : true;
		
		var webgl = function(){
			var can = document.createElement('canvas');
			return !!(window.WebGLRenderingContext && (can.getContext('webgl') || can.getContext('experimental-webgl')));
		};
		
		if(window.fx !== undefined && webgl()){
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
			video.setAttribute('autoplay',  options.autoPlay);
			video.innerHTML = "Your browser does not support video";
		}else{
			video.setAttribute('autoplay', options.autoPlay);
		}
		
		if(options.glfx && webgl()){
			canvas = fx.canvas();
		}else if(options.canvas){
			canvas = document.createElement('canvas');
			ctx = canvas.getContext('2d');
			ctx3 = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
			canvas.innerHTML = "Your browser does not support canvas";
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
			options.draw = newDraw;
		};
		
		var setFilter = function(newFilter){
			filter = newFilter;
		};
		
		var forceUpdate = function(){
			if(options.glfx){
				canvas.update();
			}
		};
		
		var playInit = function(){
			if(options.glfx){
				texture = canvas.texture(video);
			}
			
			if(options.canvas || options.glfx){
				canvas.width = video.videoWidth;
				canvas.height = video.videoHeight;
				canvasDraw();
			}
		};
		
		//event setup
		video.addEventListener('canplay', playInit, false);
		
		userMedia.call(navigator, {video: true, audio: false}, function(stream){
			if(video.mozSrcObject !== undefined) {
				video.mozSrcObject = stream;
			} else if(navigator.mozGetUserMedia){
				video.src = stream;
			} else if(url){
				//should get everything else
				video.src = url.createObjectURL(stream);
			}else{
				video.src = stream;
			}
			
		}, function(){});
		
		return {video: video, canvas: canvas, setDraw: setDraw, setFilter: setFilter, update: forceUpdate};
	};
}(window.wcvj));
