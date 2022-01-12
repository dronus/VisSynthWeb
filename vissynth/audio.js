import {devices} from "./devices.js"

export let audio_engine={};

var BeatAnalyser=function()
{
  // guessed beat to lock upon
  this.lock_beat=2.2;

  // analyzer outputs
  this.pulse=0;

  // state variables
  this.sawtooth=0
  this.frequency=this.lock_beat;
  this.phase=0;
  
  this.analyse=function(pulse_amplitude,beat_frequency,amplitude,phase,offset)
  {
    if(beat_frequency!=this.lock_beat)
      this.frequency=this.lock_beat=beat_frequency;
    
    return pulse_amplitude * this.pulse + amplitude * (Math.sin(this.sawtooth*2.0*Math.PI+phase)+1.0)/2.0  + offset;
  }
  
  this.update=function(pulse,dt)
  {
    this.sawtooth+=this.frequency*dt;
    this.sawtooth=this.sawtooth % 1.0;
    
    var sine=Math.sin((this.sawtooth+this.phase)*2*Math.PI);

    // proportinally control energy (balances energy pulse around zero crossing)
    var k = 0.000125 * 256 *  pulse * sine;
    this.frequency +=  k ;
    this.phase += k*0.5;
    
    // stabilize around proposed beat
    this.frequency-=0.0001*(this.frequency-this.lock_beat);
    
    // console.log("f "+frequency+" s "+sine+" p "+phase+ " "+spectrogram.length);

    this.pulse=pulse;
  }    
}

var beatAnalysers=[];

// helper function for retrieving beat values. creates analysers on demand.
audio_engine.beatValue=function()
{
  // TODO prevent leaking, how to remove dumped analysers? 
  // We only may know they aren't used to analyse for some time..
  // maybe push on .analyse(), remove after 1s of .update 
  //
  // so for now, only ONE analyser!
  if(!beatAnalysers.length)
    beatAnalysers.push(new BeatAnalyser());
  
  return beatAnalysers[0].analyse.apply(beatAnalysers[0],arguments);
}

let context=null;
let analyser=null;
let source_node=null;
let current_device=-1;
let streams={};
audio_engine.spectrogram=false;
audio_engine.waveform=false;
audio_engine.set_device=function(device_index) {
  let i=parseInt(device_index);

  if(i==current_device) return;
  current_device=i;

  if(streams[i]) {
    setStream(streams[i]);
    return;
  }

  var constraints = {
    video: false,
    audio:{deviceId:devices.audio[i].deviceId}
  };
  navigator.mediaDevices.getUserMedia(constraints).then(function(stream){
    console.log("Got audio: "+constraints.audio.deviceId);
    // capture device was successfully acquired
    if(stream.getAudioTracks().length) {
      streams[i]=stream;
      setStream(stream);
    }
  });
}

let setStream=function(stream) {
    if(source_node) source_node.disconnect(analyser);
    source_node = context.createMediaStreamSource(stream);
    source_node.connect(analyser);
    context.resume();
}

var initAudioAnalysers=function()
{
    // show audio histogram for debug purpose, if canvas exists
    var canvas,audio_canvas_ctx;
    if(canvas=document.getElementById('audiocanvas'))
    {
      audio_canvas_ctx = canvas.getContext("2d");
      audio_canvas_ctx.fillStyle='#fff';
    }

    // create the audio context
    if (!window.AudioContext) 
      window.AudioContext = window.webkitAudioContext;
    context = new AudioContext();
    
    var samples=512;

    var scriptNode = context.createScriptProcessor(samples, 1, 1);
    scriptNode.connect(context.destination);

    analyser = context.createAnalyser();
    analyser.smoothingTimeConstant = 0.0;
    analyser.fftSize = samples;
    analyser.connect(scriptNode);


    // workaround for Webkit bug gc'ing the audio nodes if not referenced from JS side
    // audio processing stops then.
    // see http://code.google.com/p/chromium/issues/detail?id=82795
    window.audioReferencesFix=[scriptNode,analyser,context];

    // store time domain waveform
    var waveform    =  new Uint8Array  (analyser.fftSize);
    // store spectrogram and it's gliding means
    var spectrogram =  new Uint8Array  (analyser.frequencyBinCount);
    var means       =  new Float32Array(analyser.frequencyBinCount);

    scriptNode.onaudioprocess = function()
    {
        analyser.getByteTimeDomainData(waveform);
        analyser.getByteFrequencyData(spectrogram);

        // clear the current state
        if(audio_canvas_ctx) 
          audio_canvas_ctx.clearRect(0, 0, 640, 256);
  
        var pulse=0;
        
        // add up current pulse energy 
        for ( var i = 0; i < spectrogram.length; i++ )
        {
        
          // calculate gliding means
          var a=0.9;
          means[i]=means[i]*a+spectrogram[i]*(1.-a);

          var value = spectrogram[i]-means[i];

          // debug draw
          if(audio_canvas_ctx)
          {
            audio_canvas_ctx.fillStyle='#0f0';
            audio_canvas_ctx.fillRect(i*5,255-means[i],3,255);
            audio_canvas_ctx.fillStyle='#fff';
            audio_canvas_ctx.fillRect(i*5,255-spectrogram[i],3,2);
          }
          var attenuation=(spectrogram.length-i)/spectrogram.length;
          attenuation*=attenuation;
          pulse+=Math.max(0,value*attenuation);
        }
        pulse/=spectrogram.length;
        pulse/=256.;
        
        // refresh all beat analysers
        var dt=samples/context.sampleRate;        
        for(var i=0; i<beatAnalysers.length; i++)
          beatAnalysers[i].update(pulse,dt);
    }
    audio_engine.waveform   =waveform;
    audio_engine.spectrogram=spectrogram;
}
initAudioAnalysers();
