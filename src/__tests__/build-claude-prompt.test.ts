import { buildClaudePrompt } from "../build-claude-prompt.js";

const BASE_PARAMS = {
  version: "2.5.0",
  previousVersion: "2.4.0",
  releaseNotesUrl: "https://github.com/medusajs/medusa/releases/tag/v2.5.0",
  buildExitCode: "0",
  packageManager: "yarn",
  buildScriptName: "build",
  releaseNotes: "## What's Changed\n\n* feat: something new",
  buildErrors: "",
};

describe("buildClaudePrompt", () => {
  it("includes the version", () => {
    const prompt = buildClaudePrompt(BASE_PARAMS);

    expect(prompt).toContain("v2.5.0");
  });

  it("shows version range when previousVersion differs from version", () => {
    const prompt = buildClaudePrompt(BASE_PARAMS);

    expect(prompt).toContain("v2.4.0");
    expect(prompt).toContain("v2.5.0");
  });

  it("shows only target version when previousVersion equals version", () => {
    const prompt = buildClaudePrompt({ ...BASE_PARAMS, previousVersion: "2.5.0" });

    expect(prompt).toContain("to **v2.5.0**");
    expect(prompt).not.toContain("from **v2.5.0**");
  });

  it("includes the release notes URL", () => {
    const prompt = buildClaudePrompt(BASE_PARAMS);

    expect(prompt).toContain(BASE_PARAMS.releaseNotesUrl);
  });

  it("includes the release notes body", () => {
    const prompt = buildClaudePrompt(BASE_PARAMS);

    expect(prompt).toContain("What's Changed");
  });

  it("includes the build command", () => {
    const prompt = buildClaudePrompt({ ...BASE_PARAMS, packageManager: "pnpm", buildScriptName: "plugin:build" });

    expect(prompt).toContain("pnpm run plugin:build");
  });

  it("does not include build error section when build succeeded", () => {
    const prompt = buildClaudePrompt({ ...BASE_PARAMS, buildExitCode: "0", buildErrors: "" });

    expect(prompt).not.toContain("<build-errors>");
  });

  it("includes build error section when build failed", () => {
    const prompt = buildClaudePrompt({
      ...BASE_PARAMS,
      buildExitCode: "1",
      buildErrors: "Error: Cannot find module",
    });

    expect(prompt).toContain("<build-errors>");
    expect(prompt).toContain("Cannot find module");
  });

  it("does not include build error section when build failed but errors are empty", () => {
    const prompt = buildClaudePrompt({
      ...BASE_PARAMS,
      buildExitCode: "1",
      buildErrors: "",
    });

    expect(prompt).not.toContain("<build-errors>");
  });

  it("instructs Claude not to change business logic", () => {
    const prompt = buildClaudePrompt(BASE_PARAMS);

    expect(prompt).toContain("Do not change business logic");
  });

  it("wraps release notes in <release-notes> tags", () => {
    const prompt = buildClaudePrompt(BASE_PARAMS);

    expect(prompt).toContain("<release-notes>");
    expect(prompt).toContain("</release-notes>");
  });
});
