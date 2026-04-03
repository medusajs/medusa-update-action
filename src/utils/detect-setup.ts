import * as fs from "fs";
import * as path from "path";
import * as core from "@actions/core";

function hasMedusaDeps(pkgJson: Record<string, unknown>): boolean {
  const depFields = ["dependencies", "devDependencies", "peerDependencies"];
  for (const field of depFields) {
    const deps = pkgJson[field] as Record<string, string> | undefined;
    if (deps) {
      for (const key of Object.keys(deps)) {
        if (key.startsWith("@medusajs/")) {
          return true;
        }
      }
    }
  }
  return false;
}

function findMedusaPackageJsonFiles(
  rootDir: string,
  isMonorepo: boolean,
  appsDirectory: string
): string[] {
  if (!isMonorepo) {
    const rootPkg = path.join(rootDir, "package.json");
    if (fs.existsSync(rootPkg) && hasMedusaDeps(JSON.parse(fs.readFileSync(rootPkg, "utf-8")))) {
      return [rootPkg];
    }
    return [];
  }

  const appsDir = path.join(rootDir, appsDirectory);
  if (!fs.existsSync(appsDir)) {
    core.warning(`Apps directory "${appsDirectory}" not found under ${rootDir}.`);
    return [];
  }

  const results: string[] = [];
  const entries = fs.readdirSync(appsDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const pkgPath = path.join(appsDir, entry.name, "package.json");
    if (!fs.existsSync(pkgPath)) continue;
    try {
      const content = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
      if (hasMedusaDeps(content)) {
        results.push(pkgPath);
      }
    } catch {
      // skip malformed package.json
    }
  }
  return results;
}

function detectPackageManager(rootDir: string): string {
  if (fs.existsSync(path.join(rootDir, "pnpm-lock.yaml"))) {
    return "pnpm";
  }
  if (fs.existsSync(path.join(rootDir, "yarn.lock"))) {
    return "yarn";
  }
  return "npm";
}

function detectIsMonorepo(rootDir: string): boolean {
  if (fs.existsSync(path.join(rootDir, "pnpm-workspace.yaml"))) {
    return true;
  }
  if (fs.existsSync(path.join(rootDir, "turbo.json"))) {
    return true;
  }
  if (fs.existsSync(path.join(rootDir, "lerna.json"))) {
    return true;
  }
  const rootPkg = path.join(rootDir, "package.json");
  if (fs.existsSync(rootPkg)) {
    try {
      const content = JSON.parse(fs.readFileSync(rootPkg, "utf-8"));
      if (content.workspaces) {
        return true;
      }
    } catch {
      // ignore
    }
  }
  return false;
}

function detectBuildScriptName(rootDir: string, medusaPkgPaths: string[]): string {
  if (fs.existsSync(path.join(rootDir, "turbo.json"))) {
    const rootPkg = path.join(rootDir, "package.json");
    if (fs.existsSync(rootPkg)) {
      try {
        const content = JSON.parse(fs.readFileSync(rootPkg, "utf-8"));
        if (content.scripts?.build) {
          return "build";
        }
      } catch {
        // ignore
      }
    }
    return "turbo build";
  }

  const rootPkgPath = path.join(rootDir, "package.json");
  if (fs.existsSync(rootPkgPath)) {
    try {
      const content = JSON.parse(fs.readFileSync(rootPkgPath, "utf-8"));
      if (content.scripts?.build) {
        return "build";
      }
    } catch {
      // ignore
    }
  }

  for (const pkgPath of medusaPkgPaths) {
    try {
      const content = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
      if (content.scripts?.build) {
        return "build";
      }
    } catch {
      // ignore
    }
  }

  return "build";
}

export function detectSetup(
  rootDir: string,
  appsDirectory: string
): { packageManager: string; buildScriptName: string; medusaPkgPaths: string[] } | null {
  core.info(`Detecting setup in: ${rootDir}`);

  const packageManager = detectPackageManager(rootDir);
  core.info(`Package manager: ${packageManager}`);

  const isMonorepo = detectIsMonorepo(rootDir);
  core.info(`Is monorepo: ${isMonorepo}`);
  if (isMonorepo) {
    core.info(`Apps directory: ${appsDirectory}`);
  }

  const medusaPkgPaths = findMedusaPackageJsonFiles(rootDir, isMonorepo, appsDirectory);
  core.info(`Found ${medusaPkgPaths.length} package.json file(s) with @medusajs/* deps:`);
  medusaPkgPaths.forEach((p) => core.info(`  - ${p}`));

  if (medusaPkgPaths.length === 0) {
    core.setFailed("No package.json files with @medusajs/* dependencies found.");
    return null;
  }

  const buildScriptName = detectBuildScriptName(rootDir, medusaPkgPaths);
  core.info(`Build script name: ${buildScriptName}`);

  core.setOutput("PACKAGE_MANAGER", packageManager);
  core.setOutput("IS_MONOREPO", String(isMonorepo));
  core.setOutput("BUILD_SCRIPT_NAME", buildScriptName);
  core.setOutput("PKGJSON_PATHS", medusaPkgPaths.join("\n"));

  return { packageManager, buildScriptName, medusaPkgPaths };
}
