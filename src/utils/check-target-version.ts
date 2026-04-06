import * as fs from "fs";
import * as core from "@actions/core";
import { run as ncuRun } from "npm-check-updates";

function getCurrentVersion(pkgJsonPaths: string[]): string {
  for (const pkgPath of pkgJsonPaths) {
    try {
      const content = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
      const depFields = ["dependencies", "devDependencies", "peerDependencies"];
      for (const field of depFields) {
        const deps = content[field] as Record<string, string> | undefined;
        if (deps) {
          for (const [key, value] of Object.entries(deps)) {
            if (key.startsWith("@medusajs/") && key !== "@medusajs/ui") {
              return (value as string).replace(/^[^0-9]*/, "");
            }
          }
        }
      }
    } catch {
      // ignore
    }
  }
  return "";
}

/**
 * Compares two semver strings.
 * @returns A negative number if `a < b`, a positive number if `a > b`, or `0` if equal.
 */
function compareSemver(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export async function checkTargetVersion(
  pkgJsonPaths: string[],
  specifiedVersion?: string
): Promise<{ currentVersion: string; targetVersion: string } | null> {
  const currentVersion = getCurrentVersion(pkgJsonPaths);

  if (specifiedVersion) {
    if (currentVersion && compareSemver(specifiedVersion, currentVersion) <= 0) {
      core.setFailed(
        `Specified version v${specifiedVersion} is not greater than the current version v${currentVersion}.`
      );
      return null;
    }
    core.info(`Using specified target version: ${specifiedVersion}`);
    return { currentVersion, targetVersion: specifiedVersion };
  }

  for (const pkgPath of pkgJsonPaths) {
    const result = (await ncuRun({
      packageFile: pkgPath,
      filter: /^@medusajs\//,
      target: "latest",
    })) as Record<string, string> | void;

    if (result && typeof result === "object") {
      for (const [pkg, version] of Object.entries(result)) {
        if (pkg.startsWith("@medusajs/") && pkg !== "@medusajs/ui") {
          return { currentVersion, targetVersion: version.replace(/^[^0-9]*/, "") };
        }
      }
    }
  }
  return null;
}
