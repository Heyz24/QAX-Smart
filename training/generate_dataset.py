#!/usr/bin/env python3
"""
QAX-Smart (qaxs) fine-tuning dataset generator.

Produces JSONL records of the form:
    {"shell": "qax", "os": "linux", "request": "...", "command": "..."}

Design notes:
  - QAX gets by far the most templates and the most examples, since the
    base Qwen2.5-Coder-0.5B has never seen QAX syntax in pretraining.
    Bash/Zsh/PowerShell/CMD get lighter coverage — the base model already
    has real competence there; these examples mainly teach output FORMAT
    (one bare command, no fences, no prose) and this app's placeholder
    convention.
  - Every QAX command here uses ONLY syntax verified against the QAX
    v3.0.0 user manual (test/[ ], for/while/until, $(...) / `...`,
    $((...)), the documented built-ins, and the documented redirection/
    chaining operators). It deliberately never uses [[ ]], (( )) as a
    standalone command, case/esac, or brace ranges — QAX doesn't support
    them (see manual "Feature scope").
  - Paths are template placeholders ({HOME}, {DOWNLOADS}, {DOCUMENTS},
    {DESKTOP}, {CWD}) per spec section 20, substituted at runtime by
    qaxs's prompt builder, never baked in as real user paths.

Run:
    python3 generate_dataset.py --out qaxs_dataset.jsonl --per-template 6
"""
import argparse
import json
import random
import itertools

random.seed(7)

PLACEHOLDERS = ["{HOME}", "{DOWNLOADS}", "{DOCUMENTS}", "{DESKTOP}", "{CWD}"]
PLACEHOLDER_WORDS = {
    "{HOME}": ["home folder", "home directory"],
    "{DOWNLOADS}": ["downloads", "downloads folder", "my downloads"],
    "{DOCUMENTS}": ["documents", "my documents", "documents folder"],
    "{DESKTOP}": ["desktop", "my desktop"],
    "{CWD}": ["this folder", "the current directory", "here"],
}

EXTENSIONS = [
    ("pdf", "PDFs", "pdf files"),
    ("txt", "text files", "txt files"),
    ("jpg", "jpgs", "jpg images"),
    ("png", "pngs", "png images"),
    ("zip", "zip archives", "zip files"),
    ("mp4", "videos", "mp4 files"),
    ("md", "markdown files", "md files"),
    ("json", "json files", "json files"),
]

FILENAMES = ["architecture.md", "README.md", "notes.txt", "config.json", "report.pdf", "todo.md"]


# ---------------------------------------------------------------------------
# QAX templates. Each entry: (request_template, command_template, needs_ext)
# Commands use ONLY documented QAX v3.0.0 syntax.
# ---------------------------------------------------------------------------
QAX_TEMPLATES = [
    # file search by extension
    ("find all {ext_plural} in {place_word}",
     'find {placeholder} -type f -name "*.{ext}"', True),
    ("search {place_word} for {ext_plural}",
     'find {placeholder} -type f -name "*.{ext}"', True),
    ("list every {ext_plural} in {place_word} recursively",
     'find {placeholder} -type f -name "*.{ext}"', True),

    # find + open a specific file
    ("find {filename} in {place_word} and open it",
     'open $(find {placeholder} -type f -name "{filename}")', False),
    ("search for {filename} and open it",
     'open $(find {placeholder} -type f -name "{filename}")', False),
    ("locate {filename} on the {place_word} and open it",
     'open $(find {placeholder} -type f -name "{filename}")', False),

    # large files
    ("show files larger than 1GB in {place_word}",
     'find {placeholder} -type f -size +1G', False),
    ("find files bigger than 500MB in {place_word}",
     'find {placeholder} -type f -size +500M', False),

    # directory creation
    ("create a folder called projects",
     "mkdir projects", False),
    ("make a new directory named build",
     "mkdir build", False),
    ("create nested folders src/core and src/shells",
     "mkdir -p src/core src/shells", False),

    # deletion
    ("delete all .log files in {place_word}",
     'rm {placeholder}/*.log', False),
    ("remove the build folder",
     "rm -r build", False),
    ("delete notes.txt",
     "rm notes.txt", False),

    # process lookup
    ("find the process using port 8080",
     "lsof -i :8080", False),
    ("check what's using port 3000",
     "lsof -i :3000", False),
    ("show all running node processes",
     'ps | grep "node"', False),

    # env / shell state
    ("show my current directory",
     "pwd", False),
    ("show all environment variables",
     "env", False),
    ("show the exit code of the last command",
     'echo "$?"', False),
    ("show this shell's process id",
     'echo "$$"', False),

    # copy / move / rename
    ("copy README.md into the docs folder",
     "cp README.md docs/README.md", False),
    ("move all {ext_plural} in {place_word} into an archive folder",
     'mkdir -p archive; mv {placeholder}/*.{ext} archive/', True),
    ("rename notes.txt to notes_old.txt",
     "mv notes.txt notes_old.txt", False),

    # control-flow-driven requests
    ("count lines in every log file",
     'for f in *.log; do wc -l "$f"; done', False),
    ("print numbers 0 through 4",
     'i=0; while [ $i -lt 5 ]; do echo $i; i=$((i+1)); done', False),
    ("check if config.json exists and say so",
     'if [ -f config.json ]; then echo "found it"; else echo "missing"; fi', False),
    ("run cmake build only if the build folder does not exist",
     'if [ ! -d build ]; then mkdir build; fi; cd build; cmake .. && cmake --build .', False),

    # git-aware (git runs on PATH exactly like any real shell)
    ("show git status",
     "git status", False),
    ("show the last 5 git commits in one line each",
     "git log -5 --oneline", False),

    # aliasing / history
    ("make gs an alias for git status",
     "alias gs='git status'", False),
    ("show command history",
     "history", False),

    # test-based conditionals
    ("check if the build directory exists",
     "[ -d build ]", False),
    ("check if notes.txt is empty",
     "[ ! -s notes.txt ]", False),
]

BASH_TEMPLATES = [
    ("find all {ext_plural} in {place_word}",
     'find {placeholder} -type f -name "*.{ext}"', True),
    ("show files larger than 1GB in {place_word}",
     'find {placeholder} -type f -size +1G', False),
    ("find the process using port 8080",
     "lsof -i :8080", False),
    ("create a folder called projects",
     "mkdir -p projects", False),
    ("delete the build folder",
     "rm -rf build", False),
    ("list files sorted by size",
     "ls -lhS", False),
    ("compress the src folder into an archive",
     "tar -czf src.tar.gz src", False),
    ("extract archive.tar.gz",
     "tar -xzf archive.tar.gz", False),
]

ZSH_TEMPLATES = BASH_TEMPLATES  # syntax largely identical for these intents

POWERSHELL_TEMPLATES = [
    ("find all {ext_plural} in {place_word}",
     'Get-ChildItem -Path "{placeholder}" -Filter *.{ext} -Recurse', True),
    ("show files larger than 1GB in {place_word}",
     'Get-ChildItem -Path "{placeholder}" -Recurse | Where-Object {{ $_.Length -gt 1GB }}', False),
    ("find the process using port 8080",
     "Get-NetTCPConnection -LocalPort 8080", False),
    ("create a folder called projects",
     "New-Item -ItemType Directory -Path projects", False),
    ("delete the build folder",
     "Remove-Item -Recurse -Force build", False),
    ("show all running node processes",
     "Get-Process node", False),
]

CMD_TEMPLATES = [
    ("find all {ext_plural} in {place_word}",
     'dir /b /s "{placeholder}\\*.{ext}"', True),
    ("create a folder called projects",
     "mkdir projects", False),
    ("delete the build folder",
     "rmdir /s /q build", False),
    ("show all environment variables",
     "set", False),
    ("show current directory",
     "cd", False),
]

SHELL_CONFIG = {
    "qax": {"templates": QAX_TEMPLATES, "os_choices": ["windows", "macos", "linux"]},
    "bash": {"templates": BASH_TEMPLATES, "os_choices": ["macos", "linux"]},
    "zsh": {"templates": ZSH_TEMPLATES, "os_choices": ["macos", "linux"]},
    "powershell": {"templates": POWERSHELL_TEMPLATES, "os_choices": ["windows"]},
    "cmd": {"templates": CMD_TEMPLATES, "os_choices": ["windows"]},
}


def expand(shell: str, per_template: int):
    cfg = SHELL_CONFIG[shell]
    rows = []
    for request_t, command_t, needs_ext in cfg["templates"]:
        combos = EXTENSIONS if needs_ext else [(None, None, None)]
        for ext, ext_plural, _ in combos:
            for _ in range(per_template):
                placeholder = random.choice(PLACEHOLDERS)
                place_word = random.choice(PLACEHOLDER_WORDS[placeholder])
                filename = random.choice(FILENAMES)
                os_choice = random.choice(cfg["os_choices"])

                request = request_t.format(
                    place_word=place_word,
                    ext_plural=ext_plural or "",
                    filename=filename,
                )
                command = command_t.format(
                    placeholder=placeholder,
                    ext=ext or "",
                    filename=filename,
                )
                rows.append({
                    "shell": shell,
                    "os": os_choice,
                    "request": request,
                    "command": command,
                })
    return rows


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default="qaxs_dataset.jsonl")
    parser.add_argument("--per-template", type=int, default=6,
                         help="how many randomized placeholder/os variations per template")
    parser.add_argument("--holdout-fraction", type=float, default=0.1)
    args = parser.parse_args()

    all_rows = []
    for shell in SHELL_CONFIG:
        all_rows.extend(expand(shell, args.per_template))

    random.shuffle(all_rows)

    # de-dupe identical (request, command) pairs that can arise from
    # low-variance templates (e.g. no placeholder substitution)
    seen = set()
    deduped = []
    for row in all_rows:
        key = (row["shell"], row["request"], row["command"])
        if key in seen:
            continue
        seen.add(key)
        deduped.append(row)

    split_idx = int(len(deduped) * (1 - args.holdout_fraction))
    train_rows, eval_rows = deduped[:split_idx], deduped[split_idx:]

    with open(args.out, "w") as f:
        for row in train_rows:
            f.write(json.dumps(row) + "\n")

    eval_path = args.out.replace(".jsonl", ".eval.jsonl")
    with open(eval_path, "w") as f:
        for row in eval_rows:
            f.write(json.dumps(row) + "\n")

    by_shell = {}
    for row in deduped:
        by_shell[row["shell"]] = by_shell.get(row["shell"], 0) + 1

    print(f"Wrote {len(train_rows)} training examples to {args.out}")
    print(f"Wrote {len(eval_rows)} eval examples to {eval_path}")
    print("Breakdown by shell:", by_shell)


if __name__ == "__main__":
    main()
