VisSynthWeb - browser-based video synthesizer and effects
=========================================================

VisSynthWeb is a browser-based realtime video effect and synthesizer platform. It creates or transforms a live video (captured by an connected camera, stream) by user defined "chains" made of user-adjustable effects. The setup can be controlled in realtime by another browser device.

The user interface is provided by an integrated control server and may be accessed on any internet browser. Effects can be sorted from the collection into several chains, which can be switched on the fly. Effect parameters may be twiddled in realtime by sliders. A stack-based image memory allows the creation of more complex effect networks inside the linear chain. It is possible to drop effects into the running chain. As the chain paradigm does not require manual interconnecting of the effects the new effect becames active immediately. 

It runs well in lower resolutions even on small hardware like the Odroid XU4 or Nvidia Jetson. Such small computers can be tucked to screens or projectors. They will run the saved effect chain on power-up and can then be accessed as needed to tweak or replace the effect, making them useful for permanent installations.



## Requirements

* A computer with an web browser featuring a reliable WebGL implementation, working camera access, and a working node.js installation. Small EGL-supporting ARM devices are feasable. Mobile devices may work, but would require another device to run the control server.
* Another screen or computer with a web browser for remote control. No fun without control!
* A webcam or embedded camera (not neccessary in any case, but a lot of fun).


## Installation

* Clone this repository to the device sporting the camera and screen:
  git clone  https://github.com/dronus/VisSynthWeb.git
* Run 'node server.js' inside the repository
* Run the devices browser and enter 127.0.0.1:8082/index.html . The browser asks to allow camera access and the live image should appear after confirmation.
* Run up a browser on another device or second screen, and enter the address of the video machine, followed by :8082/ui.html . The user interface should appear.

## Usage

* Open the remote interface ui.html.
* The left list consist of saved "chains", one of them is running at a time. Click on them to make another one active. The chains may be reordered by dragging them. A chain may be deleted by dragging it out of the vertical chain list. They chain may be cloned by the "CLONE" button to get a working base for experiments.
* The second panel show the current chain. The effects can be clicked at to show their parameters. The chained effects can be reordered by dragging them to a new position inside the chain. An effect is removed of the chain by dragging it out of the chain.
* The third list contains effect modules, that can be added to the chain by dragging them into certain position in the chain.
* An effect can clicked to reveal sliders that allow adjustment of its parameters. The sliders are sporting a large range of numbers, and a finer grained control near the middle.
* The smaller panels "PRE" and "POST" to the right allow to pre- or append affects to all chains at once. So system- and location-dependent setup, eg. devices, could be done in PRE, and mapping, masking and perspective correction to adapt a projection could be done in POST.
* The small panel "PREVIEW" is black by default, but can be enabled to show a preview stream of the projection. Only use this if needed, as it has consumes computing power and bandwith and thus lowers the frame rate in most cases.
* Effect types: Most effects modify the incoming image. Others are special, some examples:
    * Sources (colored green), eg. capture - Has no input (so discards the image of the chain above). Outputs the raw camera image on top of the chain.
    * preview: Has no effect on the image itself, but feeds the image to the preview if enabled. Allows to check intermediate images in long chains.
    * push_stack: Does not modify the image at all, but places a copy onto a stack. Effects with more then one input use these.
    * Two-input effects, like blend, blend_alpha, colorkey, displace: These effects require two input images, require another image to be put on the stack before, which they take off and use.
    * feedbackOut, feedbackIn: feedbackIn stores one image that is hold onto the next video frame. Use feedbackOut above of it to create a feedback loop.
    * motion, timeshift: These effects keep internal copys of images over some time. 
* Any parameter can be animated by adding an oscilator "OSC" or audio beat analyser "BEAT" using the buttons next to the slider. OSC and BEAT add new sliders, and can be removed again with the respective "REMOVE" buttons.
* An OSC makes the value going up and down repeatedly. Four new parameters can be adjusted:
    * f: Set the frequency of the value change
    * a: Set the amplitude, that is how much the value will change in every swing
    * p: Sets the phase, this can be used to move the swing in respect to another OSC
    * o: Sets the offset, that is the center value of the swing. 
Usually you may first try an low "a" and set "o" to the old static value to achive a similiar effect.
* An BEAT makes the value react to sound. Five parameters can be adjusted:
    * pulse: Set the direct reaction to audio amplitude pulses
    * f: Set the guessed beat frequency of the audio, if any. For music, this is BPM / 60.
    * a: Set the amplitude, that is how much the value will change with the beat.
    * p: Sets the phase, this can be used to move the swing in respect to the beat.
    * o: Sets the offset, that is the lowest value of the swing.
* Any change to the active chain (add, order, adjust effects)  takes effect instantly.
* Any change is saved almost immediately.

## Sessions
By adding a hash mark '#' and some name to the end of the URL, a session is created. All ui.html and index.html from the same server using the same session will be synced to each other, the index.html showing the chain modified by all ui.html currently connected to this session.

## Best practices

* As camera setups may change or sometimes video clips or images serve as input to test the effect chains, it is advised
 to not use the capture, image and video source effects directly in the chains. 
 Better place one of them or more using the stack in the before-setup, and just depend any chain on an initial source and 
 maybe further ones from the stack.

* As any change is saved immediately, feel free to clone effect chains as often as practical while experimenting, to not lose
 well made old effects.
 
* Do not use the setup effects in any other place then the "setup before" chain. Using more then one setup of the same kind
 may degrade the performance, as the setup is changed twice or more on every video frame then.
 
* Always use type: byte setup effect if there is no special need for float color precision. Performance is much better doing so.
 Only some effects may look substantially different using float, like 'reaction' and 'smoothlife', if used in feedback loops.
 Float precision may exhibit weird behaviour in feedback loops, as it may store infinite values, that usually appear as bright 
 or black areas in the image never going away again.

## Library use

VisSynthWeb can be used as part of other web applications. Just include vissynth.js to your web page (plain JS modules, NO need for build systems like npm, yarn). This way, you can:
* add animated video effects to images, webcam or canvas-rendered graphics
* synthesize images on the fly
For a minimal example, see minimal_example.html. 
* VisSynthWeb will run from any static web server this way, however to tweak the effects by its own UI, the VisSynthWeb nodejs server is needed.
* You can still create effects in an UI-capable instance, and copy the effect chain code over to your own static application.

See example_minimal.html and example_multiple.html for library use.


## Issues / TODO

* Exceptions due to missing WebGL capabilities of the current machine are not caught reliable, so some effects or settings
 (like type_float color precision and high resolutions) may crash the video screen and require a click on RESTART after fixing.
 As the error condition is only debuggagle at the video screen machine and no error message is passed to the UI, direct access
 to the video machine is needed to find out about those problems.

## Troubleshooting

* Video display or UI does not start up as expected: Check the browsers console and report the bug. Check if the control server is running. Check the connection between the devices.

* Drag and Drop in the UI works not like expected: Try another browser or device, or fix the bug and file a pull request.

* Video display freezes: Try hit the RELOAD button in the remote UI's header. Check the video machine browser's console and report the bug.

## Technical details
TO BE DONE


## Credits

Originally used and now losely based on WebCamVidja: https://github.com/johanan/WebCamVidja.git , glfx.js:  http://evanw.github.com/glfx.js/
