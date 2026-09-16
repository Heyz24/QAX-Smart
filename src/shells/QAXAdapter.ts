import { BaseShellAdapter } from "./ShellAdapter";
import { ExecutionResult, ShellName, ValidationResult } from "../core/types";

/**
 * QAX v3.0.0 syntax reference (see QAX User Manual):
 *   - POSIX-style expansion: $VAR, ${VAR}, %VAR% (Windows-style also works)
 *   - Command substitution: $(cmd) or `cmd`
 *   - Arithmetic: $((expr))
 *   - Conditionals: test EXPR / [ EXPR ]  -- NOT [[ ... ]] or (( ... ))
 *   - Control flow: if/elif/else/fi, while/until/done, for NAME in W...; do L done
 *   - Functions: name() { ... }  -- NOT bash's "function name { ... }" form
 *   - Built-ins: ls/dir, cat/type, cp/copy, mv/move/ren, rm/del, mkdir/md,
 *     rmdir/rd, touch, pwd, cd, echo, read, alias, history, which, source/.,
 *     jobs/fg/bg, edit/nano
 *   - Redirection: > >> < 2> 2>> 2>&1 &> &>>
 *   - Chaining: ; && || &
 *   - Globs: * ? [abc] [a-z] [!abc]/[^abc] {a,b,c} (brace ranges NOT supported)
 *
 * QAX does not support: [[ ... ]], (( ... )) as a standalone command,
 * bash's "function name {}" spelling, brace ranges ({1..5}), nested braces,
 * or case/esac.
 */

const UNSUPPORTED_SYNTAX: { pattern: RegExp; reason: string }[] = [
  { pattern: /\[\[.*\]\]/, reason: "QAX does not support [[ ... ]] extended test syntax; use test/[ ]" },
  { pattern: /^\s*\(\(.*\)\)\s*$/, reason: "QAX does not support (( ... )) as a standalone arithmetic command; use $((expr)) inside another command" },
  { pattern: /\bfunction\s+\w+\s*\{/, reason: "QAX only supports the name() { ... } function form, not bash's 'function name { }' spelling" },
  { pattern: /\{\d+\.\.\d+\}/, reason: "QAX does not support brace ranges like {1..5}" },
  { pattern: /\bcase\b.*\bin\b/, reason: "QAX does not support case/esac; use if/elif chains" },
];

const QAX_BUILTINS = new Set([
  "ls", "dir", "cd", "pwd", "cat", "type", "mkdir", "md", "rmdir", "rd", "rm", "del",
  "cp", "copy", "mv", "move", "ren", "touch", "echo", "true", "false", "sleep",
  "printf", "read", "set", "export", "unset", "env", "path", "whoami", "hostname",
  "date", "time", "alias", "unalias", "history", "clear", "cls", "which", "source",
  ".", "title", "open", "start", "edit", "nano", "version", "help", "test", "return",
  "break", "continue", "exit", "quit", "jobs", "fg", "bg", "if", "while", "until",
  "for",
  // `[ EXPR ]` is the documented shorthand for `test EXPR` (manual section
  // 10.1) - found missing from this set via regression testing, which
  // caused every `[ ... ]` conditional (a heavily-used, documented form)
  // to be wrongly rejected as "not a valid QAX command".
  "[",
]);

// Matches a QAX/bash-style function definition: name() { ... } or the
// compact no-space form name(){...}. QAX documents ONLY this spelling
// (never bash's alternate "function name { ... }"). The first "word" of
// a line like `greet() { echo "hi $1"; }` is the token `greet()`, which
// looks like neither a builtin nor a plain program name under the normal
// first-word check below - found via regression testing to cause every
// function definition to be wrongly rejected. Detect this shape up front
// and skip the first-word check for it.
const FUNCTION_DEFINITION = /^[A-Za-z_][A-Za-z0-9_]*\(\)\s*\{/;

export class QAXAdapter extends BaseShellAdapter {
  getName(): ShellName {
    return "QAX";
  }

  detect(): boolean {
    return Boolean(process.env.QAX_VERSION || process.env.QAX_SHELL_PID);
  }

  validateCommand(command: string): ValidationResult {
    for (const rule of UNSUPPORTED_SYNTAX) {
      if (rule.pattern.test(command)) {
        return { valid: false, reason: rule.reason };
      }
    }

    if (FUNCTION_DEFINITION.test(command.trim())) {
      return { valid: true };
    }

    // Loose sanity check: the first word should be a known built-in or a
    // plausible external-program name (letters/digits/./_-, optionally with
    // a path). We don't maintain a full PATH-resolution simulation here —
    // that's QAX's own job at execution time — this just catches obvious
    // non-command garbage (e.g. leftover prose) that slipped through
    // extraction.
    const firstWord = command.trim().split(/\s+/)[0] ?? "";
    const bareName = firstWord.replace(/^\.[\\/]/, "");
    const looksLikeProgramName = /^[\w./\\-]+$/.test(bareName);
    if (!QAX_BUILTINS.has(bareName) && !looksLikeProgramName) {
      return { valid: false, reason: `'${firstWord}' does not look like a valid QAX command or program name` };
    }

    return { valid: true };
  }

  async execute(command: string): Promise<ExecutionResult> {
    // QAX supports `qax -c "command"` for non-interactive single-command
    // execution (see manual section 4.1 / 12).
    return this.runViaBinary("qax", ["-c", command]);
  }
}
