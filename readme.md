WebCamVidja
========
This is a simple abstraction library for using a webcam through your browser. It uses the [getUserMedia](http://dev.w3.org/2011/webrtc/editor/getusermedia.html) method 
from the Web RTC specification. There is still a working group and things are still being finalized. That is where this library comes in. It tries to abstract out the changes
between browsers and give you a little more functionality.

##Basic Usage
WebCamVidja creates a global object wcvj. Here are the functions off of wcvj.

###wcvj.videoIsSupported()
returns: Boolean

This is a test to see if your browser supports getUserMedia in any of the vendor specific ways.

####Example
Here is a simple check before use of the library.

```javascript
if(wcvj.videoIsSupported()){
	var v = wcvj.webcam('video');
}
```

###wcvj.webcam(id, options)
id  
type: string

This the id of the video element you will use or create.
- - - -
options  
type: object

This object has four properties you can set:

* canvas: Boolean. Determines whether or not to create a canvas element.
* glfx: Boolean. Use with the canvas property. Will use the glfx.js canvas. Requires glfx to be loaded. If not it will fall back to a plain old canvas.
* draw: Function. You can specify the function that will be used to draw from the video to the canvas.
* autoplay: Boolean. This determines if the video should autoplay or if you will need to start the video. 

- - - -
returns: object

properties

* video: A reference to the video element. This will either be the element you have selected or created based on the id passed into the function.
* canvas: A reference to the canvas element. If the options.canvas property is not set this will be undefined. The canvas will either be a plain old canvas or a glfx canvas.
* setDraw(function): Pass this the refence to your new draw function. setDraw will change the internal draw function to the one passed for the canvas.
* setFilter(arrayOfFilters): Pass this your filters for glfx. These filters can be chained.
* update: This function will force the glfx canvas to update and draw to the canvas. 

####Draw Functions
Your new draw functions will have access to the canvas (this in the function), 2d context, 3d context (if applicable) , and the video element. Here is an example to draw a half sized feed of the video:

```javascript
var newDraw = function(c2,c3, v){
	/*
	 * this is mapped to the canvas object
	 * c2 is the 2d canvas context
	 * c3 is the webgl context
	 * v is the video element
	 */
	c2.drawImage(v, 0,0, this.width / 2, this.height / 2);
};
```

####Filter Array
The filter array is an array of an array of a string and an array. The outer array allows you chain filters together. The list of filters are from glfx.js. You can use any filter that the library supports.

Here is an example that will add a sepia tint and then a vignette to give the video feed an old time feel:
```javascript
var newFilter = [['sepia',[1]],['vignette',[0.5,0.7]]];
```

###Examples
All of these examples are in the demo/index.html page.

####Selecting an Existing video element
Easiest case. Grab a video element that has an id of video:

```javascript
var v = wcvj.webcam('video');
```

v will have a reference to the video#video element. 

####Creating a video element
You can create an element on the fly be adding an id that does not exist:

```javascript
var a = wcvj.webcam('a');
```

You will have to add the a.video reference to the page.

####Using a canvas for drawing
Just add an option object that sets canvas to true.

```javascript
var a = wcvj.webcam('a', {canvas: true});
```

Your return object will now have the reference to the a.canvas object. You can place this where ever you want.

####Using glfx.js
First make sure that glfx is loaded. If not, the method will fallback to a plain old canvas.

```javascript
var a = wcvj.webcam('a', {canvas: true, glfx: true});
```
