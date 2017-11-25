#!/bin/sh

DISPLAY=:0 gst-launch-0.10 -e ximagesrc use-damage=0 ! ffmpegcolorspace ! nv_omx_h264enc bitrate=16000000 ! qtmux ! filesink location=../recorded/`date +'%Y%m%d%H%M%S'`.mov

