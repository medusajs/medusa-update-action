import * as fs from "fs";
import { execSync, spawnSync } from "child_process";
import * as core from "@actions/core";

const BUILD_OUTPUT_FILE = "/tmp/build-output.txt";
const RELEASE_NOTES_FILE = "/tmp/release-notes.md";

function readFile(filePath: string): string {
  try {
    return fs.readFileSync(filePath, "utf-8").trim();
  } catch {
    return "";
  }
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + "\n\n_(truncated — see full release notes link above)_";
}

function closeStaleUpdatePRs(branchPrefix: string): void {
  core.info(`Closing stale PRs with head branch matching "${branchPrefix}-*"...`);
  try {
    // jq uses JSON string syntax: \\ produces a literal backslash in the regex (i.e. \.)
    const semverPattern = `${branchPrefix}-[0-9]+\\\\.[0-9]+\\\\.[0-9]+`;
    const output = execSync(
      `gh pr list --state open --json number,headRefName --jq '.[] | select(.headRefName | test("^${semverPattern}$")) | .number'`,
      { encoding: "utf-8" }
    ).trim();

    const prNumbers = output.split("\n").filter(Boolean);
    for (const num of prNumbers) {
      core.info(`  Closing stale PR #${num}`);
      execSync(`gh pr close ${num} --comment "Superseded by a newer Medusa update PR."`, {
        stdio: "inherit",
      });
    }
  } catch (err) {
    core.warning(`Could not list/close stale PRs (non-fatal): ${err}`);
  }
}

export function buildPRBody(params: {
  version: string;
  releaseNotesUrl: string;
  releaseNotesBody: string;
  buildExitCode: number;
  buildOutput: string;
  claudeFixStatus: string;
  claudeConfigured: boolean;
}): string {
  const { version, releaseNotesUrl, releaseNotesBody, buildExitCode, buildOutput, claudeFixStatus, claudeConfigured } = params;

  const buildSucceeded = buildExitCode === 0;
  const fixedByClaude = claudeFixStatus === "fixed";

  let buildSection = "";
  if (fixedByClaude) {
    buildSection =
      "✅ Build initially failed after the update, but errors were fixed automatically by Claude Code.";
  } else if (buildSucceeded) {
    buildSection = "✅ Build passed successfully after the update.";
  } else {
    const truncatedOutput = truncate(buildOutput, 4000);
    const claudeHint = claudeConfigured
      ? ""
      : "\n\n> **Tip:** Add an `anthropic-api-key` input to your workflow to let Claude Code fix build errors automatically.";
    buildSection = `❌ Build failed after the update. Please fix the errors below before merging.${claudeHint}

<details>
<summary>Build errors (click to expand)</summary>

\`\`\`
${truncatedOutput}
\`\`\`

</details>`;
  }

  let releaseNotesSection = "";
  if (!releaseNotesBody) {
    releaseNotesSection = "_Release notes could not be fetched._";
  } else {
    const SEPARATOR = "\n\n---\n\n";
    const sections = releaseNotesBody.split(SEPARATOR);
    const latestNotes = truncate(sections[0], 2000);
    const previousSections = sections.slice(1);

    releaseNotesSection = latestNotes;
    if (previousSections.length > 0) {
      const previousContent = previousSections.join(SEPARATOR);
      releaseNotesSection += `\n\n<details>\n<summary>${previousSections.length} previous release(s)</summary>\n\n${previousContent}\n\n</details>`;
    }
  }

  return `## Update \`@medusajs/*\` to v${version}

This PR updates all \`@medusajs/*\` packages to **v${version}**.

---

> [!IMPORTANT]
> Always review the [release notes for v${version}](${releaseNotesUrl}) before merging — Medusa minor releases may include breaking changes.

---

## Build Status

${buildSection}

---

## Release Notes

${releaseNotesSection}

[View full release notes →](${releaseNotesUrl})

---

_This PR was created automatically by [medusa-update-action](https://github.com/medusajs/medusa-update-action)._`;
}

function main(): void {
  const version = process.env.UPDATED_VERSION || "unknown";
  const releaseNotesUrl =
    process.env.RELEASE_NOTES_URL ||
    `https://github.com/medusajs/medusa/releases/tag/v${version}`;
  const buildExitCode = parseInt(process.env.BUILD_EXIT_CODE || "0", 10);
  const claudeFixStatus = process.env.CLAUDE_FIX_STATUS || "skipped";
  const claudeConfigured = process.env.CLAUDE_CONFIGURED === "true";
  const branchPrefix = process.env.BRANCH_PREFIX || "chore/update-medusa";
  const updateBranch = process.env.UPDATE_BRANCH || "";
  const baseBranch = process.env.BASE_BRANCH || "main";

  const releaseNotesBody = readFile(RELEASE_NOTES_FILE);
  const buildOutput = readFile(BUILD_OUTPUT_FILE);

  closeStaleUpdatePRs(branchPrefix);

  const prBody = buildPRBody({ version, releaseNotesUrl, releaseNotesBody, buildExitCode, buildOutput, claudeFixStatus, claudeConfigured });
  const prTitle = `chore: update @medusajs/* to v${version}`;

  core.info(`\nCreating PR: "${prTitle}"`);
  core.info(`  Base branch: ${baseBranch}`);
  core.info(`  Head branch: ${updateBranch}`);

  const bodyFile = "/tmp/pr-body.md";
  fs.writeFileSync(bodyFile, prBody, "utf-8");

  const args = ["pr", "create", "--title", prTitle, "--body-file", bodyFile, "--base", baseBranch, "--head", updateBranch, "--label", "dependencies"];
  const result = spawnSync("gh", args, { stdio: ["ignore", "pipe", "pipe"], encoding: "utf-8" });

  if (result.status !== 0) {
    // Label might not exist — retry without it
    core.warning("PR creation failed (possibly missing 'dependencies' label). Retrying without label...");
    const retryArgs = ["pr", "create", "--title", prTitle, "--body-file", bodyFile, "--base", baseBranch, "--head", updateBranch];
    const retryResult = spawnSync("gh", retryArgs, { stdio: ["ignore", "pipe", "pipe"], encoding: "utf-8" });

    if (retryResult.status !== 0) {
      core.setFailed(`Failed to create PR: ${retryResult.stderr}`);
      return;
    }

    const prUrl = retryResult.stdout.trim();
    core.info(`PR created: ${prUrl}`);
    core.setOutput("PR_URL", prUrl);
    return;
  }

  const prUrl = result.stdout.trim();
  core.info(`PR created: ${prUrl}`);
  core.setOutput("PR_URL", prUrl);
}

import { fileURLToPath } from "url";
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
