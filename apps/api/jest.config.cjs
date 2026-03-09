module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  rootDir: ".",
  testMatch: ["<rootDir>/src/**/*.spec.ts", "<rootDir>/src/**/*.test.ts"],
  coverageThreshold: {
    global: {
      branches: 45,
      functions: 75,
      lines: 65,
      statements: 65,
    },
  },
  moduleFileExtensions: ["ts", "js", "json"],
  transform: {
    "^.+\\.(t|j)sx?$": ["ts-jest", { tsconfig: "<rootDir>/tsconfig.json" }],
  },
};
