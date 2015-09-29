window.VideoEngine=function()
{
  // user settable private callbacks
  var filter = function(){};
  var setFilter = function(newFilter){ filter = newFilter; };
  
  var pre_draw_callback=false;
  var preview_callback=false;
  var post_draw_callback=false;
  var setCallback = function(pre_draw,preview,post_draw){ pre_draw_callback=pre_draw; preview_callback=preview; post_draw_callback=post_draw; };

  // glfx.js WebGL effect canvas object
  var canvas = fx.canvas();

  // main update function, shows video frames via glfx.js canvas
  var update = function()
  {
    if(!canvas._.isInitialized)
      canvas.initialize(640,480);

    if(pre_draw_callback) pre_draw_callback.call(this);

    filter(canvas);
    
    if(preview_callback) preview_callback.call(this);

    canvas.update();

    if(post_draw_callback) post_draw_callback.call(this);

    // enqueue next update
    requestAnimationFrame(update);
  };

  // enumerate the available sources at startup...
  var source_ids={audio:[],video:[]};
  function onSourcesAcquired(sources) 
  {
    for (var i = 0; i != sources.length; ++i) {      
      var source = sources[i];
      source_ids[source.kind].push(source.id);
    }
    
    // start frequent canvas updates
    update();    
  }
  if(MediaStreamTrack.getSources)
    MediaStreamTrack.getSources(onSourcesAcquired);
  else
    onSourcesAcquired([]);


  // get the video feed from a capture device name by source_index into source_ids
  // opens the capture device and starts streaming on demand
  // the consumer may receive a still starting <video> object, so it has to add and handle 'canplay' event before properties like videoWidth are read.
  var videos={};
  var audio_found=false;
  var get_video=function(source_index)
  {
    source_index = source_index | 0;

    var device_mapping=document.location.hash.substring(1);
    if(device_mapping) device_mapping=JSON.parse(device_mapping);
    if(device_mapping[source_index]) 
      source_index=device_mapping[source_index];
    
    // jsut return video, if already started
    if(videos[source_index]) 
      return videos[source_index];

    console.log("Acquire stream for device index "+source_index);

    // create a new <video> element for decoding the capture stream
    var video = document.createElement('video');
    videos[source_index]=video;
  
    var constraints = {
      video:{
        optional: [{sourceId: source_ids.video[source_index]}]
      },
      audio:false
    };

    
    // TODO handle audio again, in a more flexible fashion than one device only...
    // for now, we just take the first device queried
    if(!audio_found)
    {
      constraints.audio={optional:[{sourceId:source_ids.audio[source_index]}]};
      audio_found=true;
    }

    // initalize getUserMedia() camera capture
    var getUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.oGetUserMedia || navigator.mozGetUserMedia || navigator.msGetUserMedia;        
    getUserMedia.call(navigator, constraints, function(stream){
    
      console.log("Got camera for id "+constraints.video.optional[0].sourceId);
      // capture device was successfully acquired
      video.autoplay = true;
      video.muted=true;
      if (video.mozSrcObject !== undefined) 
        video.mozSrcObject = stream;
      else
        video.src = URL.createObjectURL(stream);      
      // add our startup code to canplay handler of <video> object

      // TODO how to handle multiple devices with different resolutions?
      // for now, we just keep the inital resolution und don't adapt to devices at all!
      /*
      video.addEventListener('canplay',function(e){
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      },false);
      */

      // TODO handle audio again, in a more flexible fashion than one device only...
      if(stream.getAudioTracks().length) initAudioAnalysers(stream);
      
    }, function(err){
      console.log(err);
    });
  }
  
  // set video handler. 
  // the video devices are started on demand.
  // returns a <video> Element streaming the selected device.
  canvas.video=get_video;

  return {canvas: canvas, setFilter: setFilter, setCallback: setCallback};
}




