<p align="center">
  <a href="https://www.medusajs.com">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://user-images.githubusercontent.com/59018053/229103275-b5e482bb-4601-46e6-8142-244f531cebdb.svg">
    <source media="(prefers-color-scheme: light)" srcset="https://user-images.githubusercontent.com/59018053/229103726-e5b529a3-9b3f-4970-8a1f-c6af37f087bf.svg">
    <img alt="Medusa logo" src="https://user-images.githubusercontent.com/59018053/229103726-e5b529a3-9b3f-4970-8a1f-c6af37f087bf.svg">
    </picture>
  </a>
</p>
<h1 align="center">
  Medusa Update Action
</h1>

<h4 align="center">
  <a href="https://docs.medusajs.com">Documentation</a> |
  <a href="https://www.medusajs.com">Website</a>
</h4>

<p align="center">
  Building blocks for digital commerce
</p>
<p align="center">
  <a href="https://github.com/medusajs/medusa/blob/develop/LICENSE">
    <img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="Medusa is released under the MIT license." />
  </a>
  <a href="https://github.com/medusajs/medusa/blob/develop/CONTRIBUTING.md">
    <img src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat" alt="PRs welcome!" />
  </a>
  <a href="https://discord.gg/xpCwq3Kfn8">
    <img src="https://img.shields.io/badge/chat-on%20discord-7289DA.svg" alt="Discord Chat" />
  </a>
  <a href="https://twitter.com/intent/follow?screen_name=medusajs">
    <img src="https://img.shields.io/twitter/follow/medusajs.svg?label=Follow%20@medusajs" alt="Follow @medusajs" />
  </a>
</p>

# medusa-update-action

A GitHub Action (reusable workflow) that automatically keeps your `@medusajs/*` packages up-to-date and opens a pull request with the changes.

## Features

- Detects your package manager automatically (npm, yarn, pnpm)
- Works with **standalone** Medusa backends, **monorepos**, and **plugins**
- Updates only `@medusajs/*` packages — leaves your other dependencies untouched
- Runs your `build` script to verify nothing is broken
- Includes a link to the official release notes in every PR
- If build errors occur **without** a Claude API key → errors are included in the PR body so you can fix them manually
- If build errors occur **with** a Claude API key → Claude Code automatically fixes errors and implements breaking changes from the release notes

## Prerequisites

- Repository must have a project with a `package.json` that has at least one `@medusajs/*` dependency
- The `build` script must be defined in the `package.json` of the Medusa project
- Node.js 24 is used on the runner
- **GitHub Actions must be allowed to create pull requests** in your repository. Enable this under:
  **Settings → Actions → General → Workflow permissions → Allow GitHub Actions to create and approve pull requests**

## Quick Start

Create a workflow file in your repository:

```yaml
# .github/workflows/update-medusa.yml
name: Update Medusa

on:
  schedule:
    - cron: "0 9 * * 1" # Every Monday at 9 AM UTC
  workflow_dispatch: # Allow manual runs

jobs:
  update:
    # Required for opening PRs
    permissions:
      contents: write
      pull-requests: write
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v3

      - name: Update Medusa
        uses: medusajs/medusa-update-action@beta
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

If you have a monorepo where the storefront build depends on the backend, make sure to add the necessary environment variables:

```yaml
# .github/workflows/update-medusa.yml
name: Update Medusa

on:
  schedule:
    - cron: "0 9 * * 1" # Every Monday at 9 AM UTC
  workflow_dispatch: # Allow manual runs

jobs:
  update:
    # Required for opening PRs
    permissions:
      contents: write
      pull-requests: write
    runs-on: ubuntu-latest
    env:
      NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY: ${{ secrets.MEDUSA_PUBLISHABLE_KEY }}
      NEXT_PUBLIC_MEDUSA_BACKEND_URL: ${{ secrets.MEDUSA_BACKEND_URL }}
    steps:
      - name: Checkout
        uses: actions/checkout@v3

      - name: Update Medusa
        uses: medusajs/medusa-update-action@beta
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

### Result

On the next scheduled run (or when triggered manually), it will open a PR like this:

```markdown
**chore: update @medusajs/\* to v2.14.0**

⚠️ Always review the [release notes for v2.14.0](https://github.com/medusajs/medusa/releases/tag/v2.14.0) before merging — Medusa minor leases may include breaking changes.

✅ Build passed successfully.
```

### PR Body

Every PR includes:

- **Release notes link** — with a prominent warning to always check for breaking changes before merging
- **Build status** — success, fixed by Claude, or failed with errors in a collapsible section
- **Release notes summary** — first 2,000 characters of the release notes body

### No Changes

If all `@medusajs/*` packages are already at the latest version, no branch is created and no PR is opened. The workflow completes successfully.

### Stale PR Cleanup

Before opening a new PR, the action closes any previously opened PRs whose branch name starts with your configured `branch-prefix`. This prevents accumulation of outdated update PRs.

## With Claude Code (Recommended)

Provide your Anthropic API key to enable automatic error fixing and breaking change implementation:

```yaml
jobs:
  update:
    # Required for opening PRs
    permissions:
      contents: write
      pull-requests: write
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v3

      - name: Update Medusa
        uses: medusajs/medusa-update-action@beta
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
```

When Claude Code is enabled, if the build fails after the update **or** breaking changes are detected in the release notes, Claude will:

1. Read the release notes to understand what changed
2. Implement any required code changes (updated imports, renamed APIs, changed config, etc.)
3. Fix build errors
4. Re-run the build to confirm the fix worked
5. Commit the fixes to the same branch before the PR is opened

## All Options

```yaml
jobs:
  update:
    # Required for opening PRs
    permissions:
      contents: write
      pull-requests: write
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v3

      - name: Update Medusa
        uses: medusajs/medusa-update-action@beta
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
          # Base branch for the PR (default: "main")
          base-branch: develop

          # Prefix for the update branch name (default: "chore/update-medusa")
          # The resolved version is always appended: deps/medusa-2.14.0
          branch-prefix: deps/medusa

          # Root directory of the project (default: ".")
          # Useful if your Medusa project is in a subdirectory
          working-directory: backend

          # For monorepos: name of the directory containing workspace apps (default: "apps")
          apps-directory: packages

          # Set to "false" to skip committing and opening a PR — useful when integrating
          # into a custom workflow that handles those steps itself (default: "true")
          create-pr: "false"
```

## Inputs

| Input | Type | Required | Default | Description |
|---|---|---|---|---|
| `base-branch` | string | no | `main` | Base branch for the PR |
| `branch-prefix` | string | no | `chore/update-medusa` | Prefix for the update branch. The resolved version is always appended — e.g. `chore/update-medusa-2.5.0`. |
| `working-directory` | string | no | `.` | Root directory of your project |
| `apps-directory` | string | no | `apps` | Subdirectory containing workspace apps (monorepos only) |
| `create-pr` | string | no | `true` | Set to `"false"` to skip committing and opening a PR |
| `target-version` | string | no | _(latest)_ | Pin to a specific `@medusajs/*` version (e.g. `2.5.0`). Must be greater than the currently installed version. Defaults to the latest available version. |

## Secrets

| Secret | Required | Description |
|---|---|---|
| `github-token` | **yes** | A token with `contents: write` and `pull-requests: write` permissions. Pass `${{ secrets.GITHUB_TOKEN }}`. |
| `anthropic-api-key` | no | Your [Anthropic API key](https://console.anthropic.com/). Enables Claude Code to auto-fix errors and implement breaking changes. |

> **PR author:** When you pass `${{ secrets.GITHUB_TOKEN }}`, the PR and commit are authored by `github-actions[bot]`. If you pass a Personal Access Token (PAT) instead, the PR is authored as that token's user account.

## Outputs

| Output | Description |
|---|---|
| `pr-url` | URL of the created PR (empty if packages were already up-to-date) |
| `updated-version` | The `@medusajs/*` version that was applied |
| `build-status` | `success`, `fixed-by-claude`, or `failed` |

## Examples

### Pass environment variables to the build

If your build requires environment variables (e.g. a publishable API key for a storefront), pass `env:` to the job:

```yaml
jobs:
  update:
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write
    env:
      NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY: ${{ secrets.MEDUSA_PUBLISHABLE_KEY }}
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: medusajs/medusa-update-action@beta
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

### Run within another workflow

If you want to run the update as part of a larger workflow and handle subsequent steps yourself, set `create-pr: "false"` to skip the commit and PR creation:

```yaml
jobs:
  update:
    # Required for opening PRs
    permissions:
      contents: write
      pull-requests: write
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v3

      - name: Update Medusa
        uses: medusajs/medusa-update-action@beta
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          create-pr: "false"

      - name: Do something with the result
        run: echo "Updated to ${{ steps.update.outputs.updated-version }}"
```

The action will still detect your setup, update packages, run the build, and expose its outputs — it just won't commit or open a PR.

### Update to a specific version

By default, the action updates Medusa to the latest version. To let a user (or another workflow) trigger an update to a particular version, expose a `workflow_dispatch` input and forward it as `target-version`:

```yaml
name: Update Medusa to specific version

on:
  workflow_dispatch:
    inputs:
      version:
        description: "Target @medusajs/* version (e.g. 2.5.0)"
        required: true

jobs:
  update:
    permissions:
      contents: write
      pull-requests: write
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: medusajs/medusa-update-action@beta
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          target-version: ${{ inputs.version }}
```

### Use a different AI agent

To use an AI agent other than Claude Code, disable PR creation, let the action update packages and run the build, then invoke your agent and open the PR yourself:

```yaml
jobs:
  update:
    # Required for opening PRs
    permissions:
      contents: write
      pull-requests: write
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: medusajs/medusa-update-action@beta
        id: update
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          create-pr: "false"

      - name: Run your AI agent
        if: steps.update.outputs.build-status == 'failed'
        run: |
          # invoke your agent here to fix build errors

      - name: Create pull request
        uses: peter-evans/create-pull-request@v7
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          branch: chore/update-medusa-${{ steps.update.outputs.updated-version }}
          title: "chore: update @medusajs/* to v${{ steps.update.outputs.updated-version }}"
          body: "Automated Medusa update to v${{ steps.update.outputs.updated-version }}."
```

### Multiple Medusa projects in the same repo

Call the action once per project, using `working-directory` to point at each one and a unique `branch-prefix` to keep their PRs and stale-PR cleanup separate:

```yaml
jobs:
  update:
    permissions:
      contents: write
      pull-requests: write
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Update US backend
        uses: medusajs/medusa-update-action@beta
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          working-directory: backend-us
          branch-prefix: chore/update-medusa-us

      - name: Update EU backend
        uses: medusajs/medusa-update-action@beta
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          working-directory: backend-eu
          branch-prefix: chore/update-medusa-eu
```

Each step opens its own PR (e.g. `chore/update-medusa-us-2.5.0`) and only closes stale PRs for its own prefix, so the two update flows remain completely independent.

## License

MIT
