import * as fs from "fs";
import { spawnSync } from "child_process";
import * as core from "@actions/core";

const BUILD_OUTPUT_FILE = "build-output.txt";

export function runBuild(rootDir: string, packageManager: string, buildScriptName: string): number {
  core.info(`Running build command: ${packageManager} run ${buildScriptName}`);
  core.info(`Working directory: ${rootDir}`);

  const result = spawnSync(packageManager, ["run", buildScriptName], {
    cwd: rootDir,
    shell: true,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 50 * 1024 * 1024,
  });

  const combined = [result.stdout || "", result.stderr || ""].join("\n").trim();

  fs.writeFileSync(BUILD_OUTPUT_FILE, combined, "utf-8");

  const exitCode = result.status ?? 1;
  core.info(`Build exit code: ${exitCode}`);

  if (exitCode !== 0) {
    const lines = combined.split("\n");
    const preview = lines.slice(0, 100).join("\n");
    const tail = lines.length > 100 ? `\n... (${lines.length - 100} more lines in ${BUILD_OUTPUT_FILE})` : "";
    core.error(`Build failed:\n${preview}${tail}`);
  } else {
    core.info("Build succeeded.");
  }

  core.setOutput("BUILD_EXIT_CODE", String(exitCode));

  return exitCode;
}
