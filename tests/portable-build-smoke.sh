#!/usr/bin/env bash
# tests/portable-build-smoke.sh
#
# Builds the actual portable distribution (scripts/build-portable.sh) and
# rigorously verifies it needs NO system Node.js install - not just a
# PATH trick, but with the system node binary actually moved out of the
# way during the test. This is a heavier integration test than the fast
# tests/unit/*.test.js suite (it does a real npm install and produces a
# multi-hundred-MB artifact), so it's kept separate and run on demand
# rather than as part of every regression pass.
#
# Requires: sudo/root (to move the system node binary), or run this in a
# container/VM you don't mind briefly losing `node` on PATH in.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="$ROOT_DIR/dist-portable-test"
SYSTEM_NODE="$(command -v node)"
HIDDEN_NODE="${SYSTEM_NODE}.hidden-for-test"

cleanup() {
  if [ -f "$HIDDEN_NODE" ]; then
    mv "$HIDDEN_NODE" "$SYSTEM_NODE"
    echo "(restored system node)"
  fi
}
trap cleanup EXIT

echo "=== building portable distribution ==="
"$ROOT_DIR/scripts/build-portable.sh" "$OUT_DIR"

echo "=== placing a placeholder model file (real inference isn't the point of this test) ==="
touch "$OUT_DIR/models/qwen2.5-coder-0.5b-q8_0.gguf"

echo "=== moving the system node binary out of the way ==="
mv "$SYSTEM_NODE" "$HIDDEN_NODE"

FAILURES=0

echo "--- qaxs --version with system node absent ---"
if OUTPUT=$("$OUT_DIR/qaxs" --version 2>&1); then
  echo "PASS: $OUTPUT"
else
  echo "FAIL: $OUTPUT"
  FAILURES=$((FAILURES + 1))
fi

echo "--- dry-run pipeline with system node absent ---"
if OUTPUT=$(echo n | "$OUT_DIR/qaxs" --dry-run 'echo hello' "say hello" 2>&1); then
  if echo "$OUTPUT" | grep -q "echo hello"; then
    echo "PASS"
  else
    echo "FAIL: unexpected output: $OUTPUT"
    FAILURES=$((FAILURES + 1))
  fi
fi

echo "--- real native module load with system node absent (expect a GGUF-parse error, proving the native binary itself loaded and ran) ---"
OUTPUT=$("$OUT_DIR/qaxs" --debug "find all pdfs" 2>&1 || true)
if echo "$OUTPUT" | grep -q "Invalid GGUF magic"; then
  echo "PASS: native inference binary loaded and attempted real parsing"
elif echo "$OUTPUT" | grep -q "cmake-js-llama"; then
  echo "FAIL: node-llama-cpp fell back to a from-source build - optional deps were likely stripped (check build-portable.sh doesn't use --omit=optional)"
  FAILURES=$((FAILURES + 1))
else
  echo "FAIL: unexpected output: $OUTPUT"
  FAILURES=$((FAILURES + 1))
fi

echo "--- REGRESSION: launcher must work when invoked through a symlink (this is exactly how the .deb package installs it: /usr/local/bin/qaxs -> /usr/local/lib/qaxs/qaxs) ---"
SYMLINK_TEST_DIR="$(mktemp -d)"
ln -s "$OUT_DIR/qaxs" "$SYMLINK_TEST_DIR/qaxs"
if OUTPUT=$("$SYMLINK_TEST_DIR/qaxs" --version 2>&1); then
  echo "PASS: $OUTPUT"
else
  echo "FAIL (this is the exact bug found via a real .deb install test): $OUTPUT"
  FAILURES=$((FAILURES + 1))
fi
rm -rf "$SYMLINK_TEST_DIR"

echo ""
if [ "$FAILURES" -gt 0 ]; then
  echo "$FAILURES CHECK(S) FAILED"
  exit 1
fi
echo "ALL PORTABLE-BUILD CHECKS PASSED (with system Node.js genuinely absent throughout)"
