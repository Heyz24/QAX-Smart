import * as os from "os";
import * as path from "path";
import { EnvironmentContext, ShellName } from "./types";

/**
 * Resolves runtime environment context on demand. Never persisted, never
 * scans the filesystem, never displayed to the user directly.
 */
export function resolveEnvironment(shell: ShellName): EnvironmentContext {
  const platform = os.platform();
  const resolvedOs: EnvironmentContext["os"] =
    platform === "win32" ? "windows" : platform === "darwin" ? "macos" : "linux";

  const home = os.homedir();
  const username = os.userInfo().username;

  return {
    os: resolvedOs,
    shell,
    cwd: process.cwd(),
    home,
    downloads: path.join(home, "Downloads"),
    documents: path.join(home, "Documents"),
    desktop: path.join(home, "Desktop"),
    username,
  };
}
