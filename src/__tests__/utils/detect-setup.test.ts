import { jest, describe, it, expect, beforeEach, beforeAll } from "@jest/globals";

// Create mock functions before unstable_mockModule so factories can close over them
const mockExistsSync = jest.fn<(p: string) => boolean>().mockReturnValue(false);
const mockReadFileSync = jest.fn().mockReturnValue("");
const mockReaddirSync = jest.fn<() => import("fs").Dirent[]>().mockReturnValue([]);

const mockSetOutput = jest.fn();
const mockSetFailed = jest.fn();
const mockInfo = jest.fn();
const mockWarning = jest.fn();

jest.unstable_mockModule("fs", () => ({
  default: {},
  existsSync: mockExistsSync,
  readFileSync: mockReadFileSync,
  readdirSync: mockReaddirSync,
  writeFileSync: jest.fn(),
}));

jest.unstable_mockModule("@actions/core", () => ({
  setOutput: mockSetOutput,
  setFailed: mockSetFailed,
  info: mockInfo,
  warning: mockWarning,
  error: jest.fn(),
  getInput: jest.fn(() => ""),
}));

let detectSetup: typeof import("../../utils/detect-setup.js").detectSetup;

beforeAll(async () => {
  const m = await import("../../utils/detect-setup.js");
  detectSetup = m.detectSetup;
});

const ROOT = "/project";

const pkgWithMedusa = JSON.stringify({ dependencies: { "@medusajs/medusa": "^2.0.0" } });
const pkgWithoutMedusa = JSON.stringify({ dependencies: { express: "^4.0.0" } });

beforeEach(() => {
  jest.clearAllMocks();
  mockExistsSync.mockReturnValue(false);
});

describe("detectSetup", () => {
  describe("package manager detection", () => {
    it("detects pnpm from pnpm-lock.yaml", () => {
      mockExistsSync.mockImplementation((p) => p === `${ROOT}/pnpm-lock.yaml` || p === `${ROOT}/package.json`);
      mockReadFileSync.mockReturnValue(pkgWithMedusa);

      expect(detectSetup(ROOT, "apps")?.packageManager).toBe("pnpm");
    });

    it("detects yarn from yarn.lock", () => {
      mockExistsSync.mockImplementation((p) => p === `${ROOT}/yarn.lock` || p === `${ROOT}/package.json`);
      mockReadFileSync.mockReturnValue(pkgWithMedusa);

      expect(detectSetup(ROOT, "apps")?.packageManager).toBe("yarn");
    });

    it("falls back to npm when no lock file found", () => {
      mockExistsSync.mockImplementation((p) => p === `${ROOT}/package.json`);
      mockReadFileSync.mockReturnValue(pkgWithMedusa);

      expect(detectSetup(ROOT, "apps")?.packageManager).toBe("npm");
    });

    it("prefers pnpm over yarn when both lock files exist", () => {
      mockExistsSync.mockImplementation((p) =>
        [`${ROOT}/pnpm-lock.yaml`, `${ROOT}/yarn.lock`, `${ROOT}/package.json`].includes(p as string)
      );
      mockReadFileSync.mockReturnValue(pkgWithMedusa);

      expect(detectSetup(ROOT, "apps")?.packageManager).toBe("pnpm");
    });
  });

  describe("monorepo detection", () => {
    it("detects monorepo from pnpm-workspace.yaml and scans apps directory", () => {
      mockExistsSync.mockImplementation((p) =>
        [`${ROOT}/pnpm-workspace.yaml`, `${ROOT}/apps`, `${ROOT}/apps/backend/package.json`].includes(p as string)
      );
      mockReaddirSync.mockReturnValue([{ name: "backend", isDirectory: () => true } as unknown as import("fs").Dirent]);
      mockReadFileSync.mockReturnValue(pkgWithMedusa);

      const result = detectSetup(ROOT, "apps");

      expect(result?.medusaPkgPaths).toContain(`${ROOT}/apps/backend/package.json`);
    });

    it("detects monorepo from turbo.json", () => {
      mockExistsSync.mockImplementation((p) =>
        [`${ROOT}/turbo.json`, `${ROOT}/apps`, `${ROOT}/apps/backend/package.json`, `${ROOT}/package.json`].includes(p as string)
      );
      mockReaddirSync.mockReturnValue([{ name: "backend", isDirectory: () => true } as unknown as import("fs").Dirent]);
      mockReadFileSync.mockImplementation((p) =>
        p === `${ROOT}/package.json`
          ? JSON.stringify({ scripts: { build: "turbo build" } })
          : pkgWithMedusa
      );

      expect(detectSetup(ROOT, "apps")?.medusaPkgPaths).toContain(`${ROOT}/apps/backend/package.json`);
    });

    it("detects monorepo from workspaces field in package.json", () => {
      mockExistsSync.mockImplementation((p) =>
        [`${ROOT}/package.json`, `${ROOT}/apps`, `${ROOT}/apps/backend/package.json`].includes(p as string)
      );
      mockReaddirSync.mockReturnValue([{ name: "backend", isDirectory: () => true } as unknown as import("fs").Dirent]);
      mockReadFileSync.mockImplementation((p) =>
        p === `${ROOT}/package.json` ? JSON.stringify({ workspaces: ["apps/*"] }) : pkgWithMedusa
      );

      expect(detectSetup(ROOT, "apps")?.medusaPkgPaths).toContain(`${ROOT}/apps/backend/package.json`);
    });

    it("uses configurable apps directory", () => {
      mockExistsSync.mockImplementation((p) =>
        [`${ROOT}/pnpm-workspace.yaml`, `${ROOT}/packages`, `${ROOT}/packages/backend/package.json`].includes(p as string)
      );
      mockReaddirSync.mockReturnValue([{ name: "backend", isDirectory: () => true } as unknown as import("fs").Dirent]);
      mockReadFileSync.mockReturnValue(pkgWithMedusa);

      expect(detectSetup(ROOT, "packages")?.medusaPkgPaths).toContain(`${ROOT}/packages/backend/package.json`);
    });

    it("calls setFailed and returns null when apps directory does not exist", () => {
      mockExistsSync.mockImplementation((p) => p === `${ROOT}/pnpm-workspace.yaml`);

      expect(detectSetup(ROOT, "apps")).toBeNull();
      expect(mockSetFailed).toHaveBeenCalledWith(expect.stringContaining("No package.json files"));
    });
  });

  describe("standalone project", () => {
    it("returns root package.json when it has medusa deps", () => {
      mockExistsSync.mockImplementation((p) => p === `${ROOT}/package.json`);
      mockReadFileSync.mockReturnValue(pkgWithMedusa);

      expect(detectSetup(ROOT, "apps")?.medusaPkgPaths).toEqual([`${ROOT}/package.json`]);
    });

    it("returns null and calls setFailed when no medusa deps found", () => {
      mockExistsSync.mockImplementation((p) => p === `${ROOT}/package.json`);
      mockReadFileSync.mockReturnValue(pkgWithoutMedusa);

      expect(detectSetup(ROOT, "apps")).toBeNull();
      expect(mockSetFailed).toHaveBeenCalledWith(expect.stringContaining("No package.json files"));
    });

    it("skips apps without medusa deps in monorepo", () => {
      mockExistsSync.mockImplementation((p) =>
        [`${ROOT}/pnpm-workspace.yaml`, `${ROOT}/apps`, `${ROOT}/apps/backend/package.json`, `${ROOT}/apps/storefront/package.json`].includes(p as string)
      );
      mockReaddirSync.mockReturnValue([
        { name: "backend", isDirectory: () => true } as unknown as import("fs").Dirent,
        { name: "storefront", isDirectory: () => true } as unknown as import("fs").Dirent,
      ]);
      mockReadFileSync.mockImplementation((p) =>
        p === `${ROOT}/apps/backend/package.json` ? pkgWithMedusa : pkgWithoutMedusa
      );

      expect(detectSetup(ROOT, "apps")?.medusaPkgPaths).toEqual([`${ROOT}/apps/backend/package.json`]);
    });
  });

  describe("build script detection", () => {
    it("uses 'build' when root package.json has a build script", () => {
      mockExistsSync.mockImplementation((p) => p === `${ROOT}/package.json`);
      mockReadFileSync.mockReturnValue(
        JSON.stringify({ scripts: { build: "tsc" }, dependencies: { "@medusajs/medusa": "^2.0.0" } })
      );

      expect(detectSetup(ROOT, "apps")?.buildScriptName).toBe("build");
    });

    it("falls back to 'build' when no build script is found", () => {
      mockExistsSync.mockImplementation((p) => p === `${ROOT}/package.json`);
      mockReadFileSync.mockReturnValue(JSON.stringify({ dependencies: { "@medusajs/medusa": "^2.0.0" } }));

      expect(detectSetup(ROOT, "apps")?.buildScriptName).toBe("build");
    });

    it("returns 'build' (not the script body) for turbo monorepos", () => {
      mockExistsSync.mockImplementation((p) =>
        [`${ROOT}/turbo.json`, `${ROOT}/package.json`, `${ROOT}/apps`, `${ROOT}/apps/backend/package.json`].includes(p as string)
      );
      mockReaddirSync.mockReturnValue([{ name: "backend", isDirectory: () => true } as unknown as import("fs").Dirent]);
      mockReadFileSync.mockImplementation((p) =>
        p === `${ROOT}/package.json`
          ? JSON.stringify({ scripts: { build: "pnpm -r build" } })
          : pkgWithMedusa
      );

      expect(detectSetup(ROOT, "apps")?.buildScriptName).toBe("build");
    });
  });

  describe("outputs", () => {
    it("sets PACKAGE_MANAGER, BUILD_SCRIPT_NAME, and PKGJSON_PATHS on success", () => {
      mockExistsSync.mockImplementation((p) => p === `${ROOT}/package.json`);
      mockReadFileSync.mockReturnValue(pkgWithMedusa);

      detectSetup(ROOT, "apps");

      expect(mockSetOutput).toHaveBeenCalledWith("PACKAGE_MANAGER", expect.any(String));
      expect(mockSetOutput).toHaveBeenCalledWith("BUILD_SCRIPT_NAME", expect.any(String));
      expect(mockSetOutput).toHaveBeenCalledWith("PKGJSON_PATHS", expect.any(String));
    });
  });
});
