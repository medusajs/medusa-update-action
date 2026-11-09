import * as fs from "fs";
import * as path from "path";
import { spawnSync } from "child_process";
import * as core from "@actions/core";
import { run as ncuRun } from "npm-check-updates";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

const MEDUSA_PACKAGE_PATTERN = "@medusajs/*";

/**
 * @param pinVersion When provided, rewrites `@medusajs/*` versions directly to
 * this value (preserving any `^`/`~` prefix) instead of running ncu.
 * When omitted, ncu resolves and applies the latest available version.
 */
async function updatePackageJson(pkgJsonPath: string, pinVersion?: string): Promise<boolean> {
  core.info(`\nUpdating @medusajs/* in: ${pkgJsonPath}`);

  const beforeContent = fs.readFileSync(pkgJsonPath, "utf-8");

  if (pinVersion) {
    const pkgData = JSON.parse(beforeContent);
    for (const field of ["dependencies", "devDependencies", "peerDependencies"]) {
      const deps = pkgData[field] as Record<string, string> | undefined;
      if (!deps) continue;
      for (const pkg of Object.keys(deps)) {
        if (pkg.startsWith("@medusajs/") && pkg !== "@medusajs/ui") {
          const prefix = /^[\^~]/.test(deps[pkg]) ? deps[pkg][0] : "";
          deps[pkg] = `${prefix}${pinVersion}`;
        }
      }
    }
    const newContent = JSON.stringify(pkgData, null, 2) + "\n";
    fs.writeFileSync(pkgJsonPath, newContent, "utf-8");
    const changed = newContent !== beforeContent;
    core.info(changed ? "  -> Updated." : "  -> No changes.");
    return changed;
  }

  await ncuRun({
    packageFile: pkgJsonPath,
    filter: /^@medusajs\//,
    upgrade: true,
    target: "latest",
    dep: ["prod", "dev", "peer"],
  });

  const afterContent = fs.readFileSync(pkgJsonPath, "utf-8");
  const changed = beforeContent !== afterContent;
  core.info(changed ? "  -> Updated." : "  -> No changes.");
  return changed;
}

export interface InstallRetryOptions {
  retries: number;
  delayMs: number;
}

/**
 * Temporarily exempts `@medusajs/*` from the package manager's minimum release
 * age (pnpm `minimumReleaseAgeExclude`, Yarn Berry `npmPreapprovedPackages`) so a
 * just-published release can be installed. Returns a function that restores the file.
 */
function excludeMedusaFromReleaseAge(rootDir: string, packageManager: string): () => void {
  let configPath: string;
  let key: string;
  if (packageManager === "pnpm") {
    configPath = path.join(rootDir, "pnpm-workspace.yaml");
    key = "minimumReleaseAgeExclude";
  } else if (packageManager === "yarn") {
    configPath = path.join(rootDir, ".yarnrc.yml");
    key = "npmPreapprovedPackages";
  } else {
    return () => {};
  }

  if (!fs.existsSync(configPath)) return () => {};

  const original = fs.readFileSync(configPath, "utf-8");
  // Yarn errors on unknown settings, so only add the key on versions that use the age gate.
  if (packageManager === "yarn" && !original.includes("npmMinimalAgeGate")) return () => {};

  const config = (parseYaml(original) as Record<string, unknown> | null) ?? {};
  const list = Array.isArray(config[key]) ? (config[key] as string[]) : [];
  if (list.includes(MEDUSA_PACKAGE_PATTERN)) return () => {};

  config[key] = [...list, MEDUSA_PACKAGE_PATTERN];
  fs.writeFileSync(configPath, stringifyYaml(config), "utf-8");
  core.info(`Temporarily added ${MEDUSA_PACKAGE_PATTERN} to ${key} in ${path.basename(configPath)}`);

  return () => fs.writeFileSync(configPath, original, "utf-8");
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function runInstall(rootDir: string, packageManager: string, retry: InstallRetryOptions): Promise<void> {
  const args = ["install"];

  if (packageManager === "yarn") {
    // Yarn Berry (v2+) enables immutable installs in CI by default (YN0028).
    // Since we just modified package.json, the lockfile must be updated too.
    const isYarnBerry = fs.existsSync(path.join(rootDir, ".yarnrc.yml"));
    if (isYarnBerry) {
      args.push("--no-immutable");
    }
  } else if (packageManager === "pnpm") {
    // pnpm also defaults to --frozen-lockfile in CI.
    // Since we just modified package.json, the lockfile must be updated too.
    args.push("--no-frozen-lockfile");
  }

  const restoreConfig = excludeMedusaFromReleaseAge(rootDir, packageManager);
  try {
    await installWithRetry(rootDir, packageManager, args, retry);
  } finally {
    restoreConfig();
  }
}

async function installWithRetry(
  rootDir: string,
  packageManager: string,
  args: string[],
  retry: InstallRetryOptions
): Promise<void> {
  const maxAttempts = retry.retries + 1;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    core.info(`\nRunning ${packageManager} install in: ${rootDir} (attempt ${attempt}/${maxAttempts})`);
    const result = spawnSync(packageManager, args, {
      cwd: rootDir,
      stdio: "inherit",
      shell: true,
    });
    if (result.status === 0) return;

    if (attempt === maxAttempts) {
      core.setFailed(`${packageManager} install failed with exit code ${result.status} after ${maxAttempts} attempt(s)`);
      return;
    }

    // Right after a release, not every @medusajs/* package may have propagated
    // to the registry yet, so wait for the cooldown to pass.
    core.warning(
      `${packageManager} install failed with exit code ${result.status}. Retrying in ${retry.delayMs / 1000}s...`
    );
    await sleep(retry.delayMs);
  }
}

export async function updatePackages(
  rootDir: string,
  packageManager: string,
  pkgJsonPaths: string[],
  targetVersion: string,
  /**
   * When `true`, rewrites `@medusajs/*` versions directly to `targetVersion`
   * (preserving any `^`/`~` prefix) instead of letting ncu resolve the latest.
   * Use this when the caller has already validated a specific version to pin to.
   */
  pinExact = false,
  installRetry: InstallRetryOptions = { retries: 0, delayMs: 0 }
): Promise<{ noChanges: boolean }> {
  core.info(`Updating @medusajs/* packages in ${pkgJsonPaths.length} package.json file(s)...`);

  let anyChanged = false;
  for (const pkgPath of pkgJsonPaths) {
    const changed = await updatePackageJson(pkgPath, pinExact ? targetVersion : undefined);
    if (changed) {
      anyChanged = true;
    }
  }

  if (!anyChanged) {
    core.info("\nNo @medusajs/* packages were updated. Already at latest.");
    core.setOutput("NO_CHANGES", "true");
    core.setOutput("UPDATED_VERSION", "");
    return { noChanges: true };
  }

  core.info(`\nUpdated to version: ${targetVersion}`);

  await runInstall(rootDir, packageManager, installRetry);

  core.setOutput("NO_CHANGES", "false");
  core.setOutput("UPDATED_VERSION", targetVersion);

  return { noChanges: false };
}
