import { SecurityVerdict } from "./types";

/**
 * Deterministic security policy. Runs after generation, before
 * confirmation. This is the last line of defense against a malicious or
 * broken model output — it must not depend on the model having behaved.
 */

interface Rule {
  pattern: RegExp;
  riskLevel: SecurityVerdict["riskLevel"];
  reason: string;
}

const CRITICAL_RULES: Rule[] = [
  { pattern: /\brm\s+(-[a-z]*r[a-z]*f|-[a-z]*f[a-z]*r)\s+\/(\s|$)/i, riskLevel: "critical", reason: "recursive force-delete of root" },
  { pattern: /\brmdir\s+\/s\s+\/q\s+[a-z]:\\?\s*$/i, riskLevel: "critical", reason: "recursive delete of a Windows drive root" },
  { pattern: /\bformat\s+[a-z]:/i, riskLevel: "critical", reason: "disk format" },
  { pattern: /\bmkfs(\.\w+)?\b/i, riskLevel: "critical", reason: "filesystem creation over existing disk/partition" },
  { pattern: /\b(diskpart|fdisk|parted)\b/i, riskLevel: "critical", reason: "partition manipulation tool" },
  { pattern: /\bdd\s+if=.*of=\/dev\//i, riskLevel: "critical", reason: "raw disk write via dd" },
  { pattern: /:\(\)\{.*\|.*&\s*\};:/i, riskLevel: "critical", reason: "fork bomb" },
];

const HIGH_RULES: Rule[] = [
  { pattern: /\brm\s+-[a-z]*r[a-z]*f?\b.*\/(etc|bin|usr|boot|windows|system32)\b/i, riskLevel: "high", reason: "recursive delete targeting a critical OS directory" },
  { pattern: /\bsudo\s+(chmod|chown)\s+-R\s+.*\/(etc|bin|usr|boot)\b/i, riskLevel: "high", reason: "recursive permission change on system directories" },
  { pattern: /\b(sudo\s+su|su\s+root|runas\s+\/user:administrator)\b/i, riskLevel: "high", reason: "privilege escalation" },
  { pattern: /\b(cat|type)\s+.*(shadow|sam\b|ntds\.dit)/i, riskLevel: "high", reason: "credential file access" },
  { pattern: /\b(curl|wget|Invoke-WebRequest|iwr)\b.*\|\s*(bash|sh|zsh|powershell|iex)\b/i, riskLevel: "high", reason: "pipe a remote download directly into a shell" },
  { pattern: /\bbase64\s+-d.*\|\s*(bash|sh)\b/i, riskLevel: "high", reason: "decode-and-execute encoded payload" },
  { pattern: /\b(certutil\s+-decode|powershell\s+-e(nc)?\s)/i, riskLevel: "high", reason: "encoded payload execution" },
  { pattern: /\b(setenforce\s+0|systemctl\s+(stop|disable)\s+(firewalld|ufw)|Set-MpPreference.*Disable)/i, riskLevel: "high", reason: "disabling a security control" },
  { pattern: /\breg\s+(delete|add)\s+HKLM/i, riskLevel: "high", reason: "system registry modification" },
  { pattern: />\s*\/dev\/sd[a-z]/i, riskLevel: "high", reason: "destructive redirection into a raw block device" },
];

const MEDIUM_RULES: Rule[] = [
  { pattern: /\brm\s+-[a-z]*r[a-z]*f?\b/i, riskLevel: "medium", reason: "recursive/force delete" },
  { pattern: /;\s*(rm|del|Remove-Item)\b/i, riskLevel: "medium", reason: "chained deletion command" },
  { pattern: /\bchmod\s+777\b/i, riskLevel: "medium", reason: "overly permissive file mode" },
];

export function evaluateSecurity(command: string): SecurityVerdict {
  for (const rule of CRITICAL_RULES) {
    if (rule.pattern.test(command)) {
      return { allowed: false, riskLevel: "critical", reason: rule.reason };
    }
  }
  for (const rule of HIGH_RULES) {
    if (rule.pattern.test(command)) {
      return { allowed: false, riskLevel: "high", reason: rule.reason };
    }
  }
  for (const rule of MEDIUM_RULES) {
    if (rule.pattern.test(command)) {
      // Medium risk is not auto-blocked — it's surfaced to the user at
      // confirmation time so they can make an informed call. cli.ts is
      // responsible for showing this alongside the [Y/n] prompt.
      return { allowed: true, riskLevel: "medium", reason: rule.reason };
    }
  }
  return { allowed: true, riskLevel: "low" };
}
