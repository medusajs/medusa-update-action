import * as fs from "fs";
import * as core from "@actions/core";

const RELEASE_NOTES_FILE = "/tmp/release-notes.md";

interface GitHubRelease {
  tag_name: string;
  html_url: string;
  body: string;
}

function detectBreakingChanges(text: string): boolean {
  return /breaking.change/i.test(text);
}

async function fetchReleaseNotesSince(currentVersion: string, targetVersion: string): Promise<GitHubRelease[]> {
  const collected: GitHubRelease[] = [];
  let page = 1;
  const MAX_PAGES = 10;
  let foundTarget = false;
  let foundCurrent = false;

  const headers: Record<string, string> = {
    "User-Agent": "medusa-update-action/1.0",
    Accept: "application/vnd.github+json",
  };
  const token = process.env.GH_TOKEN;
  if (token) headers["Authorization"] = `Bearer ${token}`;

  while (page <= MAX_PAGES && !foundCurrent) {
    const response = await fetch(
      `https://api.github.com/repos/medusajs/medusa/releases?per_page=10&page=${page}`,
      { headers }
    );

    if (!response.ok) {
      core.warning(`Could not fetch releases (HTTP ${response.status}). Continuing without release notes.`);
      break;
    }

    const releases = (await response.json()) as GitHubRelease[];
    if (releases.length === 0) break;

    for (const release of releases) {
      if (!foundTarget) {
        if (release.tag_name === `v${targetVersion}`) {
          foundTarget = true;
          collected.push(release);
          // If no current version to compare against, or versions are the same, just collect target
          if (!currentVersion || currentVersion === targetVersion) {
            foundCurrent = true;
            break;
          }
        }
        // Skip releases newer than target
        continue;
      }

      if (release.tag_name === `v${currentVersion}`) {
        foundCurrent = true;
        break;
      }

      collected.push(release);
    }

    page++;
  }

  return collected;
}

function buildContent(releases: GitHubRelease[]): string {
  if (releases.length === 0) return "(No release notes found)";

  const sections = releases.map((r) => {
    const v = r.tag_name.replace(/^v/, "");
    return `## [v${v}](${r.html_url})\n\n${r.body || "(No release notes)"}`;
  });

  return sections.join("\n\n---\n\n");
}

export async function fetchAndSaveReleaseNotes(currentVersion: string, targetVersion: string): Promise<void> {
  const fallbackUrl = `https://github.com/medusajs/medusa/releases/tag/v${targetVersion}`;

  try {
    const releases = await fetchReleaseNotesSince(currentVersion, targetVersion);

    const hasBreakingChanges = releases.some((r) => detectBreakingChanges(r.body));
    const releaseNotesUrl = releases[0]?.html_url ?? fallbackUrl;
    const content = buildContent(releases);

    core.info(`Fetched ${releases.length} release(s). Has breaking changes: ${hasBreakingChanges}`);
    fs.writeFileSync(RELEASE_NOTES_FILE, content, "utf-8");
    core.info(`Release notes written to ${RELEASE_NOTES_FILE}`);
    core.setOutput("RELEASE_NOTES_URL", releaseNotesUrl);
    core.setOutput("HAS_BREAKING_CHANGES", String(hasBreakingChanges));
  } catch (err) {
    const cause = (err as { cause?: unknown }).cause;
    const detail = cause ? ` (cause: ${cause})` : "";
    core.warning(`Error fetching release notes: ${err}${detail}`);
    fs.writeFileSync(RELEASE_NOTES_FILE, "", "utf-8");
    core.setOutput("RELEASE_NOTES_URL", fallbackUrl);
    core.setOutput("HAS_BREAKING_CHANGES", "false");
  }
}
