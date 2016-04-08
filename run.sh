#!/bin/sh

cd `dirname $0`

./run_server.sh &
./run_hardware.sh &
./run_chrome.sh &
# hide mousepointer
DISPLAY=:0 xdotool mousemove 10000 10000

