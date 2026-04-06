export async function checkExistingPR(targetVersion: string): Promise<boolean> {
  const token = process.env.GH_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY;
  const branchPrefix = process.env.BRANCH_PREFIX || "chore/update-medusa";

  if (!token || !repo) return false;

  const owner = repo.split("/")[0];
  const branchName = `${branchPrefix}-${targetVersion}`;

  try {
    const response = await fetch(
      `https://api.github.com/repos/${repo}/pulls?state=open&head=${owner}:${branchName}&per_page=1`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "User-Agent": "medusa-update-action/1.0",
          Accept: "application/vnd.github+json",
        },
      }
    );
    if (!response.ok) return false;
    const prs = (await response.json()) as unknown[];
    return prs.length > 0;
  } catch {
    return false;
  }
}
