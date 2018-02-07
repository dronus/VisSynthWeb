midi={};

midi.notes      ={}; // MIDI note on / off driven note states
midi.toggles    ={}; // MIDI note on derived virtual toggle switches
midi.controllers={}; // MIDI controller inputs
midi.controllers_infinite={};

//midi.handlers   =[];

midi.echo_toggles=false;

(function(){
  var messageHandler=function(evt){

    var data    = evt.data;
    var cmd     = data[0] >> 4;
    var channel = data[0] & 0xf;
    var note    = data[1];
    var velocity= data[2];

    console.log("midi in:",cmd,channel,note,velocity);

    if(cmd==11) {
      // MIDI controller input

      var delta=velocity-(midi.controllers[note]||0);
      midi.controllers[note]=velocity;

      if(!midi.controllers_infinite[note]) midi.controllers_infinite[note]=0;
      if      (delta   !=  0) midi.controllers_infinite[note]+=delta;
      else if (velocity==  0) midi.controllers_infinite[note]--;
      else if (velocity==127) midi.controllers_infinite[note]++;
    }
    else if(cmd==9) { 
      // MIDI note on
      midi.notes  [channel+' '+note]=velocity;
      midi.toggles[channel+' '+note]=!midi.toggles[channel+' '+note];
    }
    else if(cmd==8) {
      // MIDI note off
      midi.notes[channel+' '+note]=0;
      if(midi.echo_toggles)
        midi.midiOut.send([((midi.toggles[channel+' '+note]?9:8)<<4)+channel,note,midi.toggles[channel+' '+note]*127]);
    }

    // for(var key in handlers) handlers[key](cmd,channel,note,velocity);
  };


  var init=function( midiAccess ) {
    // TODO selection by 'device' parameter
    for (var input of midiAccess.inputs.values()) {
      midi.midiIn=input;
    }
    for (var output of midiAccess.outputs.values()) {
      midi.midiOut=output;
    }
    input.onmidimessage=messageHandler;
  }

  navigator.requestMIDIAccess({}).then(init);

})();






