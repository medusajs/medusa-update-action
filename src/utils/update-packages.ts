import * as fs from "fs";
import * as path from "path";
import { spawnSync } from "child_process";
import * as core from "@actions/core";
import { run as ncuRun } from "npm-check-updates";

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

function runInstall(rootDir: string, packageManager: string): void {
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

  core.info(`\nRunning ${packageManager} install in: ${rootDir}`);
  const result = spawnSync(packageManager, args, {
    cwd: rootDir,
    stdio: "inherit",
    shell: true,
  });
  if (result.status !== 0) {
    core.setFailed(`${packageManager} install failed with exit code ${result.status}`);
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
  pinExact = false
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

  runInstall(rootDir, packageManager);

  core.setOutput("NO_CHANGES", "false");
  core.setOutput("UPDATED_VERSION", targetVersion);

  return { noChanges: false };
}
