import { describe, expect, test } from "vitest";
import { utils, write } from "xlsx";
import { parseEventImport } from "../apps/mobile/src/lib/event-import";

const headers = ["Date", "Start Time", "End Time", "Title", "Venue", "Word", "Worship", "Remarks"];

function workbookBytes(rows: unknown[][]) {
  const workbook = utils.book_new();
  utils.book_append_sheet(workbook, utils.aoa_to_sheet([headers, ...rows]), "Events");
  return write(workbook, { bookType: "xlsx", type: "array", cellDates: true }) as ArrayBuffer;
}

describe("event import parsing", () => {
  test("reads the normalized XLSX headers and Excel date/time cells", () => {
    const preview = parseEventImport(workbookBytes([
      [new Date(2026, 6, 18), 14 / 24, 16 / 24, "Prayer Altar", "Raintree", "", "", "Quiet arrival"],
    ]), "events.xlsx");

    expect(preview.rows).toHaveLength(1);
    expect(preview.rows[0].errors).toEqual([]);
    expect(preview.rows[0].event).toMatchObject({
      title: "Prayer Altar",
      venue: "Raintree",
      remarks: "Quiet arrival",
      startAt: Date.UTC(2026, 6, 18, 6, 0),
      endAt: Date.UTC(2026, 6, 18, 8, 0),
    });
  });

  test("reads quoted CSV values and reports missing required times", () => {
    const validCsv = [
      headers.join(","),
      '2026-08-01,14:30,16:30,Cell Group,"Home, Level 2",Alice,Bob,"Bring snacks, if able"',
    ].join("\n");
    const valid = parseEventImport(new TextEncoder().encode(validCsv).buffer as ArrayBuffer, "events.csv");
    expect(valid.rows[0].event).toMatchObject({
      venue: "Home, Level 2",
      remarks: "Bring snacks, if able",
      startAt: Date.UTC(2026, 7, 1, 6, 30),
    });

    const invalidCsv = [headers.join(","), "2026-11-28,,,Active CG,,,,Time TBD"].join("\n");
    const invalid = parseEventImport(new TextEncoder().encode(invalidCsv).buffer as ArrayBuffer, "events.csv");
    expect(invalid.rows[0].event).toBeNull();
    expect(invalid.rows[0].errors).toEqual(["Start Time is required.", "End Time is required."]);
  });
});
