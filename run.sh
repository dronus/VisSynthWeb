#!/bin/sh

cd `dirname $0`

# make sure the camera microphone is enabled
pactl set-source-mute 0 0

./run_server.sh &
./run_chrome.sh &

