#!/bin/sh
DISPLAY=:0 chromium-browser --use-gl=egl --use-fake-ui-for-media-stream  http://127.0.0.1:8082/demo/index.html
