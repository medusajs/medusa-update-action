import { jest, describe, it, expect, beforeEach, beforeAll } from "@jest/globals";

let checkExistingPR: typeof import("../../utils/check-existing-pr.js").checkExistingPR;

beforeAll(async () => {
  const m = await import("../../utils/check-existing-pr.js");
  checkExistingPR = m.checkExistingPR;
});

function mockFetch(status: number, body: unknown) {
  global.fetch = jest.fn<typeof fetch>().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response);
}

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.GH_TOKEN;
  delete process.env.GITHUB_REPOSITORY;
  delete process.env.BRANCH_PREFIX;
});

describe("checkExistingPR", () => {
  it("returns false when GH_TOKEN is not set", async () => {
    process.env.GITHUB_REPOSITORY = "org/repo";

    expect(await checkExistingPR("2.5.0")).toBe(false);
  });

  it("returns false when GITHUB_REPOSITORY is not set", async () => {
    process.env.GH_TOKEN = "token";

    expect(await checkExistingPR("2.5.0")).toBe(false);
  });

  it("returns true when an open PR exists for the branch", async () => {
    process.env.GH_TOKEN = "token";
    process.env.GITHUB_REPOSITORY = "org/repo";
    mockFetch(200, [{ number: 42 }]);

    expect(await checkExistingPR("2.5.0")).toBe(true);
  });

  it("returns false when no open PRs exist for the branch", async () => {
    process.env.GH_TOKEN = "token";
    process.env.GITHUB_REPOSITORY = "org/repo";
    mockFetch(200, []);

    expect(await checkExistingPR("2.5.0")).toBe(false);
  });

  it("uses the correct branch name from BRANCH_PREFIX and version", async () => {
    process.env.GH_TOKEN = "token";
    process.env.GITHUB_REPOSITORY = "org/repo";
    process.env.BRANCH_PREFIX = "deps/medusa";
    mockFetch(200, []);

    await checkExistingPR("2.5.0");

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("deps/medusa-2.5.0"),
      expect.any(Object)
    );
  });

  it("defaults BRANCH_PREFIX to chore/update-medusa", async () => {
    process.env.GH_TOKEN = "token";
    process.env.GITHUB_REPOSITORY = "org/repo";
    mockFetch(200, []);

    await checkExistingPR("2.5.0");

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("chore/update-medusa-2.5.0"),
      expect.any(Object)
    );
  });

  it("returns false when the API returns a non-OK response", async () => {
    process.env.GH_TOKEN = "token";
    process.env.GITHUB_REPOSITORY = "org/repo";
    mockFetch(403, null);

    expect(await checkExistingPR("2.5.0")).toBe(false);
  });

  it("returns false when fetch throws", async () => {
    process.env.GH_TOKEN = "token";
    process.env.GITHUB_REPOSITORY = "org/repo";
    global.fetch = jest.fn<typeof fetch>().mockRejectedValue(new Error("network error"));

    expect(await checkExistingPR("2.5.0")).toBe(false);
  });
});
