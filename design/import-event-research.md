# Import events prototype

The user asked for an HTML concept that explains import before opening Files. This prototype adds preparation and review while matching the approved Create Event canvas. It does not change Expo or save events.

## Reference lock

Primary visual source: the approved gathering canvas in `create-event-options.html`. Preserve black canvas, Inter Tight content, semibold system header, layered dark cards, native header Back/Done intention. Browser controls are approximations.

Research inspected:

- [ShareWillow bulk import](https://refero.design/pages/cf593d28-b70a-4b6b-bb86-ea317de6fa53): instructions and sample template before file selection. Adapt the ordering and template affordance, not the desktop modal or white palette.
- [Resend CSV import flow](https://refero.design/flows/10626): deliberate file selection, parsed row review and explicit confirmation. Adapt review and error visibility. Column mapping is not in Cell Journey's importer, so omit it.
- Resend style reference `b2f7a9d7-ba46-4c00-bc73-426969097ff9`: restrained black/white contrast. Keep the user's existing typography and shadow system. Do not adopt marketing serif, border-only cards, blue CTA or 3D imagery.

## Decision ledger

| Decision | Source | Why |
| --- | --- | --- |
| Dark canvas and raised cards | Approved Create Event canvas | The import sheet belongs to the same Events menu. |
| Template before file chooser | ShareWillow import screen | Makes the required format discoverable before opening Files. |
| Ready/error review, header confirmation | Resend flow and user's native header preference | File selection should not create events. |
| All eight headers in template | Existing `event-import.ts` | Optional values still require their column headers. |
| Expandable column/date help | User requested guidance without a form-heavy layout | Keep the first screen short, with exact rules available. |
| CSV/XLSX, row/file limits beside chooser | Existing parser and import hook | Users know whether their file qualifies before selecting it. |
| Existing parser bundled into HTML | Current app behavior | Real local files get the same validation as the app. No backend connection. |

## Verified importer rules

Read `apps/mobile/src/lib/event-import.ts`, `components/events/event-actions.tsx`, and `components/events/import-preview.tsx`.

- `.csv` and `.xlsx` only; not `.xls`, `.numbers`, PDF or Google Sheets links.
- Maximum 100 nonempty event rows and 5 MiB file bytes. The current UI describes this as 5 MB.
- XLSX uses the first worksheet. First nonempty row is the header row.
- Required headers: Date, Start Time, End Time, Title, Venue, Word, Worship, Remarks. Header case, spaces and punctuation are normalized; column order can vary.
- Required values: date, start time, end time and title. Other values may be blank.
- Dates: YYYY-MM-DD strings or genuine Excel date values. Times: 24-hour HH:mm or 12-hour h:mm AM/PM; Excel time values also work.
- Singapore timezone. End time must follow start time on the same date.
- Title max 120 characters; venue, Word and Worship max 200 each; remarks max 1000.
- Duplicate title/start pairs within the file are errors. Past events warn about attendance rates. All rows must pass before confirmation.
- The template includes two sample event rows to replace.

## Browser verification

Verified desktop at 1200px and mobile at 390px with no horizontal overflow and no browser errors. Exercised sample review, invalid-time blocking, local CSV file parsing, unsupported-extension error, expandable guidance and header confirmation. Confirmation states that no events were saved.

Server reused on Forge Tailscale address `100.66.85.123:8090`. HTTP and `Host: forge:8090` verified. Preview: http://forge:8090/import-event-options.html
