#!/bin/sh
#DISPLAY=:0 google-chrome --kiosk --disable-web-security --incognito  --ignore-gpu-blacklist  --use-fake-ui-for-media-stream  http://127.0.0.1:8082/index.html
#DISPLAY=:0 chromium-browser --kiosk --incognito --use-gl=egl --use-fake-ui-for-media-stream  http://127.0.0.1:8082/index.html
# DISPLAY=:0 chromium-browser --kiosk --disable-web-security --disable-namespace-sandbox --incognito --use-gl=egl --use-fake-ui-for-media-stream  http://127.0.0.1:8082/index.html
killall chromium-browser
# make sure the HDMI is enabled
DISPLAY=:0 xrandr --output HDMI-1 --off
DISPLAY=:0 xrandr --output HDMI-1 --auto
sleep 1
# hide mousepointer
DISPLAY=:0 xdotool mousemove 10000 10000
# run browser
DISPLAY=:0 chromium-browser --kiosk --disable-namespace-sandbox --incognito --use-gl=egl --use-fake-ui-for-media-stream  http://127.0.0.1:8082/index.html
