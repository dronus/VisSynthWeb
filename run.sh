#!/bin/sh

syncthing -no-browser -home=$HOME/selfiebox/st_config &

sleep 15
./selfiebox &

xset s off
xset -dpms

cd `dirname $0`
export DISPLAY=:0
xdotool mousemove 1080 1920
v4l2-ctl  -c zoom_absolute=115
chromium-browser --kiosk --app-auto-launched --app="http://127.0.0.1:1337" --window-position=0,0 --user-data-dir=chromium_tmp --disable-pinch --incognito --use-fake-ui-for-media-stream --disable-gpu-sandbox --remote-debugging-port=9222
