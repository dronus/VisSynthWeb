#!/bin/sh

# hide mousepointer
DISPLAY=:0 xdotool mousemove 1920 1080
# disable screen saver
DISPLAY=:0 xset s off
DISPLAY=:0 xset -dpms 

#DISPLAY=:0 google-chrome --kiosk --disable-web-security --incognito  --ignore-gpu-blacklist  --use-fake-ui-for-media-stream  http://127.0.0.1:8082/index.html
#DISPLAY=:0 chromium-browser --incognito --use-gl=egl --use-fake-ui-for-media-stream  http://127.0.0.1:8082/index.html
DISPLAY=:0 chromium-browser --disable-infobars --kiosk --use-pulseaudio --incognito --use-fake-ui-for-media-stream --remote-debugging-port=9222 http://127.0.0.1:8082/index.html
