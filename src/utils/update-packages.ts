import * as fs from "fs";
import * as path from "path";
import { spawnSync } from "child_process";
import * as core from "@actions/core";
import { run as ncuRun } from "npm-check-updates";

function getMedusaVersion(pkgJsonPath: string): string | null {
  try {
    const content = JSON.parse(fs.readFileSync(pkgJsonPath, "utf-8"));
    const depFields = ["dependencies", "devDependencies", "peerDependencies"];
    for (const field of depFields) {
      const deps = content[field] as Record<string, string> | undefined;
      if (deps) {
        for (const [key, value] of Object.entries(deps)) {
          if (key.startsWith("@medusajs/") && key !== "@medusajs/ui") {
            // Strip leading ^ ~ or other range specifiers
            return value.replace(/^[^0-9]*/, "");
          }
        }
      }
    }
  } catch {
    // ignore
  }
  return null;
}

async function updatePackageJson(pkgJsonPath: string): Promise<boolean> {
  core.info(`\nUpdating @medusajs/* in: ${pkgJsonPath}`);

  const beforeContent = fs.readFileSync(pkgJsonPath, "utf-8");

  await ncuRun({
    packageFile: pkgJsonPath,
    filter: /^@medusajs\//,
    upgrade: true,
    target: "latest",
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
  pkgJsonPaths: string[]
): Promise<{ noChanges: boolean; updatedVersion: string }> {
  core.info(`Updating @medusajs/* packages in ${pkgJsonPaths.length} package.json file(s)...`);

  let anyChanged = false;
  for (const pkgPath of pkgJsonPaths) {
    const changed = await updatePackageJson(pkgPath);
    if (changed) {
      anyChanged = true;
    }
  }

  if (!anyChanged) {
    core.info("\nNo @medusajs/* packages were updated. Already at latest.");
    core.setOutput("NO_CHANGES", "true");
    core.setOutput("UPDATED_VERSION", "");
    return { noChanges: true, updatedVersion: "" };
  }

  // Read the new version from the first changed file
  let updatedVersion = "";
  for (const pkgPath of pkgJsonPaths) {
    const v = getMedusaVersion(pkgPath);
    if (v) {
      updatedVersion = v;
      break;
    }
  }

  core.info(`\nUpdated to version: ${updatedVersion}`);

  runInstall(rootDir, packageManager);

  core.setOutput("NO_CHANGES", "false");
  core.setOutput("UPDATED_VERSION", updatedVersion);

  return { noChanges: false, updatedVersion };
}
