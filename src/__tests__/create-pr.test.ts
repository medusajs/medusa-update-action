import { buildPRBody } from "../create-pr.js";

const BASE_PARAMS = {
  version: "2.5.0",
  releaseNotesUrl: "https://github.com/medusajs/medusa/releases/tag/v2.5.0",
  releaseNotesBody: "## What's Changed\n\n* feat: something new",
  buildExitCode: 0,
  buildOutput: "",
  claudeFixStatus: "skipped",
};

describe("buildPRBody", () => {
  it("includes the version in the title and body", () => {
    const body = buildPRBody(BASE_PARAMS);

    expect(body).toContain("v2.5.0");
    expect(body).toContain("@medusajs/*");
  });

  it("includes the release notes URL", () => {
    const body = buildPRBody(BASE_PARAMS);

    expect(body).toContain(BASE_PARAMS.releaseNotesUrl);
  });

  it("shows success status when build passed", () => {
    const body = buildPRBody({ ...BASE_PARAMS, buildExitCode: 0 });

    expect(body).toContain("✅");
    expect(body).toContain("Build passed");
  });

  it("shows fixed-by-claude status when Claude fixed the build", () => {
    const body = buildPRBody({
      ...BASE_PARAMS,
      buildExitCode: 0,
      claudeFixStatus: "fixed",
    });

    expect(body).toContain("✅");
    expect(body).toContain("Claude Code");
  });

  it("shows failure status and build errors when build failed without Claude", () => {
    const buildOutput = "Error: Cannot find module '@medusajs/utils'";
    const body = buildPRBody({
      ...BASE_PARAMS,
      buildExitCode: 1,
      buildOutput,
      claudeFixStatus: "skipped",
    });

    expect(body).toContain("❌");
    expect(body).toContain(buildOutput);
    expect(body).toContain("<details>");
  });

  it("includes release notes summary", () => {
    const body = buildPRBody(BASE_PARAMS);

    expect(body).toContain("What's Changed");
  });

  it("shows fallback when release notes body is empty", () => {
    const body = buildPRBody({ ...BASE_PARAMS, releaseNotesBody: "" });

    expect(body).toContain("Release notes could not be fetched");
  });

  it("truncates long release notes at 2000 characters", () => {
    const longNotes = "x".repeat(3000);
    const body = buildPRBody({ ...BASE_PARAMS, releaseNotesBody: longNotes });

    expect(body).toContain("truncated");
    // The full 3000-char string should not appear verbatim
    expect(body).not.toContain("x".repeat(2001));
  });

  it("truncates long build output at 4000 characters", () => {
    const longOutput = "e".repeat(5000);
    const body = buildPRBody({
      ...BASE_PARAMS,
      buildExitCode: 1,
      buildOutput: longOutput,
      claudeFixStatus: "skipped",
    });

    expect(body).toContain("truncated");
    expect(body).not.toContain("e".repeat(4001));
  });

  it("includes the footer attribution link", () => {
    const body = buildPRBody(BASE_PARAMS);

    expect(body).toContain("medusa-update-action");
  });
});
