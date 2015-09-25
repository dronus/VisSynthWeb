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
  video.muted=true;

  // glfx.js WebGL effect canvas object
  var canvas = fx.canvas();

  // main update function, shows video frames via glfx.js canvas
  var update = function()
  {
    if(pre_draw_callback) pre_draw_callback.call(this);

    filter(canvas);
    
    if(post_draw_callback) post_draw_callback.call(this);

    canvas.update();

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



function onSourcesAcquired(sources) 
{
  var source_ids={audio:[],video:[]};

  for (var i = 0; i != sources.length; ++i) {
    var source = sources[i];
    source_ids[source.kind].push(source.id);
  }

  var device_indices=document.location.hash.substring(1);
  if(!device_indices) device_indices='0,2';
  device_indices=device_indices.split(',');

  var constraints = {
    video:{
      optional: [{sourceId: source_ids.video[device_indices[0]]}]
    },
    audio:{
      optional: [{sourceId: source_ids.audio[2]}]
    }
  };

  // initalize getUserMedia() camera capture
  var getUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.oGetUserMedia || navigator.mozGetUserMedia || navigator.msGetUserMedia;        
  getUserMedia.call(navigator, constraints, function(stream){
    // capture device was successfully acquired
    if (video.mozSrcObject !== undefined) 
      video.mozSrcObject = stream;
    else
      video.src = URL.createObjectURL(stream);
    initAudioAnalysers(stream);
  }, function(err){
    // can't capture error handler
    // TODO for what is this event good for? Browser displays a warning or what?
    var evt = document.createEvent('Event');
    evt.initEvent("UserMediaError",true,true);
    evt.UserMediaError = err;
    video.dispatchEvent(evt);
  });
}

if(MediaStreamTrack.getSources)
  MediaStreamTrack.getSources( onSourcesAcquired);
else
  onSourcesAcquired([]);

  return {canvas: canvas, setFilter: setFilter, setCallback: setCallback};
}

