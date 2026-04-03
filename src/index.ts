import * as core from "@actions/core";
import { detectSetup } from "./utils/detect-setup.js";
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

  // Step 2: Update @medusajs/* packages
  const { noChanges, updatedVersion } = await updatePackages(rootDir, packageManager, medusaPkgPaths);
  if (noChanges) return;

  // Step 3: Fetch release notes (non-fatal on failure)
  await fetchAndSaveReleaseNotes(updatedVersion);

  // Step 4: Run build — BUILD_EXIT_CODE output is set for downstream steps
  runBuild(rootDir, packageManager, buildScriptName);
}

main().catch((err) => {
  core.setFailed(`Error: ${err}`);
});
