#!/bin/sh
set -u

# Run the deterministic workspace worker without involving an agent or LLM.
# Each invocation claims a bounded batch; running serially prevents overlap.
export HOME=/opt/data
export PATH="/opt/data/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

while :; do
  hermes insight-workspace run-once || true
  sleep 60
done
