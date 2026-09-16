#!/usr/bin/env python3
"""
Regression check: the QAX shell adapter (src/shells/QAXAdapter.ts) and the
training dataset generator (training/generate_dataset.py) each encode the
same "what QAX syntax is actually valid" knowledge independently, in two
different languages. Nothing stops them from drifting apart as either
file gets edited - this script is that guardrail.

It re-derives the same UNSUPPORTED_SYNTAX patterns from QAXAdapter.ts's
source (kept in sync by hand below - see the note in HANDOFF.md) and
checks every generated QAX training command against them. If this ever
fails, either:
  (a) generate_dataset.py's QAX_TEMPLATES produced something QAX doesn't
      actually support - fix the template, or
  (b) QAXAdapter.ts gained a new restriction that the dataset needs to
      respect - update generate_dataset.py.

Run: python3 tests/check_qax_syntax_consistency.py
"""
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# Mirrors QAXAdapter.ts's UNSUPPORTED_SYNTAX list. Keep these two in sync
# by hand - see HANDOFF.md "QAXAdapter syntax rules - where they came from".
UNSUPPORTED_PATTERNS = [
    (re.compile(r"\[\[.*\]\]"), "[[ ]] extended test syntax"),
    (re.compile(r"^\s*\(\(.*\)\)\s*$"), "(( )) as a standalone command"),
    (re.compile(r"\bfunction\s+\w+\s*\{"), "bash's 'function name {}' spelling"),
    (re.compile(r"\{\d+\.\.\d+\}"), "brace ranges like {1..5}"),
    (re.compile(r"\bcase\b.*\bin\b"), "case/esac"),
]


def regenerate_dataset():
    subprocess.run(
        [sys.executable, str(ROOT / "training" / "generate_dataset.py"),
         "--out", str(ROOT / "training" / "qaxs_dataset.jsonl"), "--per-template", "6"],
        check=True, cwd=ROOT / "training",
    )


def load_qax_commands():
    commands = []
    for filename in ["qaxs_dataset.jsonl", "qaxs_dataset.eval.jsonl"]:
        path = ROOT / "training" / filename
        if not path.exists():
            continue
        with open(path) as f:
            for line in f:
                if not line.strip():
                    continue
                row = json.loads(line)
                if row["shell"] == "qax":
                    commands.append(row["command"])
    return commands


def main():
    regenerate_dataset()
    commands = load_qax_commands()
    if not commands:
        print("FAIL: no QAX commands found in the generated dataset - generator may be broken")
        sys.exit(1)

    failures = []
    for command in commands:
        for pattern, description in UNSUPPORTED_PATTERNS:
            if pattern.search(command):
                failures.append((command, description))

    print(f"Checked {len(commands)} QAX training commands against {len(UNSUPPORTED_PATTERNS)} unsupported-syntax rules.")
    if failures:
        print(f"\nFAIL: {len(failures)} training example(s) use syntax QAXAdapter.ts rejects:")
        for command, description in failures:
            print(f"  {command!r}  ->  uses {description}")
        sys.exit(1)

    print("PASS: every QAX training example uses only documented, supported QAX syntax.")


if __name__ == "__main__":
    main()
