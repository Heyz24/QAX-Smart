#!/usr/bin/env python3
"""
Tests the parts of training/qaxs_finetune.ipynb that don't require a GPU
or a downloaded model: the prompt-concatenation logic (cell "Format into
the exact prompt qaxs uses at inference time") and the eval-time semantic
rules (cell "Evaluate: base vs. fine-tuned"). These are extracted LIVE
from the current notebook file on every run - never from a saved copy -
so this test can't silently go stale relative to notebook edits.

What this test does NOT and cannot cover: actual model loading, actual
LoRA training, actual generation quality. Those require a GPU and a
downloaded model and have to be verified by actually running the
notebook in Colab (see training/qaxs_finetune.ipynb's own eval cell,
section 6, which prints the real pass rate against the held-out set).
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
NOTEBOOK = ROOT / "training" / "qaxs_finetune.ipynb"
DATASET = ROOT / "training" / "qaxs_dataset.jsonl"

FAILURES = []


def check(label, condition, detail=""):
    status = "PASS" if condition else "FAIL"
    print(f"[{status}] {label}" + (f" - {detail}" if detail else ""))
    if not condition:
        FAILURES.append(label)


def get_cell_source(nb, needle):
    """Finds the first code cell whose source contains `needle` and
    returns its full source text. Locating by content rather than a
    hardcoded index means this test survives cells being reordered or
    inserted, as long as the identifying text stays put."""
    for cell in nb["cells"]:
        if cell["cell_type"] != "code":
            continue
        src = "".join(cell["source"])
        if needle in src:
            return src
    raise ValueError(f"no code cell found containing {needle!r}")


def main():
    with open(NOTEBOOK) as f:
        nb = json.load(f)

    # --- extract build_prompt() live ---
    prompt_cell_src = get_cell_source(nb, "def build_prompt")
    # extract only through the build_prompt() definition - the rest of
    # this cell in the notebook loads dataset files from Colab's cwd,
    # which isn't relevant to testing build_prompt() itself.
    prompt_cell_src = prompt_cell_src.split("def load_jsonl")[0]
    namespace = {}
    exec(compile(prompt_cell_src, "<prompt_cell>", "exec"), namespace)
    build_prompt = namespace["build_prompt"]

    # --- extract SEMANTIC_RULES / semantic_pass live, stopping before the
    # GPU-dependent generate() function that follows it in the same cell ---
    eval_cell_src = get_cell_source(nb, "SEMANTIC_RULES")
    deterministic_part = eval_cell_src.split("def generate(")[0]
    namespace2 = {}
    exec(compile(deterministic_part, "<eval_cell>", "exec"), namespace2)
    semantic_pass = namespace2["semantic_pass"]

    print("=== build_prompt() concatenation checks (against real dataset rows) ===")
    if not DATASET.exists():
        print("  dataset not found - run generate_dataset.py first")
        sys.exit(1)
    with open(DATASET) as f:
        rows = [json.loads(line) for line in f if line.strip()]

    qax_row = next(r for r in rows if r["shell"] == "qax")
    other_row = next(r for r in rows if r["shell"] != "qax")

    for label, row in [("QAX row", qax_row), ("non-QAX row", other_row)]:
        prompt = build_prompt(row)
        check(f"{label}: request text is present in the built prompt",
              row["request"] in prompt)
        check(f"{label}: correct shell is injected",
              f"TARGET SHELL: {row['shell']}" in prompt)
        if row["shell"] == "qax":
            check("QAX row: syntax hint block is included",
                  "QAX SHELL:" in prompt)
        else:
            check(f"{label}: QAX hint does NOT leak into non-QAX prompts",
                  "QAX SHELL:" not in prompt)

    print("\n=== QAX_SYNTAX_HINT parity between src/core/prompt.ts and the notebook ===")
    ts_prompt_file = ROOT / "src" / "core" / "prompt.ts"
    ts_source = ts_prompt_file.read_text()
    ts_start = ts_source.index("export const QAX_SYNTAX_HINT = `") + len("export const QAX_SYNTAX_HINT = `")
    ts_end = ts_source.index("`;", ts_start)
    ts_hint = ts_source[ts_start:ts_end].strip()

    nb_hint_cell = get_cell_source(nb, "QAX_SYNTAX_HINT = ")
    nb_start = nb_hint_cell.index('QAX_SYNTAX_HINT = """') + len('QAX_SYNTAX_HINT = """')
    nb_end = nb_hint_cell.index('"""', nb_start)
    nb_hint = nb_hint_cell[nb_start:nb_end].strip()

    check("TS and notebook QAX_SYNTAX_HINT text match exactly",
          ts_hint == nb_hint,
          "these are maintained as two independent copies - see prompt.ts's doc comment")

    print("\n=== semantic_pass() parity with tests/unit/semantic-validator.test.js ===")
    # Mirrors that TS test file's cases exactly - if these ever diverge,
    # the notebook's eval numbers stop meaning what qaxs actually enforces.
    cases = [
        ("find all pdfs in downloads", "dir Downloads", False),
        ("find all pdfs in downloads", 'find Downloads -name "*.pdf"', True),
        ("find the process using port 8080", "echo hello", False),
        ("show all running processes", "ps aux", True),
        ("delete the build folder", "ls build", False),
        ("show current directory", "pwd", True),  # the regex-precedence regression case
        ("create a folder called projects", "mkdir projects", True),
        ("create a folder called projects", "ls projects", False),
    ]
    for request, command, expected in cases:
        actual = semantic_pass(request, command)
        check(f"semantic_pass({request!r}, {command!r}) == {expected}", actual == expected,
              f"got {actual}")

    if FAILURES:
        print(f"\n{len(FAILURES)} FAILURE(S):")
        for f in FAILURES:
            print(" -", f)
        sys.exit(1)
    print(f"\nAll checks passed against the LIVE notebook content at {NOTEBOOK}.")


if __name__ == "__main__":
    main()
