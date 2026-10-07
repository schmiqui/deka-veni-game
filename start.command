#!/bin/bash
# Dvojklik vo Finderi spustí hru v Chrome na celú obrazovku.
cd "$(dirname "$0")"
exec node server.js --kiosk
