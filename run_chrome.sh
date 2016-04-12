#!/bin/sh
#DISPLAY=:0 google-chrome --kiosk --disable-web-security --incognito  --ignore-gpu-blacklist  --use-fake-ui-for-media-stream  http://127.0.0.1:8082/index.html
#DISPLAY=:0 chromium-browser --incognito --use-gl=egl --use-fake-ui-for-media-stream  http://127.0.0.1:8082/index.html
DISPLAY=:0 chromium-browser --kiosk --incognito --use-fake-ui-for-media-stream  http://127.0.0.1:8082/index.html
