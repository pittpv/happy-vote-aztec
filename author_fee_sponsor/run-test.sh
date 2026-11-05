#!/usr/bin/env bash
# Nargo selects the outermost Nargo.toml. This package sits inside happy_vote_aztec,
# so the parent manifest is held aside for the duration of `aztec test`.
set -euo pipefail
root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
manifest="$root/Nargo.toml"
held="$root/Nargo.toml.hold"
if [[ -e "$held" ]]; then
  echo "Refusing to move $manifest: $held already exists" >&2
  exit 1
fi
mv "$manifest" "$held"
cleanup() {
  mv "$held" "$manifest"
}
trap cleanup EXIT
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
aztec test "$@"
