#!/bin/sh

cd `dirname $0`

./run_server.sh &
# ./run_hardware.sh &
./run_chrome.sh &
node ui_hardware_thin_client_adapter.js &
