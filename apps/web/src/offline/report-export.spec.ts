import { describe, expect, test, vi } from "vitest";
import { downloadCsv, toCsvString } from "./report-export";

describe("report export", () => {
  test("serializes rows to CSV with stable headers and escaping", () => {
    const csv = toCsvString([
      {
        name: "Jane",
        notes: "Line 1\nLine 2",
        amount: 18.5,
      },
      {
        name: "Doe, John",
        notes: '"quoted"',
        amount: 5,
      },
    ]);

    expect(csv).toBe(
      'name,notes,amount\r\nJane,"Line 1\nLine 2",18.5\r\n"Doe, John","""quoted""",5\r\n',
    );
  });

  test("downloads CSV via object URL and anchor click", () => {
    const createObjectUrl = vi.fn<(blob: Blob) => string>().mockReturnValue("blob:report");
    const revokeObjectUrl = vi.fn<(url: string) => void>();
    const click = vi.fn<() => void>();
    const anchor = document.createElement("a");
    anchor.click = click;

    downloadCsv(
      "report.csv",
      [
        {
          column: "value",
        },
      ],
      {
        createObjectUrl,
        revokeObjectUrl,
        createAnchor: () => anchor,
      },
    );

    expect(createObjectUrl).toHaveBeenCalledTimes(1);
    expect(anchor.download).toBe("report.csv");
    expect(anchor.href).toBe("blob:report");
    expect(click).toHaveBeenCalledTimes(1);
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:report");
  });
});
