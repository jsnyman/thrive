module.exports = {
  root: true,
  env: {
    es2022: true,
    browser: true,
    node: true,
  },
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
  },
  ignorePatterns: ["node_modules/", "dist/", "build/", "coverage/"],
  overrides: [
    {
      files: ["**/*.ts", "**/*.tsx"],
      parser: "@typescript-eslint/parser",
      plugins: ["@typescript-eslint"],
      parserOptions: {
        project: ["./tsconfig.eslint.json"],
        tsconfigRootDir: __dirname,
      },
      extends: [
        "eslint:recommended",
        "plugin:@typescript-eslint/recommended-type-checked",
        "plugin:@typescript-eslint/stylistic-type-checked",
        "prettier",
      ],
    },
    {
      files: ["apps/web/**/*.{js,jsx,ts,tsx}"],
      plugins: ["react", "react-hooks"],
      extends: ["plugin:react/recommended", "plugin:react-hooks/recommended", "prettier"],
      settings: {
        react: { version: "detect" },
      },
      rules: {
        "react/react-in-jsx-scope": "off",
      },
    },
    {
      files: ["**/*.{test,spec}.{js,jsx,ts,tsx}", "**/__tests__/**/*.{js,jsx,ts,tsx}"],
      plugins: ["vitest"],
      env: {
        "vitest/env": true,
      },
    },
  ],
  rules: {
    "no-console": ["warn", { allow: ["warn", "error"] }],
  },
};
