#!/usr/bin/env bash
# Run one IsGovOnline probe cycle (write to D1) with an overlap lock.
# Used by launchd (com.govstatus.nepal-probe) every 5 minutes.
#
# The lock dir prevents overlapping runs: a cycle can take several minutes
# (145 services, up to 45s timeouts) and the scheduler fires every 5m; if the
# previous run is still going, this exits immediately instead of double-writing.
set -euo pipefail

REPO="/Users/leanqdigital/Desktop/projects/personal/govstatus"
LOCK="${TMPDIR:-/tmp}/govstatus-probe.lock"

# Atomic lock via mkdir (flock isn't on this macOS).
if ! mkdir "$LOCK" 2>/dev/null; then
  exit 0
fi
cleanup() { rmdir "$LOCK" 2>/dev/null || true; }
trap cleanup EXIT INT TERM

cd "$REPO"
if [ -f .env.local ]; then
  set -a
  # shellcheck disable=SC1091
  source .env.local
  set +a
fi

node probe/nepal-probe.mjs >> probe/probe.log 2>&1