import { readFileSync } from "node:fs";
import * as path from "node:path";

describe("Prisma generation enforcement", () => {
  const repoRoot = path.resolve(__dirname, "../../../..");
  const packageJson = JSON.parse(readFileSync(path.join(repoRoot, "package.json"), "utf8")) as {
    scripts: Record<string, string>;
  };
  const ciWorkflow = readFileSync(path.join(repoRoot, ".github", "workflows", "ci.yml"), "utf8");

  it("runs a repo-level Prisma generate step before Prisma-dependent root scripts", () => {
    expect(packageJson.scripts["prisma:generate:root"]).toBe("npm run prisma:generate");
    expect(packageJson.scripts["lint"]).toContain("npm run prisma:generate:root");
    expect(packageJson.scripts["typecheck"]).toContain("npm run prisma:generate:root");
    expect(packageJson.scripts["test:api"]).toContain("npm run prisma:generate:root");
    expect(packageJson.scripts["test:unit"]).toContain("npm run prisma:generate:root");
    expect(packageJson.scripts["build:api"]).toContain("npm run prisma:generate:root");
  });

  it("runs Prisma generation explicitly in CI before lint and build steps", () => {
    expect(ciWorkflow).toContain("name: Generate Prisma client");
    expect(ciWorkflow).toContain("run: npm run prisma:generate:root");
  });
});
