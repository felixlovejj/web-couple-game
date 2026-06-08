#!/bin/bash
echo "=== server check ===" > /home/ubuntu/apps/scriptable/scratch-off/check.log
node --check /home/ubuntu/apps/scriptable/scratch-off/server.cjs >> /home/ubuntu/apps/scriptable/scratch-off/check.log 2>&1
echo "EXIT:$?" >> /home/ubuntu/apps/scriptable/scratch-off/check.log
echo "=== vite build ===" >> /home/ubuntu/apps/scriptable/scratch-off/check.log
cd /home/ubuntu/apps/scriptable/scratch-off && npx vite build >> /home/ubuntu/apps/scriptable/scratch-off/check.log 2>&1
echo "DONE" >> /home/ubuntu/apps/scriptable/scratch-off/check.log
