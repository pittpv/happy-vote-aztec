#!/usr/bin/env bash
# TXE loads a dependency artifact by file name from this package.
# Beside the aztec package, HappyVote is ../aztec.
# Nested inside that package, this script materializes ../aztec from the parent
# and holds the parent manifest aside so Nargo selects this package.
set -euo pipefail
root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

link_artifact() {
  local artifact="$1"
  if [[ ! -f "$artifact" ]]; then
    echo "Missing $artifact. Compile HappyVote first." >&2
    exit 1
  fi
  ln -sfn "$artifact" "$root/happy_vote_aztec-HappyVote.json"
  mkdir -p "$root/target"
  ln -sfn "$artifact" "$root/target/happy_vote_aztec-HappyVote.json"
}

if [[ -f "$root/../aztec/Nargo.toml" && ! -f "$root/../Nargo.toml" ]]; then
  link_artifact "$root/../aztec/target/happy_vote_aztec-HappyVote.json"
  cd "$root"
  aztec test "$@"
  exit 0
fi

parent="$(cd "$root/.." && pwd)"
manifest="$parent/Nargo.toml"
held="$parent/Nargo.toml.hold"
stage="$parent/aztec"
if [[ ! -f "$manifest" ]]; then
  echo "HappyVote Nargo.toml not found beside or above $root" >&2
  exit 1
fi
if [[ -e "$held" || -e "$stage" ]]; then
  echo "Refusing to stage HappyVote: $held or $stage already exists" >&2
  exit 1
fi
mkdir -p "$stage"
cp "$manifest" "$stage/Nargo.toml"
ln -s "$parent/src" "$stage/src"
if [[ -d "$parent/target" ]]; then
  ln -s "$parent/target" "$stage/target"
fi
mv "$manifest" "$held"
cleanup() {
  mv "$held" "$manifest"
  rm -rf "$stage"
}
trap cleanup EXIT
link_artifact "$stage/target/happy_vote_aztec-HappyVote.json"
cd "$root"
aztec test "$@"
