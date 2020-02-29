// generators are functions providing parameter values in a time, sound or other input dependent fashion
//
// ui.html provide special UIs for some of these.
//


// flatten tree-like objects values into single array, dropping keys
var flatten=function(t,args)
{
  var vals=[];
  for(var key in args)
    if(key!="type")
      vals.push(args[key]);
  return vals;
}

// effect argument value generators...    
var random_index=0;
var oscillators={
  sine  : Math.sin,
  saw   : function(t){return (t % (2*Math.PI))/Math.PI-1.},
  square: function(t,d){return (t % (2*Math.PI)<Math.PI*2.*d) ? 1. : -1.},
  random: function(t){
    t=t/Math.PI;
    var i0=Math.floor(t);
    var i1=i0+1;
    t=t-i0;
    var p1=42841, p2=99991;
    var r0=Math.sin(i0*p1+random_index*p2)+1.0;
    r0=(p1*r0) % 2.0 - 1.0;
    var r1=Math.sin(i1*p1+random_index*p2)+1.0;
    r1=(p1*r1) % 2.0 - 1.0;
    random_index++;
    t=(Math.sin((t-0.5)*Math.PI)+1.0)/2.0;
    return r0*(1.-t)+r1*t;
  }
}

var clamp=function(x,a,b){
  return Math.min(b,Math.max(a,x));
}  

generators={
  perspective:function(t,args){return [[-0.5,-0.5, -0.5,0.5, 0.5,-0.5, 0.5,0.5],flatten(t,args)]},
  osc:function(t,args){return args.a*oscillators[args.waveform ? args.waveform : 'sine'](t*args.f+args.p,args.duty?args.duty:0.5)+args.o;},
  beat:function(t,args) { return audio_engine.beatValue.apply(null,flatten(t,args));},
  midi:function(t,args){return clamp( (args.infinite?window.midi.controllers_infinite:window.midi.controllers)[args.channel|0]*args.a+args.o, args.min, args.max)},
  midi_note:function(t,args){return (window.midi.notes[args.channel+" "+args.note]|0)*args.a+args.o},
  pos:flatten,
  size:flatten,
  rgb:flatten,
  rgba:flatten,
  rgb_range:flatten
};

