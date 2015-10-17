#!/bin/sh
DISPLAY=:0 google-chrome --incognito --kiosk --ignore-gpu-blacklist --use-gl=egl --use-fake-ui-for-media-stream  http://127.0.0.1:8082/index.html
#DISPLAY=:0 chromium-browser --incognito --use-gl=egl --use-fake-ui-for-media-stream  http://127.0.0.1:8082/index.html
