import * as fs from "fs";
import * as core from "@actions/core";

const RELEASE_NOTES_FILE = "release-notes.md";

interface GitHubRelease {
  html_url: string;
  body: string;
}

async function fetchReleaseNotes(version: string): Promise<{ body: string; url: string }> {
  const apiUrl = `https://api.github.com/repos/medusajs/medusa/releases/tags/v${version}`;
  const htmlUrl = `https://github.com/medusajs/medusa/releases/tag/v${version}`;
  core.info(`Fetching release notes from: ${apiUrl}`);

  const response = await fetch(apiUrl, {
    headers: {
      "User-Agent": "medusa-update-action/1.0",
      Accept: "application/vnd.github+json",
    },
  });

  if (!response.ok) {
    core.warning(`Could not fetch release notes (HTTP ${response.status}). Continuing without them.`);
    return { body: "", url: htmlUrl };
  }

  const release = (await response.json()) as GitHubRelease;
  return { body: release.body || "", url: release.html_url || htmlUrl };
}

function detectBreakingChanges(text: string): boolean {
  return /breaking.change/i.test(text);
}

export async function fetchAndSaveReleaseNotes(version: string): Promise<void> {
  try {
    const { body, url } = await fetchReleaseNotes(version);
    const hasBreakingChanges = detectBreakingChanges(body);

    core.info(`Has breaking changes: ${hasBreakingChanges}`);

    fs.writeFileSync(RELEASE_NOTES_FILE, body || "(No release notes found)", "utf-8");
    core.info(`Release notes written to ${RELEASE_NOTES_FILE}`);

    core.setOutput("RELEASE_NOTES_URL", url);
    core.setOutput("HAS_BREAKING_CHANGES", String(hasBreakingChanges));
  } catch (err) {
    // Non-fatal: proceed without release notes
    core.warning(`Error fetching release notes: ${err}`);
    fs.writeFileSync(RELEASE_NOTES_FILE, "", "utf-8");
    core.setOutput("RELEASE_NOTES_URL", `https://github.com/medusajs/medusa/releases/tag/v${version}`);
    core.setOutput("HAS_BREAKING_CHANGES", "false");
  }
}
