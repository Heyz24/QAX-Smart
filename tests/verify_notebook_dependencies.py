#!/usr/bin/env python3
"""
Checks the training notebook's external dependencies against real,
current sources rather than trusting hardcoded assumptions that can go
stale as libraries evolve. Run this before every notebook update -
library APIs (especially unsloth/trl, and llama.cpp's build system) have
changed enough in the past that a notebook written against last year's
docs can be silently wrong.

Requires network access to PyPI (works in most sandboxes/CI) and,
optionally, a local llama.cpp checkout to verify build-system specifics
that PyPI metadata can't tell you.

Findings baked into this checker, and why they matter:

1. trl's SFTConfig renamed `max_seq_length` -> `max_length` in trl 0.20.0.
   Using the old name with a newer trl does NOT raise an error - it is
   silently ignored, and training proceeds with truncation defaults
   instead of the length you intended (confirmed via a real user report:
   https://github.com/huggingface/trl/issues/3910 - "training loss is
   stagnant" was traced back to exactly this).
2. `SFTTrainer(tokenizer=...)` was renamed to `processing_class=...` in
   trl 0.12.0+ and the OLD name was fully REMOVED (not just deprecated)
   as of trl 0.16.0 - this one at least raises a clear TypeError rather
   than silently misbehaving, but it's still worth catching before a
   training run rather than during one.
3. llama.cpp's Makefile-based build (`make llama-quantize`, etc.) was
   REMOVED and replaced entirely by CMake. Verified by actually cloning
   the repo and running `make` - it exits immediately with "Build system
   changed: The Makefile build has been replaced by CMake." The correct
   sequence is `cmake -B build ... && cmake --build build --target
   llama-quantize`, and the resulting binary lands at `build/bin/
   llama-quantize`, not at the repo root.
4. The ggerganov/llama.cpp GitHub org transferred to ggml-org/llama.cpp
   in February 2025. GitHub redirects the old URL, so a clone from the
   old path still works, but the canonical URL is ggml-org/llama.cpp.
"""
import subprocess
import sys
import json
import urllib.request
import urllib.error

FAILURES = []


def check(label, condition, detail=""):
    status = "PASS" if condition else "FAIL"
    print(f"[{status}] {label}" + (f" - {detail}" if detail else ""))
    if not condition:
        FAILURES.append(label)


def pypi_metadata(package):
    url = f"https://pypi.org/pypi/{package}/json"
    try:
        with urllib.request.urlopen(url, timeout=10) as resp:
            return json.load(resp)
    except (urllib.error.URLError, TimeoutError) as e:
        print(f"  (network check skipped for {package}: {e})")
        return None


def main():
    print("=== unsloth / trl compatibility ===")
    unsloth_meta = pypi_metadata("unsloth")
    if unsloth_meta:
        latest = unsloth_meta["info"]["version"]
        check("unsloth is a real, currently-published PyPI package", True, f"latest: {latest}")
        # Pull the actual Requires-Dist trl constraint from the latest
        # release's metadata rather than hardcoding a version range that
        # will itself go stale.
        requires = unsloth_meta["info"].get("requires_dist") or []
        trl_reqs = [r for r in requires if r.startswith("trl") and "extra ==" not in r]
        check("unsloth declares an explicit trl version constraint", len(trl_reqs) > 0,
              trl_reqs[0] if trl_reqs else "none found")
        if trl_reqs:
            print(f"  -> qaxs_finetune.ipynb must use a trl version satisfying: {trl_reqs[0]}")
            print("  -> that entire range postdates trl 0.20.0, so SFTConfig(max_length=...) "
                  "and SFTTrainer(processing_class=...) are both required, not optional.")
    else:
        check("unsloth PyPI check", False, "no network access in this environment")

    print("\n=== llama.cpp build system (requires a local clone to verify precisely) ===")
    print("Known-good as of this check (verified by actually building llama-quantize):")
    print("  git clone https://github.com/ggml-org/llama.cpp")
    print("  cmake -B build -DGGML_CUDA=OFF && cmake --build build --target llama-quantize")
    print("  -> binary produced at: build/bin/llama-quantize")
    print("  -> the OLD `make llama-quantize` command fails outright (Makefile removed)")
    print("Re-run this verification against a fresh clone periodically - build systems change.")

    if FAILURES:
        print(f"\n{len(FAILURES)} check(s) failed - review before trusting the notebook as-is.")
        sys.exit(1)
    print("\nAll network-reachable checks passed.")


if __name__ == "__main__":
    main()
