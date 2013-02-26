#WebCamVidja
This is a simple abstraction library for using a webcam through your browser. It uses the [getUserMedia](http://dev.w3.org/2011/webrtc/editor/getusermedia.html) method 
from the Web RTC specification. There is still a working group and things are still being finalized. That is where this library comes in. It tries to abstract out the changes
between browsers and give you a little more functionality.

##Basic Usage
WebCamVidja creates a global object wcvj. Here are the functions off of wcvj.

###wcvj.videoIsSupported()
returns: Boolean

This is a test to see if your browser supports getUserMedia in any of the vendor specific ways.

####Example
''''
if(wcvj.videoIsSupported){
	var v = wcvj.webcam('video');
}
''''
