import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { track, flush } = require("@medusajs/telemetry") as {
  track: (event: string, data?: Record<string, unknown>) => void;
  flush?: () => Promise<void>;
};

function main(): void {
  const packageManager = process.env.PACKAGE_MANAGER || "";
  const isMonorepo = process.env.IS_MONOREPO === "true";
  const hasAnthropicKey = process.env.HAS_ANTHROPIC_KEY === "true";
  const createPr = process.env.CREATE_PR !== "false";
  const hasTargetVersion = process.env.HAS_TARGET_VERSION === "true";
  const currentVersion = process.env.CURRENT_VERSION || "";
  const targetVersion = process.env.TARGET_VERSION || "";
  const noChanges = process.env.NO_CHANGES === "true";
  const buildStatus = process.env.BUILD_STATUS || "";
  const prCreated = !!process.env.PR_URL;
  const actionFailed = process.env.ACTION_FAILED === "true";

  track("update_action_run", {
    package_manager: packageManager,
    is_monorepo: isMonorepo,
    has_anthropic_key: hasAnthropicKey,
    create_pr: createPr,
    has_target_version: hasTargetVersion,
    current_version: currentVersion,
    target_version: targetVersion,
    no_changes: noChanges,
    build_status: buildStatus || (noChanges ? "no-changes" : "unknown"),
    pr_created: prCreated,
    action_failed: actionFailed,
  });
}

main();

// flush is registered on process.exit by the package, but we call it
// explicitly so the script doesn't exit before the queue is drained
if (flush) {
  flush().catch(() => {});
}
