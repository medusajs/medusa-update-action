import { jest, describe, it, expect, beforeEach, beforeAll } from "@jest/globals";

const mockWriteFileSync = jest.fn();
const mockSetOutput = jest.fn();
const mockWarning = jest.fn();

jest.unstable_mockModule("fs", () => ({
  default: {},
  writeFileSync: mockWriteFileSync,
  readFileSync: jest.fn(),
  existsSync: jest.fn(),
}));

jest.unstable_mockModule("@actions/core", () => ({
  setOutput: mockSetOutput,
  warning: mockWarning,
  info: jest.fn(),
  error: jest.fn(),
  getInput: jest.fn(() => ""),
  setFailed: jest.fn(),
}));

let fetchAndSaveReleaseNotes: typeof import("../../utils/release-notes.js").fetchAndSaveReleaseNotes;

beforeAll(async () => {
  const m = await import("../../utils/release-notes.js");
  fetchAndSaveReleaseNotes = m.fetchAndSaveReleaseNotes;
});

const VERSION = "2.5.0";
const HTML_URL = `https://github.com/medusajs/medusa/releases/tag/v${VERSION}`;

function mockFetch(status: number, body: object | null) {
  global.fetch = jest.fn<typeof fetch>().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response);
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("fetchAndSaveReleaseNotes", () => {
  it("writes release notes body and sets outputs on success", async () => {
    const body = "## What's Changed\n\n* fix: something cool";
    mockFetch(200, { html_url: HTML_URL, body });

    await fetchAndSaveReleaseNotes(VERSION);

    expect(mockWriteFileSync).toHaveBeenCalledWith("release-notes.md", body, "utf-8");
    expect(mockSetOutput).toHaveBeenCalledWith("RELEASE_NOTES_URL", HTML_URL);
    expect(mockSetOutput).toHaveBeenCalledWith("HAS_BREAKING_CHANGES", "false");
  });

  it("detects breaking changes in release body", async () => {
    mockFetch(200, { html_url: HTML_URL, body: "## Breaking Changes\n\n* Renamed `createCart`" });

    await fetchAndSaveReleaseNotes(VERSION);

    expect(mockSetOutput).toHaveBeenCalledWith("HAS_BREAKING_CHANGES", "true");
  });

  it("detects breaking changes case-insensitively", async () => {
    mockFetch(200, { html_url: HTML_URL, body: "### BREAKING CHANGE: old API removed" });

    await fetchAndSaveReleaseNotes(VERSION);

    expect(mockSetOutput).toHaveBeenCalledWith("HAS_BREAKING_CHANGES", "true");
  });

  it("writes fallback text when release body is empty", async () => {
    mockFetch(200, { html_url: HTML_URL, body: "" });

    await fetchAndSaveReleaseNotes(VERSION);

    expect(mockWriteFileSync).toHaveBeenCalledWith("release-notes.md", "(No release notes found)", "utf-8");
  });

  it("warns and writes empty file on non-OK response", async () => {
    mockFetch(404, null);

    await fetchAndSaveReleaseNotes(VERSION);

    expect(mockWarning).toHaveBeenCalledWith(expect.stringContaining("404"));
    expect(mockWriteFileSync).toHaveBeenCalledWith("release-notes.md", "(No release notes found)", "utf-8");
    expect(mockSetOutput).toHaveBeenCalledWith("RELEASE_NOTES_URL", `https://github.com/medusajs/medusa/releases/tag/v${VERSION}`);
    expect(mockSetOutput).toHaveBeenCalledWith("HAS_BREAKING_CHANGES", "false");
  });

  it("handles fetch errors gracefully", async () => {
    global.fetch = jest.fn<typeof fetch>().mockRejectedValue(new Error("network error"));

    await fetchAndSaveReleaseNotes(VERSION);

    expect(mockWarning).toHaveBeenCalledWith(expect.stringContaining("network error"));
    expect(mockWriteFileSync).toHaveBeenCalledWith("release-notes.md", "", "utf-8");
    expect(mockSetOutput).toHaveBeenCalledWith("HAS_BREAKING_CHANGES", "false");
  });

  it("uses html_url from API response for RELEASE_NOTES_URL", async () => {
    mockFetch(200, { html_url: HTML_URL, body: "some notes" });

    await fetchAndSaveReleaseNotes(VERSION);

    expect(mockSetOutput).toHaveBeenCalledWith("RELEASE_NOTES_URL", HTML_URL);
  });
});
