import * as core from "@actions/core";
import { detectSetup } from "./utils/detect-setup.js";

// ncu opens HTTP connections to the npm registry. When they're aborted during
// cleanup after the build runs, Node.js can emit unhandled 'error' events or
// unhandled rejections with ECONNRESET / "aborted". These are harmless — ignore them.
function isNcuNetworkNoise(err: unknown): boolean {
  const e = err as NodeJS.ErrnoException;
  return e.code === "ECONNRESET" || e.message === "aborted";
}

process.on("uncaughtException", (err: NodeJS.ErrnoException) => {
  if (isNcuNetworkNoise(err)) return;
  core.setFailed(`Uncaught error: ${err}`);
  process.exit(1);
});

process.on("unhandledRejection", (reason: unknown) => {
  if (isNcuNetworkNoise(reason)) return;
  core.setFailed(`Unhandled rejection: ${reason}`);
  process.exit(1);
});

import { checkTargetVersion } from "./utils/check-target-version.js";
import { checkExistingPR } from "./utils/check-existing-pr.js";
import { updatePackages } from "./utils/update-packages.js";
import { fetchAndSaveReleaseNotes } from "./utils/release-notes.js";
import { runBuild } from "./utils/build-check.js";

async function main(): Promise<void> {
  const rootDir = process.env.WORKING_DIRECTORY || process.cwd();
  const appsDirectory = process.env.APPS_DIRECTORY || "apps";

  // Step 1: Detect package manager, workspace layout, and build command
  const setup = detectSetup(rootDir, appsDirectory);
  if (!setup) return; // setFailed already called

  const { packageManager, buildScriptName, medusaPkgPaths } = setup;

  // Step 2: find the target version without modifying files
  const specifiedVersion = process.env.TARGET_VERSION || undefined;
  const versions = await checkTargetVersion(medusaPkgPaths, specifiedVersion);
  if (!versions) {
    core.info("All @medusajs/* packages are already at latest.");
    core.setOutput("NO_CHANGES", "true");
    core.setOutput("UPDATED_VERSION", "");
    return;
  }

  const { currentVersion, targetVersion } = versions;
  core.info(`Current version: ${currentVersion}, Target version: ${targetVersion}`);
  core.setOutput("UPDATED_VERSION", targetVersion);
  core.setOutput("PREVIOUS_VERSION", currentVersion);

  // Step 3: Check if a PR is already open for this version
  const prExists = await checkExistingPR(targetVersion);
  if (prExists) {
    core.info(`A pull request already exists for v${targetVersion}. Skipping update.`);
    core.setOutput("NO_CHANGES", "true");
    return;
  }

  // Step 4: Update @medusajs/* packages (modifies files + runs install)
  const installRetry = {
    retries: Math.max(0, parseInt(process.env.INSTALL_RETRIES || "0", 10) || 0),
    delayMs: Math.max(0, parseInt(process.env.INSTALL_RETRY_DELAY || "0", 10) || 0) * 1000,
  };
  const { noChanges } = await updatePackages(
    rootDir,
    packageManager,
    medusaPkgPaths,
    targetVersion,
    !!specifiedVersion,
    installRetry
  );
  if (noChanges) return;

  // Step 5: Fetch release notes for all versions between current and target
  await fetchAndSaveReleaseNotes(currentVersion, targetVersion);

  // Step 6: Run build — BUILD_EXIT_CODE output is set for downstream steps
  runBuild(rootDir, packageManager, buildScriptName);
}

main().catch((err) => {
  core.setFailed(`Error: ${err}`);
});
