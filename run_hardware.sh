#!/bin/sh


# Set encoder pullup resistors (not possible inside ui_hardware_client.js)
#patch
gpio -g mode 22 down
gpio -g mode 30 down
gpio -g mode 29 down
#layer
gpio -g mode 24 down
gpio -g mode 25 down
gpio -g mode 31 down
#param
gpio -g mode 28 down
gpio -g mode 19 down
gpio -g mode 209 down
# value
gpio -g mode 171 down
gpio -g mode 172 down
gpio -g mode 173 down

nodejs ui_hardware_client.js || node ui_hardware_client.js
