#!/bin/sh

syncthing -no-browser -home=$HOME/selfiebox/st_config &

sleep 15
./selfiebox &

xset s off
xset -dpms

cd `dirname $0`
export DISPLAY=:0
xdotool mousemove 1080 1920
xsetroot -cursor emptycursor emptycursor

chromium-browser --kiosk --app-auto-launched --app="http://127.0.0.1:1337" --window-position=0,0 --user-data-dir=chromium_tmp --disable-pinch --incognito --use-fake-ui-for-media-stream --disable-gpu-sandbox --remote-debugging-port=9222 &
sleep 20
v4l2-ctl -c backlight_compensation=0
v4l2-ctl -c focus_auto=0
v4l2-ctl -c focus_absolute=0
v4l2-ctl -c exposure_auto=1
v4l2-ctl -c exposure_auto_priority=0
v4l2-ctl -c exposure_absolute=1500
v4l2-ctl -c white_balance_temperature_auto=0
v4l2-ctl -c white_balance_temperature=4430

