/** @type {import('jest').Config} */
const config = {
  testPathIgnorePatterns: ["/node_modules/", "/test-store/"],
  preset: "ts-jest/presets/default-esm",
  testEnvironment: "node",
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
  transform: {
    "^.+\\.ts$": ["ts-jest", { useESM: true }],
  },
  // Transform ESM-only packages so jest can process them
  transformIgnorePatterns: [
    "node_modules/(?!(@actions/core|npm-check-updates)/)",
  ],
};

export default config;
