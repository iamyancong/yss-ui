#!/bin/sh
exec "$(dirname "$0")/./release/ci-release.sh" "$@"
