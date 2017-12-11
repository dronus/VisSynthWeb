var Gpio = require('onoff').Gpio;

exports.add=function(id,pin_a,pin_b,pin_button,callback)
{
  var io_a = new Gpio(pin_a, 'in', 'both');
  var io_b = new Gpio(pin_b, 'in', 'both');
  var io_button = new Gpio(pin_button, 'in', 'both');

  var state=[0,0]; 

  var impulse_handler=function(pin,value)
  {
    state[pin]=value;
    if(state[0]==state[1]) 
      callback(id,pin*2-1);
  }
  io_a.watch(function(err,value){impulse_handler(0,value);});
  io_b.watch(function(err,value){impulse_handler(1,value);});
  io_button.watch(function(err,value){if(value) callback(id,0);});

  process.on('SIGINT', function () {
    io_a.unexport();
    io_b.unexport();
    io_button.unexport();
  });
}

// add_encoder('knob1',30,22,29,knob_handler);


