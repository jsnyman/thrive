export type CsvCell = string | number | boolean | null | undefined;
export type CsvRow = Record<string, CsvCell>;

const escapeCsvCell = (value: CsvCell): string => {
  if (value === null || value === undefined) {
    return "";
  }
  const text = String(value);
  if (text.includes(",") || text.includes('"') || text.includes("\n") || text.includes("\r")) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
};

export const toCsvString = (rows: CsvRow[]): string => {
  if (rows.length === 0) {
    return "";
  }
  const headers: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!seen.has(key)) {
        seen.add(key);
        headers.push(key);
      }
    }
  }
  const lines = [
    headers.map((header) => escapeCsvCell(header)).join(","),
    ...rows.map((row) => headers.map((header) => escapeCsvCell(row[header])).join(",")),
  ];
  return `${lines.join("\r\n")}\r\n`;
};

export const downloadCsv = (
  filename: string,
  rows: CsvRow[],
  dependencies?: {
    createObjectUrl?: (blob: Blob) => string;
    revokeObjectUrl?: (url: string) => void;
    createAnchor?: () => HTMLAnchorElement;
  },
): void => {
  if (rows.length === 0) {
    return;
  }
  const csv = toCsvString(rows);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const createObjectUrl =
    dependencies?.createObjectUrl ?? ((input: Blob) => URL.createObjectURL(input));
  const revokeObjectUrl =
    dependencies?.revokeObjectUrl ?? ((url: string) => URL.revokeObjectURL(url));
  const createAnchor = dependencies?.createAnchor ?? (() => document.createElement("a"));
  const objectUrl = createObjectUrl(blob);
  const anchor = createAnchor();
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  revokeObjectUrl(objectUrl);
};
