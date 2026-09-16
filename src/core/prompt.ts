import { EnvironmentContext } from "./types";

/**
 * The ONE fixed system prompt. Only the runtime variables and the user's
 * request ever change. Never shown to the user (except in --debug mode).
 */
const BASE_PROMPT = `You are QAX-Smart's command generation engine.

Your ONLY task is to convert the user's natural-language request into exactly ONE executable command for the specified shell.

OUTPUT ONLY THE COMMAND.

DO NOT:
- explain anything
- greet the user
- use Markdown
- use code fences
- provide labels
- provide multiple commands
- provide alternatives
- describe the command
- output conversational text

Use the supplied environment information.
Use the correct syntax for TARGET_SHELL.
Do not invent filesystem paths when a supplied path is available.

TARGET SHELL: {shell}
OPERATING SYSTEM: {os}
CURRENT DIRECTORY: {cwd}
HOME: {home}
DOWNLOADS: {downloads}
DOCUMENTS: {documents}
DESKTOP: {desktop}

USER REQUEST:
{request}`;

export function buildPrompt(env: EnvironmentContext, request: string): string {
  return BASE_PROMPT.replace("{shell}", shellPromptName(env.shell))
    .replace("{os}", env.os)
    .replace("{cwd}", env.cwd)
    .replace("{home}", env.home)
    .replace("{downloads}", env.downloads)
    .replace("{documents}", env.documents)
    .replace("{desktop}", env.desktop)
    .replace("{request}", request);
}

/**
 * For QAX we spell out the syntax the model must target, since Qwen has
 * never seen QAX in pretraining. This gets folded into the prompt only
 * when TARGET_SHELL=QAX. Kept SHORT and paired with concrete examples
 * rather than a long bullet list — found via real testing that a longer,
 * purely descriptive version of this block was itself what the
 * un-fine-tuned base model echoed back verbatim instead of generating a
 * command (see src/core/prompt-echo.ts). In-context examples are
 * well-established in the literature as more reliable than abstract
 * rule descriptions for small models following an unfamiliar format —
 * this isn't a training run, just better-evidenced prompting.
 *
 * The examples deliberately avoid path-specific requests (no
 * "find pdfs in downloads" style example) so the model isn't tempted to
 * copy an example's incidental path instead of the real DOWNLOADS/HOME/
 * etc. values already provided in the ENV block above. They demonstrate
 * FORMAT (bare command, no fences, no prose) and QAX-SPECIFIC SYNTAX
 * (test brackets, builtins, compound flags) instead.
 */
export const QAX_SYNTAX_HINT = `
QAX SHELL: use $VAR, $(cmd), $((expr)) for expansion/substitution/arithmetic; test/[ ] for conditions; if/while/for for control flow; built-ins like ls, cat, cp, mv, rm, mkdir, touch, cd, pwd.

EXAMPLES (format only - use the real environment values above for any actual paths):
Request: check if notes.txt exists
Command: [ -f notes.txt ]

Request: create a folder called build
Command: mkdir -p build

Request: list files sorted by size
Command: ls -lhS
`;

export function buildQaxPrompt(env: EnvironmentContext, request: string): string {
  const base = buildPrompt(env, request);
  return base.replace(
    "USER REQUEST:",
    `${QAX_SYNTAX_HINT}\nUSER REQUEST:`
  );
}

function shellPromptName(shell: EnvironmentContext["shell"]): string {
  return shell;
}
