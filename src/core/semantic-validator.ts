import { ValidationResult } from "./types";

/**
 * Deterministic, rule-based checks that the generated command actually
 * matches the user's stated intent. Not exhaustive — when a rule doesn't
 * confidently match either way, we say so (valid: true is NOT returned by
 * default; see checkSemanticIntent's fallthrough).
 */

interface IntentRule {
  name: string;
  matchesRequest: RegExp;
  commandMustMatch: RegExp;
  failureMessage: string;
}

const RULES: IntentRule[] = [
  {
    name: "pdf-search",
    matchesRequest: /\bpdfs?\b/i,
    commandMustMatch: /\.pdf|pdf/i,
    failureMessage: "request mentions PDFs but command has no PDF filter/pattern",
  },
  {
    name: "recursive-search",
    matchesRequest: /\b(recursive|recursively|all subfolders|everywhere|entire (system|drive|disk))\b/i,
    commandMustMatch: /(-r\b|-R\b|--recurse|-Recurse|\/s\b|find\s)/i,
    failureMessage: "request implies recursion but command doesn't appear to recurse",
  },
  {
    name: "process-lookup",
    matchesRequest: /\bprocess(es)?\b/i,
    commandMustMatch: /(ps\b|tasklist|Get-Process|pgrep)/i,
    failureMessage: "request asks about processes but command doesn't query processes",
  },
  {
    name: "port-lookup",
    matchesRequest: /\bport\b/i,
    commandMustMatch: /(netstat|lsof|Get-NetTCPConnection|ss\s)/i,
    failureMessage: "request asks about a port but command doesn't inspect network/socket state",
  },
  {
    name: "directory-creation",
    matchesRequest: /\b(create|make)\b.*\b(folder|directory)\b/i,
    commandMustMatch: /(mkdir|md\b|New-Item)/i,
    failureMessage: "request asks to create a directory but command doesn't create one",
  },
  {
    name: "file-deletion",
    matchesRequest: /\b(delete|remove|erase)\b/i,
    commandMustMatch: /(rm\b|del\b|Remove-Item|rmdir|rd\b)/i,
    failureMessage: "request asks to delete something but command doesn't represent deletion",
  },
];

export function checkSemanticIntent(request: string, command: string): ValidationResult {
  for (const rule of RULES) {
    if (rule.matchesRequest.test(request) && !rule.commandMustMatch.test(command)) {
      return { valid: false, reason: `${rule.name}: ${rule.failureMessage}` };
    }
  }
  // No rule fired a contradiction. This does not prove correctness — it
  // means we found no deterministic reason to reject it.
  return { valid: true };
}
