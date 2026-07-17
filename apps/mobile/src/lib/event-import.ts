import { read, SSF, utils } from 'xlsx';

export const EVENT_IMPORT_HEADERS = [
  'Date',
  'Start Time',
  'End Time',
  'Title',
  'Venue',
  'Word',
  'Worship',
  'Remarks',
] as const;

export const MAX_EVENT_IMPORT_ROWS = 100;
export const MAX_EVENT_IMPORT_FILE_BYTES = 5 * 1024 * 1024;

export type EventImportSource = 'csv' | 'xlsx';

export type EventImportInput = {
  sourceRow: number;
  title: string;
  venue: string;
  word: string;
  worship: string;
  remarks: string;
  startAt: number;
  endAt: number;
};

export type EventImportPreviewRow = {
  sourceRow: number;
  title: string;
  dateLabel: string;
  timeLabel: string;
  event: EventImportInput | null;
  errors: string[];
  warnings: string[];
};

export type EventImportPreview = {
  fileName: string;
  sourceType: EventImportSource;
  sheetName: string;
  rows: EventImportPreviewRow[];
};

type DateParts = { year: number; month: number; day: number };
type TimeParts = { hour: number; minute: number };

const HEADER_KEYS = EVENT_IMPORT_HEADERS.map(normalizeHeader);
const SINGAPORE_OFFSET_HOURS = 8;
const MAX_XLSX_UNCOMPRESSED_BYTES = 20 * 1024 * 1024;
const MAX_XLSX_ENTRY_BYTES = 10 * 1024 * 1024;
const MAX_XLSX_ENTRIES = 250;

function validateXlsxArchive(data: ArrayBuffer) {
  const view = new DataView(data);
  const minimumEndRecordSize = 22;
  const maximumCommentSize = 65_535;
  const searchStart = Math.max(0, view.byteLength - minimumEndRecordSize - maximumCommentSize);
  let endRecordOffset = -1;

  for (let offset = view.byteLength - minimumEndRecordSize; offset >= searchStart; offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) {
      endRecordOffset = offset;
      break;
    }
  }
  if (endRecordOffset < 0) throw new Error('This XLSX file is not a valid spreadsheet archive.');

  const entryCount = view.getUint16(endRecordOffset + 10, true);
  const centralDirectoryOffset = view.getUint32(endRecordOffset + 16, true);
  if (entryCount === 0xffff) throw new Error('This XLSX file is too large to import.');
  if (entryCount > MAX_XLSX_ENTRIES) throw new Error('This XLSX file contains too many internal files.');

  let cursor = centralDirectoryOffset;
  let totalUncompressed = 0;
  for (let index = 0; index < entryCount; index += 1) {
    if (cursor + 46 > view.byteLength || view.getUint32(cursor, true) !== 0x02014b50) {
      throw new Error('This XLSX file has an invalid archive structure.');
    }

    const compressedSize = view.getUint32(cursor + 20, true);
    const uncompressedSize = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    totalUncompressed += uncompressedSize;

    if (uncompressedSize > MAX_XLSX_ENTRY_BYTES || totalUncompressed > MAX_XLSX_UNCOMPRESSED_BYTES) {
      throw new Error('This XLSX file expands beyond the safe import limit.');
    }
    if (compressedSize > 0 && uncompressedSize / compressedSize > 200) {
      throw new Error('This XLSX file has an unsafe compression ratio.');
    }

    cursor += 46 + nameLength + extraLength + commentLength;
  }
}

function normalizeHeader(value: string) {
  return value.replace(/^\uFEFF/, '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function cellText(value: unknown) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function validDateParts(parts: DateParts) {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  return date.getUTCFullYear() === parts.year && date.getUTCMonth() === parts.month - 1 && date.getUTCDate() === parts.day;
}

function parseDateCell(value: unknown): DateParts | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const parts = { year: value.getFullYear(), month: value.getMonth() + 1, day: value.getDate() };
    return validDateParts(parts) ? parts : null;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    const parsed = SSF.parse_date_code(value);
    if (!parsed) return null;
    const parts = { year: parsed.y, month: parsed.m, day: parsed.d };
    return validDateParts(parts) ? parts : null;
  }

  const text = cellText(value);
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text);
  if (!iso) return null;
  const parts = { year: Number(iso[1]), month: Number(iso[2]), day: Number(iso[3]) };
  return validDateParts(parts) ? parts : null;
}

function parseTimeCell(value: unknown): TimeParts | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return { hour: value.getHours(), minute: value.getMinutes() };
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    const fraction = ((value % 1) + 1) % 1;
    const totalMinutes = Math.round(fraction * 24 * 60) % (24 * 60);
    return { hour: Math.floor(totalMinutes / 60), minute: totalMinutes % 60 };
  }

  const text = cellText(value);
  const match = /^(\d{1,2}):([0-5]\d)(?::[0-5]\d)?\s*(am|pm)?$/i.exec(text);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const meridiem = match[3]?.toLowerCase();

  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    if (hour === 12) hour = 0;
    if (meridiem === 'pm') hour += 12;
  } else if (hour > 23) {
    return null;
  }

  return { hour, minute };
}

function singaporeTimestamp(date: DateParts, time: TimeParts) {
  return Date.UTC(date.year, date.month - 1, date.day, time.hour - SINGAPORE_OFFSET_HOURS, time.minute, 0, 0);
}

function dateLabel(parts: DateParts | null, raw: unknown) {
  if (!parts) return cellText(raw) || 'Date missing';
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

function timeLabel(start: TimeParts | null, end: TimeParts | null) {
  const format = (value: TimeParts | null) => value ? `${String(value.hour).padStart(2, '0')}:${String(value.minute).padStart(2, '0')}` : '—';
  return `${format(start)}–${format(end)}`;
}

function validateLength(errors: string[], label: string, value: string, max: number) {
  if (value.length > max) errors.push(`${label} must be ${max} characters or fewer.`);
}

export function eventImportSource(fileName: string): EventImportSource | null {
  const extension = fileName.trim().toLowerCase().split('.').pop();
  if (extension === 'csv') return 'csv';
  if (extension === 'xlsx') return 'xlsx';
  return null;
}

export function parseEventImport(data: ArrayBuffer, fileName: string, now = Date.now()): EventImportPreview {
  const sourceType = eventImportSource(fileName);
  if (!sourceType) throw new Error('Choose a .csv or .xlsx file.');
  if (sourceType === 'xlsx') validateXlsxArchive(data);

  let workbook;
  try {
    workbook = read(data, { type: 'array', cellDates: true });
  } catch {
    throw new Error('This file could not be read. Export it again as CSV or XLSX and retry.');
  }

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error('The file does not contain a worksheet.');
  const sheet = workbook.Sheets[sheetName];
  const matrix = utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: null, blankrows: true });
  const headerIndex = matrix.findIndex((row) => row.some((cell) => cellText(cell)));
  if (headerIndex < 0) throw new Error('The worksheet is empty.');

  const headerRow = matrix[headerIndex];
  const headerIndexes = new Map<string, number>();
  headerRow.forEach((cell, index) => {
    const key = normalizeHeader(cellText(cell));
    if (key && !headerIndexes.has(key)) headerIndexes.set(key, index);
  });

  const missingHeaders = EVENT_IMPORT_HEADERS.filter((_, index) => !headerIndexes.has(HEADER_KEYS[index]));
  if (missingHeaders.length) throw new Error(`Missing headers: ${missingHeaders.join(', ')}.`);

  const valueFor = (row: unknown[], headerIndexInExpected: number) => row[headerIndexes.get(HEADER_KEYS[headerIndexInExpected])!];
  const dataRows = matrix.slice(headerIndex + 1)
    .map((row, index) => ({ row, sourceRow: headerIndex + index + 2 }))
    .filter(({ row }) => row.some((cell) => cellText(cell)));

  if (!dataRows.length) throw new Error('The worksheet does not contain any event rows.');
  if (dataRows.length > MAX_EVENT_IMPORT_ROWS) throw new Error(`Import up to ${MAX_EVENT_IMPORT_ROWS} events at a time.`);

  const seen = new Map<string, number>();
  const rows: EventImportPreviewRow[] = dataRows.map(({ row, sourceRow }) => {
    const rawDate = valueFor(row, 0);
    const rawStart = valueFor(row, 1);
    const rawEnd = valueFor(row, 2);
    const date = parseDateCell(rawDate);
    const start = parseTimeCell(rawStart);
    const end = parseTimeCell(rawEnd);
    const title = cellText(valueFor(row, 3));
    const venue = cellText(valueFor(row, 4));
    const word = cellText(valueFor(row, 5));
    const worship = cellText(valueFor(row, 6));
    const remarks = cellText(valueFor(row, 7));
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!date) errors.push('Date must be a real Excel date or YYYY-MM-DD.');
    if (!start) errors.push('Start Time is required.');
    if (!end) errors.push('End Time is required.');
    if (!title) errors.push('Title is required.');
    validateLength(errors, 'Title', title, 120);
    validateLength(errors, 'Venue', venue, 200);
    validateLength(errors, 'Word', word, 200);
    validateLength(errors, 'Worship', worship, 200);
    validateLength(errors, 'Remarks', remarks, 1000);

    let startAt = 0;
    let endAt = 0;
    if (date && start && end) {
      startAt = singaporeTimestamp(date, start);
      endAt = singaporeTimestamp(date, end);
      if (endAt <= startAt) errors.push('End Time must be after Start Time on the same date.');
      else if (endAt < now) warnings.push('Past event — importing it may affect attendance rates.');
    }

    if (date && start && title) {
      const duplicateKey = `${startAt}:${title.toLocaleLowerCase('en-SG')}`;
      const firstRow = seen.get(duplicateKey);
      if (firstRow) errors.push(`Duplicates row ${firstRow}.`);
      else seen.set(duplicateKey, sourceRow);
    }

    const event = errors.length ? null : { sourceRow, title, venue, word, worship, remarks, startAt, endAt };
    return {
      sourceRow,
      title: title || 'Untitled event',
      dateLabel: dateLabel(date, rawDate),
      timeLabel: timeLabel(start, end),
      event,
      errors,
      warnings,
    };
  });

  return { fileName, sourceType, sheetName, rows };
}
