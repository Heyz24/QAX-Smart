# QAX-Smart (`qaxs`)

Offline natural-language → shell-command compiler. Companion project to
[QAX](../qax) (a first-class supported target shell, not routed through
CMD/PowerShell).

```
qaxs "find all pdfs in my downloads"
qaxs "show files larger than 1GB"
qaxs "search all files on the desktop and open architecture.md"
```

## Status

Read `HANDOFF.md` first — it's explicit about what's genuinely
implemented-and-tested versus scaffolded-but-unverified in this build.
Short version: the full validation/security/extraction pipeline and the
session daemon's lifecycle are real and tested; actual generation quality
from the model has not been run yet in this environment because
downloading the GGUF requires your own machine (see `models/README.md`).

## Layout

| Path | What |
|---|---|
| `SPEC.md` | Original product specification (verbatim) |
| `HANDOFF.md` | What's built vs. scaffolded, and why key decisions were made |
| `CHANGELOG.md` / `VERSION` | Version history — bump with `scripts/bump-version.sh` |
| `src/core/` | The pipeline: env resolver, prompt builder, normalizer, extractor, semantic validator, security policy, engine |
| `src/shells/` | Shell adapters (QAX, Bash, Zsh, PowerShell, CMD) |
| `src/daemon/` | Session-scoped resident-model daemon |
| `src/inference/` | llama.cpp wrapper + daemon/in-process gateway |
| `src/cli.ts` | `qaxs` / `qaxs help` / `qaxs --version` / `qaxs stop` |
| `training/` | Dataset generator + Colab fine-tuning notebook |
| `models/` | Where you put the GGUF file(s) |
| `installer/` | Per-OS packaging configs (see `installer/README.md` for what's tested vs. not) |
| `tests/` | `daemon-smoke.js` — real process-lifecycle test |

## Quick start (development)

```
npm install
npm run build
npm link                          # installs `qaxs` as a real global command
qaxs --dry-run 'echo hello' "say hello"   # exercises the full pipeline without needing a model
```

Then see `models/README.md` for getting a real model running, and
`training/` for the QAX-specific fine-tune.

## Reliability layer

Four independent techniques improve real-world success rate beyond the
base model's raw output — see `HANDOFF.md`'s "The reliability layer"
section for what each targets and how it's verified:
grammar-constrained decoding, few-shot prompting, a retry/self-repair
ladder, and local path-sanity warnings.

## Design commitments this build holds to

- **The model never executes anything directly.** Every command passes
  through extraction → shell validation → semantic validation → security
  policy → explicit user confirmation before `adapter.execute()` is ever
  called.
- **Nothing is shown to the user by default except the final command** —
  no prompt, no environment dump, no inference stats. `--debug` exists
  for development, not for normal use.
- **Nothing outlives the shell session.** The daemon that keeps the model
  resident watches its parent shell's process and unloads the model +
  deletes its socket the moment that shell exits, and `qaxs stop`/
  `qaxs exit` does the same on demand.
- **No conversation memory.** Every generation call is stateless, even
  though the model weights stay loaded across calls for speed.
