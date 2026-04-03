import { jest, describe, it, expect, beforeEach, beforeAll } from "@jest/globals";
import type { SpawnSyncReturns } from "child_process";

const mockReadFileSync = jest.fn().mockReturnValue("");
const mockExistsSync = jest.fn<(p: string) => boolean>().mockReturnValue(false);
const mockSpawnSync = jest.fn<() => SpawnSyncReturns<string>>();
const mockNcuRun = jest.fn<() => Promise<object>>().mockResolvedValue({});
const mockSetOutput = jest.fn();
const mockSetFailed = jest.fn();

jest.unstable_mockModule("fs", () => ({
  default: {},
  readFileSync: mockReadFileSync,
  writeFileSync: jest.fn(),
  existsSync: mockExistsSync,
}));

jest.unstable_mockModule("child_process", () => ({
  spawnSync: mockSpawnSync,
  execSync: jest.fn(),
}));

jest.unstable_mockModule("npm-check-updates", () => ({
  run: mockNcuRun,
}));

jest.unstable_mockModule("@actions/core", () => ({
  setOutput: mockSetOutput,
  setFailed: mockSetFailed,
  info: jest.fn(),
  warning: jest.fn(),
  error: jest.fn(),
  getInput: jest.fn(() => ""),
}));

let updatePackages: typeof import("../../utils/update-packages.js").updatePackages;

beforeAll(async () => {
  const m = await import("../../utils/update-packages.js");
  updatePackages = m.updatePackages;
});

const ROOT = "/project";
const PKG_PATH = `${ROOT}/package.json`;

const pkgBefore = JSON.stringify({ dependencies: { "@medusajs/medusa": "^2.4.0" } });
const pkgAfter = JSON.stringify({ dependencies: { "@medusajs/medusa": "^2.5.0" } });

function makeSpawnResult(status = 0): SpawnSyncReturns<string> {
  return { status, stdout: "", stderr: "", pid: 1, output: [], signal: null, error: undefined };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockNcuRun.mockResolvedValue({});
  mockSpawnSync.mockReturnValue(makeSpawnResult(0));
});

describe("updatePackages", () => {
  it("returns noChanges=true when files were not modified by ncu", async () => {
    mockReadFileSync.mockReturnValue(pkgBefore);

    const result = await updatePackages(ROOT, "yarn", [PKG_PATH]);

    expect(result.noChanges).toBe(true);
    expect(mockSetOutput).toHaveBeenCalledWith("NO_CHANGES", "true");
  });

  it("returns updated version and noChanges=false when packages were bumped", async () => {
    mockReadFileSync
      .mockReturnValueOnce(pkgBefore)  // read before ncu
      .mockReturnValue(pkgAfter);      // read after ncu + getMedusaVersion

    const result = await updatePackages(ROOT, "yarn", [PKG_PATH]);

    expect(result.noChanges).toBe(false);
    expect(result.updatedVersion).toBe("2.5.0");
    expect(mockSetOutput).toHaveBeenCalledWith("UPDATED_VERSION", "2.5.0");
  });

  it("runs install with the correct package manager after update", async () => {
    mockReadFileSync
      .mockReturnValueOnce(pkgBefore)
      .mockReturnValue(pkgAfter);

    await updatePackages(ROOT, "npm", [PKG_PATH]);

    expect(mockSpawnSync).toHaveBeenCalledWith("npm", ["install"], expect.objectContaining({ cwd: ROOT }));
  });

  it("passes --no-frozen-lockfile for pnpm", async () => {
    mockReadFileSync
      .mockReturnValueOnce(pkgBefore)
      .mockReturnValue(pkgAfter);

    await updatePackages(ROOT, "pnpm", [PKG_PATH]);

    expect(mockSpawnSync).toHaveBeenCalledWith("pnpm", ["install", "--no-frozen-lockfile"], expect.objectContaining({ cwd: ROOT }));
  });

  it("calls setFailed when install fails", async () => {
    mockReadFileSync
      .mockReturnValueOnce(pkgBefore)
      .mockReturnValue(pkgAfter);
    mockSpawnSync.mockReturnValue(makeSpawnResult(1));

    await updatePackages(ROOT, "yarn", [PKG_PATH]);

    expect(mockSetFailed).toHaveBeenCalledWith(expect.stringContaining("install failed"));
  });

  it("processes multiple package.json paths", async () => {
    const pkgPath2 = `${ROOT}/apps/storefront/package.json`;
    mockReadFileSync
      .mockReturnValueOnce(pkgBefore).mockReturnValueOnce(pkgAfter)  // pkg1 before/after
      .mockReturnValueOnce(pkgBefore).mockReturnValueOnce(pkgAfter)  // pkg2 before/after
      .mockReturnValue(pkgAfter);                                     // getMedusaVersion reads

    const result = await updatePackages(ROOT, "yarn", [PKG_PATH, pkgPath2]);

    expect(mockNcuRun).toHaveBeenCalledTimes(2);
    expect(result.noChanges).toBe(false);
  });

  describe("yarn berry install", () => {
    it("passes --no-immutable when .yarnrc.yml exists", async () => {
      mockReadFileSync
        .mockReturnValueOnce(pkgBefore)
        .mockReturnValue(pkgAfter);
      mockExistsSync.mockImplementation((p) => p === `${ROOT}/.yarnrc.yml`);

      await updatePackages(ROOT, "yarn", [PKG_PATH]);

      expect(mockSpawnSync).toHaveBeenCalledWith(
        "yarn",
        ["install", "--no-immutable"],
        expect.objectContaining({ cwd: ROOT })
      );
    });

    it("does not pass --no-immutable for yarn classic (no .yarnrc.yml)", async () => {
      mockReadFileSync
        .mockReturnValueOnce(pkgBefore)
        .mockReturnValue(pkgAfter);
      mockExistsSync.mockReturnValue(false);

      await updatePackages(ROOT, "yarn", [PKG_PATH]);

      expect(mockSpawnSync).toHaveBeenCalledWith(
        "yarn",
        ["install"],
        expect.objectContaining({ cwd: ROOT })
      );
    });
  });

  it("returns empty updatedVersion when only @medusajs/ui is present", async () => {
    const pkgUiOnly = JSON.stringify({ dependencies: { "@medusajs/ui": "^3.0.0" } });
    mockReadFileSync
      .mockReturnValueOnce(pkgBefore)  // before ncu (different content → triggers changed)
      .mockReturnValue(pkgUiOnly);     // after ncu + getMedusaVersion reads (ui only → skipped)

    const result = await updatePackages(ROOT, "yarn", [PKG_PATH]);

    expect(result.updatedVersion).toBe("");
  });
});
