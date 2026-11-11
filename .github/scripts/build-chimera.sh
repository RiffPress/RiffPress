#!/usr/bin/env bash
#
# Rebuilds Riff Chimera's copy of CHIMERA (plugins/riff-chimera/assets/chimera/) from its source,
# at the commit pinned below: the engine compiled to WebAssembly, the AudioWorklet processor bundled
# to one file, the main thread's side of the engine with CHIMERA's cutaway head as another, and the
# pronouncing dictionary and licences as CHIMERA ships them.
#
# CHIMERA is Jameson Hodge's physical-modeling voice synthesizer, MIT licensed:
# https://github.com/jamesondh/chimera-vocal-synth. Riff Chimera runs this build unchanged.
#
# Needs git, rustup (the toolchain below is installed through it if missing) and bun. The same commit
# and toolchain give the same bytes; the sha256 of each file is printed to compare with what is
# committed (assets/chimera/SOURCE.txt).
#
# Usage: bash .github/scripts/build-chimera.sh
set -euo pipefail

COMMIT=1d3ea496cad0fbe3e73361515aec187e868fbd47
RUST=1.99.1
REPO=https://github.com/jamesondh/chimera-vocal-synth.git

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
out="$root/plugins/riff-chimera/assets/chimera"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

for tool in git rustup bun shasum; do
	command -v "$tool" > /dev/null || { echo "build-chimera.sh: $tool is needed" >&2; exit 1; }
done

git clone --quiet "$REPO" "$work/src"
git -C "$work/src" -c advice.detachedHead=false checkout --quiet "$COMMIT"

rustup toolchain install "$RUST" --profile minimal --target wasm32-unknown-unknown > /dev/null
(
	cd "$work/src"
	cargo "+$RUST" build --quiet --locked -p chimera-wasm --release --target wasm32-unknown-unknown
	bun build src/worklet/processor.ts --target browser --minify --outfile "$work/processor.js" > /dev/null
	# The main thread's engine and CHIMERA's head, behind Riff Chimera's two calls (chimera/entry.ts).
	mkdir -p riff
	cp "$root/.github/scripts/chimera/entry.ts" riff/entry.ts
	# The engine is always given its address, so Vite's own way to it (a ?url import) is left out.
	bun build riff/entry.ts --target browser --format esm --minify --external '*?url' --outfile "$work/chimera.js" > /dev/null
)

mkdir -p "$out"
cp "$work/src/target/wasm32-unknown-unknown/release/chimera_wasm.wasm" "$out/chimera.wasm"
{
	echo "/* CHIMERA's AudioWorklet processor, src/worklet/processor.ts at $COMMIT, bundled by bun $(bun --version). MIT, (c) 2026 Jameson Hodge: see LICENSE.txt beside it. Rebuilt by .github/scripts/build-chimera.sh; not edited by hand. */"
	cat "$work/processor.js"
} > "$out/processor.js"
{
	echo "/* CHIMERA's engine facade and anatomy renderer (src/wasm, src/ui/render at $COMMIT) behind .github/scripts/chimera/entry.ts, bundled by bun $(bun --version). MIT, (c) 2026 Jameson Hodge: see LICENSE.txt beside it. Rebuilt by .github/scripts/build-chimera.sh; not edited by hand. */"
	cat "$work/chimera.js"
} > "$out/chimera.js"
cp "$work/src/public/data/cmudict.txt.gz" "$out/cmudict.txt.gz"
cp "$work/src/public/data/CMUDICT-LICENSE.txt" "$out/CMUDICT-LICENSE.txt"
cp "$work/src/LICENSE" "$out/LICENSE.txt"

{
	echo "CHIMERA, https://github.com/jamesondh/chimera-vocal-synth"
	echo "Commit: $COMMIT"
	echo "Built with: rustc $RUST (wasm32-unknown-unknown, release), bun $(bun --version)"
	echo "Rebuild: bash .github/scripts/build-chimera.sh"
	echo
	(cd "$out" && shasum -a 256 chimera.wasm chimera.js processor.js cmudict.txt.gz)
} > "$out/SOURCE.txt"
cat "$out/SOURCE.txt"
