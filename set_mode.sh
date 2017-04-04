#!/bin/sh


output=`xrandr | head -n 2 | tail -n1 | grep -Eo '^[^ ]+ '`
echo "Setting output $output to mode $1"
DISPLAY=:0 xrandr --output $output  --mode $1


