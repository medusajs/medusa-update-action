import { jest, describe, it, expect, beforeEach, beforeAll } from "@jest/globals";
import type { SpawnSyncReturns } from "child_process";

const mockSpawnSync = jest.fn<() => SpawnSyncReturns<string>>();
const mockWriteFileSync = jest.fn();
const mockSetOutput = jest.fn();
const mockError = jest.fn();
const mockInfo = jest.fn();

jest.unstable_mockModule("child_process", () => ({
  spawnSync: mockSpawnSync,
  execSync: jest.fn(),
}));

jest.unstable_mockModule("fs", () => ({
  default: {},
  writeFileSync: mockWriteFileSync,
  readFileSync: jest.fn(),
  existsSync: jest.fn(),
}));

jest.unstable_mockModule("@actions/core", () => ({
  setOutput: mockSetOutput,
  error: mockError,
  info: mockInfo,
  warning: jest.fn(),
  getInput: jest.fn(() => ""),
  setFailed: jest.fn(),
}));

let runBuild: typeof import("../../utils/build-check.js").runBuild;

beforeAll(async () => {
  const m = await import("../../utils/build-check.js");
  runBuild = m.runBuild;
});

const ROOT = "/project";
const PM = "yarn";
const SCRIPT = "build";

function makeSpawnResult(status: number | null, stdout = "", stderr = ""): SpawnSyncReturns<string> {
  return { status, stdout, stderr, pid: 1, output: [], signal: null, error: undefined };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("runBuild", () => {
  it("returns 0 and writes output on success", () => {
    mockSpawnSync.mockReturnValue(makeSpawnResult(0, "Build complete", ""));

    const code = runBuild(ROOT, PM, SCRIPT);

    expect(code).toBe(0);
    expect(mockWriteFileSync).toHaveBeenCalledWith("build-output.txt", "Build complete", "utf-8");
    expect(mockSetOutput).toHaveBeenCalledWith("BUILD_EXIT_CODE", "0");
    expect(mockInfo).toHaveBeenCalledWith(expect.stringContaining("succeeded"));
  });

  it("returns non-zero and calls core.error on failure", () => {
    mockSpawnSync.mockReturnValue(makeSpawnResult(1, "", "Error: Cannot find module"));

    const code = runBuild(ROOT, PM, SCRIPT);

    expect(code).toBe(1);
    expect(mockSetOutput).toHaveBeenCalledWith("BUILD_EXIT_CODE", "1");
    expect(mockError).toHaveBeenCalledWith(expect.stringContaining("Build failed"));
  });

  it("combines stdout and stderr in the output file", () => {
    mockSpawnSync.mockReturnValue(makeSpawnResult(1, "some output", "some error"));

    runBuild(ROOT, PM, SCRIPT);

    const written = mockWriteFileSync.mock.calls[0]?.[1] as string;
    expect(written).toContain("some output");
    expect(written).toContain("some error");
  });

  it("uses exit code 1 when spawnSync status is null", () => {
    mockSpawnSync.mockReturnValue(makeSpawnResult(null));

    const code = runBuild(ROOT, PM, SCRIPT);

    expect(code).toBe(1);
    expect(mockSetOutput).toHaveBeenCalledWith("BUILD_EXIT_CODE", "1");
  });

  it("invokes the correct package manager and script", () => {
    mockSpawnSync.mockReturnValue(makeSpawnResult(0));

    runBuild(ROOT, "pnpm", "plugin:build");

    expect(mockSpawnSync).toHaveBeenCalledWith("pnpm", ["run", "plugin:build"], expect.objectContaining({ cwd: ROOT }));
  });

  it("truncates preview to 100 lines in error log", () => {
    const lines = Array.from({ length: 150 }, (_, i) => `line ${i + 1}`);
    mockSpawnSync.mockReturnValue(makeSpawnResult(1, lines.join("\n"), ""));

    runBuild(ROOT, PM, SCRIPT);

    expect(mockError).toHaveBeenCalledWith(expect.stringContaining("50 more lines"));
  });
});
