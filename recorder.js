var child_process = require('child_process');

//var recorder_cmd="avconv -f x11grab -r 25 -s 1600x900 -i :0.0+0,0 -vcodec libx264 -pre lossless_ultrafast -threads 4 -y video.mov";
var recorder_cmd="avconv";
var recorder_args="-f x11grab -r 25 -s 1600x900 -i :0.0+0,0 -vcodec libx264 -pre lossless_ultrafast -threads 4 -y video.mov".split(" ");


// TODO kann exec auch stdio inherit??
child_process.exec(recorder_cmd,recorder_args, {stdio:'inherit'});

