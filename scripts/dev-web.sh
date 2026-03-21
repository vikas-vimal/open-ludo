#!/usr/bin/env bash
set -euo pipefail
COREPACK_HOME=/tmp/corepack pnpm --filter @open-ludo/web dev
