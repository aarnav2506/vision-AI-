#!/bin/zsh
cd "$(dirname "$0")"
echo "Starting VisionPulse AI Server on http://localhost:8080 ..."
open "http://localhost:8080"
/usr/bin/ruby server.rb
