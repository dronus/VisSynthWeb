window.VideoEngine=function()
{
  // user settable private callbacks
  var filter = function(){};
  var setFilter = function(newFilter){ filter = newFilter; };
  
  var pre_draw_callback=false;
  var post_draw_callback=false;
  var setCallback = function(pre_draw,post_draw){ pre_draw_callback=pre_draw; post_draw_callback=post_draw; };

  // <video> object for video decoding
  var video = document.createElement('video');
  video.autoplay = true;

  // glfx.js WebGL effect canvas object
  var canvas = fx.canvas();

  // main update function, shows video frames via glfx.js canvas
  var update = function()
  {
    if(pre_draw_callback) pre_draw_callback.call(this);

    filter(canvas);
    canvas.update();

    if(post_draw_callback) post_draw_callback.call(this);

    // enqueue next update
    requestAnimationFrame(update);
  };

  // add our startup code to canplay handler of <video> object
  video.addEventListener('canplay',function(e){
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.video=video;
    // start frequent canvas updates
    update();
  },false);

  // initalize getUserMedia() camera capture
  var getUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.oGetUserMedia || navigator.mozGetUserMedia || navigator.msGetUserMedia;        
  getUserMedia.call(navigator, {video: true, audio: false}, function(videoStream){
    // capture device was successfully acquired
    if (video.mozSrcObject !== undefined) 
      video.mozSrcObject = videoStream;
    else
      video.src = URL.createObjectURL(videoStream);			
  }, function(err){
    // can't capture error handler
    // TODO for what is this event good for? Browser displays a warning or what?
    var evt = document.createEvent('Event');
    evt.initEvent("UserMediaError",true,true);
    evt.UserMediaError = err;
    video.dispatchEvent(evt);
  });

  return {canvas: canvas, setFilter: setFilter, setCallback: setCallback};
}

