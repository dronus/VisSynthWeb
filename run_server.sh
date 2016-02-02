#!/bin/sh
cd `dirname $0`

nodejs server.js || node server.js
