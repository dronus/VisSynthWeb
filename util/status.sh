#!/bin/sh

echo "Temperature:"
cat /sys/devices/virtual/thermal/thermal_zone0/temp 
echo
echo "Fan speed:"
cat /sys/devices/odroid_fan.14/pwm_duty
echo
echo "CPU freqs:"
cat /sys/devices/system/cpu/cpu*/cpufreq/scaling_cur_freq
echo
echo "GPU freq:"
cat /sys/devices/11800000.mali/clock

