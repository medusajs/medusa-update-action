import { runBuild } from "./utils/build-check.js";

const rootDir = process.env.WORKING_DIRECTORY || process.cwd();
const packageManager = process.env.PACKAGE_MANAGER || "npm";
const buildScriptName = process.env.BUILD_SCRIPT_NAME || "build";

runBuild(rootDir, packageManager, buildScriptName);
