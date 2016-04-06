#!/bin/sh

gpio -g mode 171 down
gpio -g mode 172 down
gpio -g mode 173 down
nodejs ui_hardware_client.js || node ui_hardware_client.js
