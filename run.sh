#!/bin/sh

cd `dirname $0`

./run_server.sh &
./run_hardware.sh &
./run_chrome.sh &
DISPLAY=:0 xdotool mousemove 1000 1000

