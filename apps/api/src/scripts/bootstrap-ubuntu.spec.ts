import { execFileSync } from "node:child_process";
import * as path from "node:path";

describe("bootstrap-ubuntu.sh", () => {
  it("falls back to getent hosts when ahostsv4 returns no IPv4 records", () => {
    const scriptPath = path.resolve(__dirname, "../../../../deploy/bootstrap-ubuntu.sh");
    const bashCommand = `
      set -euo pipefail
      source "${scriptPath}"
      DOMAIN="shop.example.org"
      getent() {
        if [[ "$1" == "ahostsv4" ]]; then
          return 2
        fi
        if [[ "$1" == "hosts" ]]; then
          printf '203.0.113.10 shop.example.org\n'
          return 0
        fi
        return 1
      }
      get_domain_ipv4
    `;

    const output = execFileSync("bash", ["-lc", bashCommand], {
      encoding: "utf8",
      cwd: path.resolve(__dirname, "../../../.."),
    });

    expect(output.trim()).toBe("203.0.113.10");
  });
});
