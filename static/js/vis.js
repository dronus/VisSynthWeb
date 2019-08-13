    document.body.appendChild(canvas);

    var time=0,frame_time=0; // running time
    var preview_cycle=0;
    var preview_enabled=false;
    var screenshot_cycle=0;
    var preview_canvas=null;
    var chain=null;

    // main update function, shows video frames via glfx.js canvas
    var update = function()
    {
      // enqueue next update
      if(canvas.proposed_fps)
        setTimeout(function(){
          requestAnimationFrame(update);
        },1000/canvas.proposed_fps);
      else
        requestAnimationFrame(update);

      // quirk: glfx.js canvas may not be initalized if draw was not called.
      if(!canvas._.isInitialized)
        canvas.initialize(800,600);

      // get animation time
      var current_time=Date.now();
      frame_time=frame_time*0.9 + (current_time-time)*0.1;
      time=current_time;
      var effect_time=time*0.001; // 1 units per second

      // run effect chain
      random_index=0; // used by effect chain to distinguish all random invocations in a single frame
      if(chain) run_chain(chain,canvas,effect_time);

      // redraw visible canvas
      canvas.update();

      // reset switched flag, it is used by some filters to clear buffers on chain switch
      canvas.switched=false;

      // take screenshot if requested
      if(screenshot_cycle==1)
      {
        IMG = canvas.toDataURL('image/jpeg');
        fsm.update("preview");
        screenshot_cycle=0;
      }
    };

    // enumerate the available sources at startup and start update loop if found
    var source_ids={audio:[],video:[]};
    var running=false;
    function onSourcesAcquired(sources)
    {
      source_ids={audio:[],video:[]};
      for (var i = 0; i != sources.length; ++i) {
        var source = sources[i];
        var kind=source.kind;

        // on the newer navigator.mediaDevices.enumerateDevices interface, kind is "audioinput" or "videoinput" and so on..
        kind=kind.replace('input','');

        if(kind=='audio' || kind=='video')
        {
          source_ids[kind].push(source.id || source.deviceId);
        }
      }
      // start frequent canvas updates
      if(!running)
      {
        running=true;
        update();
      }
    }
    // fetch available capture devices for the first time and report them to UI.
    // Also starts the rendering engine after device enumeration.
    devices();

    // let the remote change the audio source
    //
    // this is a global function that is therefore available as a setup function in the filter chain
    // TODO find a cleaner way to provide this function
    //
    var audio_device_index=0;
    var audio_found=-1;
    function select_audio(device_index)
    {
      audio_device_index=parseInt(device_index);
      if(audio_found==audio_device_index) return;
      audio_found=audio_device_index;

      var constraints = {
        video: false,
        audio:{deviceId:source_ids.audio[audio_device_index]}
      };
      navigator.mediaDevices.getUserMedia(constraints).then(function(stream){
        console.log("Got audio: "+constraints.audio.deviceId);
        // capture device was successfully acquired
        if(stream.getAudioTracks().length) initAudioAnalysers(stream);
      });
    }

    // get the video feed from a capture device name by source_index into source_ids
    // opens the capture device and starts streaming on demand
    // the consumer may receive a still starting <video> object, so it has to add and handle 'canplay' event before properties like videoWidth are read.
    //
    // TODO this also grabs one audio source, selected by audio_device_index if not already done.
    // this should be done somewhere else (eg. audio depending filters) but if we don't do it now,
    // the user may be asked twice, first for camera, then for microphone.
    // There is no clean solution to this, as any chain may use any audio / video source...
    // maybe we should at least delay device grabbing until the pre_chain is evaluated for the first time,
    // we can then ask for the sources that will most likely be the only ones for the full session.
    var videos={};
    var get_video=function(source_index,width,height)
    {
      source_index = source_index | 0;

      // just return video, if already started
      if(videos[source_index])
        return videos[source_index];

      console.log("Acquire stream for device index "+source_index);

      // create a new <video> element for decoding the capture stream
      var video = document.createElement('video');
      videos[source_index]=video;

      var constraints = {
        video:
        {
          deviceId: source_ids.video[source_index],
          width:{}, height:{}
        },
        audio:false
      };

      // enforce resolution, if asked to
      if(width && height)
      {
          constraints.video.width=width;  constraints.video.height=height;
      }

      navigator.mediaDevices.getUserMedia(constraints).then(function(stream){
        console.log("Got camera!");
        // capture device was successfully acquired
        video.autoplay = true;
        video.muted=true;
        if (video.mozSrcObject !== undefined)
          video.mozSrcObject = stream;
        else
          video.srcObject = stream;
        video.play();
      });
    }

    // set video handler.
    // the video devices are started on demand.
    // returns a <video> Element streaming the selected device.
    // this is used by the 'capture' effect to acquire the camera.
    canvas.video_source=get_video;

    // helper functions for chain code generation

    var get_param_values=function(param,canvas,t)
    {
      var args=[];
      if(!(param instanceof Object)) return param;
      var fn=generators[param.type]; // from generators.js
      return fn.call(window,t,param);
    }

    var run_effect=function(effect,canvas,t)
    {
      if(typeof effect == "string") return;
      var args=[];
      var fn=canvas[effect.effect] ? canvas[effect.effect] : window[effect.effect];
      for(var key in effect)
      {
        if(key=='effect') continue;
        args=args.concat(get_param_values(effect[key],canvas,t));
      }
      fn.apply(canvas,args);
    }

    var run_chain=function(chain,canvas,t)
    {
      for(var i=0; i<chain.length; i++)
        run_effect(chain[i],canvas,t);
    }

    // global functions called by remote control

    // set effect chain to render
    function setChain(effects)
    {
      effects.unshift({'effect':'stack_prepare'});
      var havePreview=false;
      for(var i=0; i<effects.length; i++)
        if(effects[i].effect=='preview')
          havePreview=true;
      if(!havePreview)
        effects.push({'effect':'preview'});

      // set chain
      chain=effects;

      // set canvas 'switched' flag, that can be used by filters to reset buffers
      canvas.switched=true;
    }

    // receive device list request from remote
    function devices()
    {
      if(navigator.mediaDevices.enumerateDevices)
        navigator.mediaDevices.enumerateDevices().then(onSourcesAcquired);
      else
        onSourcesAcquired([]);
    }

    // receive preview request from remote
    function preview(enabled)
    {
      // engage preview process
      preview_enabled=enabled;
      preview_cycle=2;
    }

    // receive screenshot request from remote
    function screenshot()
    {
      // engage screenshot process
      screenshot_cycle=1;
    }

    // load startup chain (first three of chains.json : setup pre, current, setup after)
    var xmlHttp = new XMLHttpRequest();
    xmlHttp.open('GET','static/vis/chains.json',false);
    xmlHttp.send(null);
    if(xmlHttp.responseText)
    {
      var chains=JSON.parse(xmlHttp.responseText);
      var full_chain=chains[0].concat(chains[2],chains[1]);
      setChain(full_chain);
    }
