#!/bin/sh

cd `dirname $0`

./run_server.sh &
./run_chrome.sh &
