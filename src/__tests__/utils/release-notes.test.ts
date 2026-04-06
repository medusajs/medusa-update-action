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

const CURRENT = "2.4.0";
const TARGET = "2.5.0";

function makeRelease(version: string, body = `notes for ${version}`) {
  return {
    tag_name: `v${version}`,
    html_url: `https://github.com/medusajs/medusa/releases/tag/v${version}`,
    body,
  };
}

function mockPages(pages: object[][]) {
  let call = 0;
  global.fetch = jest.fn<typeof fetch>().mockImplementation(() => {
    const body = pages[call] ?? [];
    call++;
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(body),
    } as Response);
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("fetchAndSaveReleaseNotes", () => {
  it("collects only the target release when one version behind", async () => {
    mockPages([[makeRelease("2.5.0"), makeRelease("2.4.0"), makeRelease("2.3.0")]]);

    await fetchAndSaveReleaseNotes(CURRENT, TARGET);

    const written = mockWriteFileSync.mock.calls[0][1] as string;
    expect(written).toContain("v2.5.0");
    expect(written).not.toContain("v2.4.0");
    expect(written).not.toContain("v2.3.0");
  });

  it("collects all releases between current and target across multiple pages", async () => {
    mockPages([
      [makeRelease("2.5.0"), makeRelease("2.4.9"), makeRelease("2.4.8"),
       makeRelease("2.4.7"), makeRelease("2.4.6"), makeRelease("2.4.5"),
       makeRelease("2.4.4"), makeRelease("2.4.3"), makeRelease("2.4.2"), makeRelease("2.4.1")],
      [makeRelease("2.4.0"), makeRelease("2.3.9")],
    ]);

    await fetchAndSaveReleaseNotes(CURRENT, TARGET);

    const written = mockWriteFileSync.mock.calls[0][1] as string;
    expect(written).toContain("v2.5.0");
    expect(written).toContain("v2.4.1");
    expect(written).not.toContain("v2.4.0");
    expect(written).not.toContain("v2.3.9");
  });

  it("skips releases newer than target", async () => {
    mockPages([[makeRelease("2.6.0"), makeRelease("2.5.0"), makeRelease("2.4.0")]]);

    await fetchAndSaveReleaseNotes(CURRENT, TARGET);

    const written = mockWriteFileSync.mock.calls[0][1] as string;
    expect(written).not.toContain("v2.6.0");
    expect(written).toContain("v2.5.0");
  });

  it("collects only the target when no currentVersion provided", async () => {
    mockPages([[makeRelease("2.5.0"), makeRelease("2.4.9")]]);

    await fetchAndSaveReleaseNotes("", TARGET);

    const written = mockWriteFileSync.mock.calls[0][1] as string;
    expect(written).toContain("v2.5.0");
    expect(written).not.toContain("v2.4.9");
  });

  it("includes each release URL in the content", async () => {
    mockPages([[makeRelease("2.5.0"), makeRelease("2.4.9"), makeRelease("2.4.0")]]);

    await fetchAndSaveReleaseNotes(CURRENT, TARGET);

    const written = mockWriteFileSync.mock.calls[0][1] as string;
    expect(written).toContain("https://github.com/medusajs/medusa/releases/tag/v2.5.0");
    expect(written).toContain("https://github.com/medusajs/medusa/releases/tag/v2.4.9");
  });

  it("sets RELEASE_NOTES_URL to the target release URL", async () => {
    mockPages([[makeRelease("2.5.0"), makeRelease("2.4.0")]]);

    await fetchAndSaveReleaseNotes(CURRENT, TARGET);

    expect(mockSetOutput).toHaveBeenCalledWith(
      "RELEASE_NOTES_URL",
      "https://github.com/medusajs/medusa/releases/tag/v2.5.0"
    );
  });

  it("detects breaking changes across any release", async () => {
    mockPages([[
      makeRelease("2.5.0", "Normal changes"),
      makeRelease("2.4.9", "## Breaking Change: removed old API"),
      makeRelease("2.4.0"),
    ]]);

    await fetchAndSaveReleaseNotes(CURRENT, TARGET);

    expect(mockSetOutput).toHaveBeenCalledWith("HAS_BREAKING_CHANGES", "true");
  });

  it("sets HAS_BREAKING_CHANGES to false when no breaking changes", async () => {
    mockPages([[makeRelease("2.5.0", "Just a fix"), makeRelease("2.4.0")]]);

    await fetchAndSaveReleaseNotes(CURRENT, TARGET);

    expect(mockSetOutput).toHaveBeenCalledWith("HAS_BREAKING_CHANGES", "false");
  });

  it("warns and writes empty file on non-OK response", async () => {
    global.fetch = jest.fn<typeof fetch>().mockResolvedValue({
      ok: false, status: 403, json: () => Promise.resolve(null),
    } as Response);

    await fetchAndSaveReleaseNotes(CURRENT, TARGET);

    expect(mockWarning).toHaveBeenCalledWith(expect.stringContaining("403"));
    expect(mockWriteFileSync).toHaveBeenCalledWith("/tmp/release-notes.md", "(No release notes found)", "utf-8");
    expect(mockSetOutput).toHaveBeenCalledWith("RELEASE_NOTES_URL", `https://github.com/medusajs/medusa/releases/tag/v${TARGET}`);
  });

  it("handles fetch errors gracefully", async () => {
    global.fetch = jest.fn<typeof fetch>().mockRejectedValue(new Error("network error"));

    await fetchAndSaveReleaseNotes(CURRENT, TARGET);

    expect(mockWarning).toHaveBeenCalledWith(expect.stringContaining("network error"));
    expect(mockWriteFileSync).toHaveBeenCalledWith("/tmp/release-notes.md", "", "utf-8");
    expect(mockSetOutput).toHaveBeenCalledWith("HAS_BREAKING_CHANGES", "false");
  });

  it("writes fallback text when no releases found", async () => {
    mockPages([[makeRelease("2.3.0")]]);  // target not in results

    await fetchAndSaveReleaseNotes(CURRENT, TARGET);

    expect(mockWriteFileSync).toHaveBeenCalledWith("/tmp/release-notes.md", "(No release notes found)", "utf-8");
  });

  it("includes Authorization header when GH_TOKEN is set", async () => {
    process.env.GH_TOKEN = "test-token";
    mockPages([[makeRelease("2.5.0"), makeRelease("2.4.0")]]);

    await fetchAndSaveReleaseNotes(CURRENT, TARGET);

    const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
    expect(fetchCall[1].headers["Authorization"]).toBe("Bearer test-token");
    delete process.env.GH_TOKEN;
  });

  it("omits Authorization header when GH_TOKEN is not set", async () => {
    delete process.env.GH_TOKEN;
    mockPages([[makeRelease("2.5.0"), makeRelease("2.4.0")]]);

    await fetchAndSaveReleaseNotes(CURRENT, TARGET);

    const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
    expect(fetchCall[1].headers["Authorization"]).toBeUndefined();
  });
});
