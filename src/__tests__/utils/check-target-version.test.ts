import { jest, describe, it, expect, beforeEach, beforeAll } from "@jest/globals";

const mockNcuRun = jest.fn<() => Promise<object>>().mockResolvedValue({});
const mockReadFileSync = jest.fn().mockReturnValue("");
const mockSetFailed = jest.fn();

jest.unstable_mockModule("npm-check-updates", () => ({
  run: mockNcuRun,
}));

jest.unstable_mockModule("fs", () => ({
  default: {},
  readFileSync: mockReadFileSync,
  existsSync: jest.fn(),
  writeFileSync: jest.fn(),
}));

jest.unstable_mockModule("@actions/core", () => ({
  setFailed: mockSetFailed,
  info: jest.fn(),
  warning: jest.fn(),
  error: jest.fn(),
  setOutput: jest.fn(),
  getInput: jest.fn(() => ""),
}));

let checkTargetVersion: typeof import("../../utils/check-target-version.js").checkTargetVersion;

beforeAll(async () => {
  const m = await import("../../utils/check-target-version.js");
  checkTargetVersion = m.checkTargetVersion;
});

const PKG_PATH = "/project/package.json";
const PKG_PATH_2 = "/project/apps/storefront/package.json";

const pkgWithMedusa = JSON.stringify({ dependencies: { "@medusajs/medusa": "^2.4.0" } });

beforeEach(() => {
  jest.clearAllMocks();
  mockNcuRun.mockResolvedValue({});
  mockReadFileSync.mockReturnValue(pkgWithMedusa);
  mockSetFailed.mockReset();
});

describe("checkTargetVersion", () => {
  it("returns currentVersion and targetVersion when upgrades are available", async () => {
    mockNcuRun.mockResolvedValue({ "@medusajs/medusa": "^2.5.0" });

    const result = await checkTargetVersion([PKG_PATH]);

    expect(result).toEqual({ currentVersion: "2.4.0", targetVersion: "2.5.0" });
  });

  it("strips leading range specifiers from both versions", async () => {
    mockNcuRun.mockResolvedValue({ "@medusajs/medusa": "~2.5.0" });

    const result = await checkTargetVersion([PKG_PATH]);

    expect(result?.targetVersion).toBe("2.5.0");
    expect(result?.currentVersion).toBe("2.4.0");
  });

  it("skips @medusajs/ui and returns version from another package", async () => {
    mockNcuRun.mockResolvedValue({ "@medusajs/ui": "^3.0.0", "@medusajs/medusa": "^2.5.0" });

    expect((await checkTargetVersion([PKG_PATH]))?.targetVersion).toBe("2.5.0");
  });

  it("returns null when no upgrades are available", async () => {
    mockNcuRun.mockResolvedValue({});

    expect(await checkTargetVersion([PKG_PATH])).toBeNull();
  });

  it("returns null when only @medusajs/ui has upgrades", async () => {
    mockNcuRun.mockResolvedValue({ "@medusajs/ui": "^3.0.0" });

    expect(await checkTargetVersion([PKG_PATH])).toBeNull();
  });

  it("returns version from second path when first has no upgrades", async () => {
    mockNcuRun
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ "@medusajs/medusa": "^2.5.0" });

    expect((await checkTargetVersion([PKG_PATH, PKG_PATH_2]))?.targetVersion).toBe("2.5.0");
  });

  it("reads currentVersion from the first package.json with a medusa dep", async () => {
    mockReadFileSync.mockReturnValue(JSON.stringify({ dependencies: { "@medusajs/medusa": "2.4.0" } }));
    mockNcuRun.mockResolvedValue({ "@medusajs/medusa": "2.5.0" });

    expect((await checkTargetVersion([PKG_PATH]))?.currentVersion).toBe("2.4.0");
  });

  it("does not pass upgrade:true to ncu", async () => {
    mockNcuRun.mockResolvedValue({ "@medusajs/medusa": "^2.5.0" });

    await checkTargetVersion([PKG_PATH]);

    expect(mockNcuRun).toHaveBeenCalledWith(expect.not.objectContaining({ upgrade: true }));
  });

  describe("specifiedVersion", () => {
    it("returns specifiedVersion as targetVersion without calling ncu", async () => {
      const result = await checkTargetVersion([PKG_PATH], "2.6.0");

      expect(result).toEqual({ currentVersion: "2.4.0", targetVersion: "2.6.0" });
      expect(mockNcuRun).not.toHaveBeenCalled();
    });

    it("calls setFailed and returns null when specifiedVersion equals currentVersion", async () => {
      const result = await checkTargetVersion([PKG_PATH], "2.4.0");

      expect(result).toBeNull();
      expect(mockSetFailed).toHaveBeenCalledWith(expect.stringContaining("not greater than the current version"));
    });

    it("calls setFailed and returns null when specifiedVersion is older than currentVersion", async () => {
      const result = await checkTargetVersion([PKG_PATH], "2.3.0");

      expect(result).toBeNull();
      expect(mockSetFailed).toHaveBeenCalledWith(expect.stringContaining("not greater than the current version"));
    });

    it("succeeds when specifiedVersion is greater than currentVersion", async () => {
      const result = await checkTargetVersion([PKG_PATH], "2.5.0");

      expect(result).toEqual({ currentVersion: "2.4.0", targetVersion: "2.5.0" });
      expect(mockSetFailed).not.toHaveBeenCalled();
    });

    it("allows specifiedVersion when currentVersion is empty", async () => {
      mockReadFileSync.mockReturnValue(JSON.stringify({ dependencies: { "some-other-pkg": "^1.0.0" } }));

      const result = await checkTargetVersion([PKG_PATH], "2.5.0");

      expect(result).toEqual({ currentVersion: "", targetVersion: "2.5.0" });
    });
  });
});
