#WebCamVidja
This is a simple abstraction library for using a webcam through your browser. It uses the [getUserMedia](http://dev.w3.org/2011/webrtc/editor/getusermedia.html) method 
from the Web RTC specification. There is still a working group and things are still being finalized. That is where this library comes in. It tries to abstract out the changes
between browsers and give you a little more functionality.

##Basic Usage
There are only two methods.
* videoIsSupported - Boolean, tells you whether your browser supports getUserMedia or not
````javascript
wcvj.videoIsSupported();
````
* webcam - it returns an object with the video element, canvas, and some functions in it.

The simplest use case is a one liner. This assumes you have a video element on the page with an 
````javascript

````