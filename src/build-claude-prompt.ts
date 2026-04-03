import * as fs from "fs";
import * as core from "@actions/core";

const RELEASE_NOTES_FILE = "release-notes.md";
const BUILD_OUTPUT_FILE = "build-output.txt";

function readFile(filePath: string): string {
  try {
    return fs.readFileSync(filePath, "utf-8").trim();
  } catch {
    return "";
  }
}

export function buildClaudePrompt(params: {
  version: string;
  releaseNotesUrl: string;
  buildExitCode: string;
  packageManager: string;
  buildScriptName: string;
  releaseNotes: string;
  buildErrors: string;
}): string {
  const { version, releaseNotesUrl, buildExitCode, packageManager, buildScriptName, releaseNotes, buildErrors } = params;

  const buildErrorSection =
    buildExitCode !== "0" && buildErrors
      ? `The build failed after the update. Here are the errors:\n\n<build-errors>\n${buildErrors}\n</build-errors>\n`
      : "";

  return `The \`@medusajs/*\` packages in this repository were just updated to **v${version}**.

Release notes: ${releaseNotesUrl}

<release-notes>
${releaseNotes}
</release-notes>

${buildErrorSection}**Your tasks:**
1. Review the release notes above for any **breaking changes** in v${version}. If there are breaking changes, implement the necessary code changes to support the new version (e.g. updated import paths, renamed APIs, changed configuration options).
2. Fix any build errors listed above.
3. **Do not change business logic.** Only make changes required by the Medusa version update.
4. After making all changes, run the build to verify it succeeds: \`${packageManager} run ${buildScriptName}\`
`;
}

function main(): void {
  const version = process.env.UPDATED_VERSION || "";
  const releaseNotesUrl = process.env.RELEASE_NOTES_URL || "";
  const buildExitCode = process.env.BUILD_EXIT_CODE || "0";
  const packageManager = process.env.PACKAGE_MANAGER || "npm";
  const buildScriptName = process.env.BUILD_SCRIPT_NAME || "build";

  const releaseNotes = readFile(RELEASE_NOTES_FILE) || "No release notes available.";
  const buildErrors = readFile(BUILD_OUTPUT_FILE);

  const prompt = buildClaudePrompt({ version, releaseNotesUrl, buildExitCode, packageManager, buildScriptName, releaseNotes, buildErrors });

  core.setOutput("CLAUDE_PROMPT", prompt);
}

import { fileURLToPath } from "url";
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
