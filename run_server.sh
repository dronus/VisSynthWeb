#!/bin/sh
cd `dirname $0`

while true
do
  DISPLAY=:0 nodejs server.js
  sleep 1
done
