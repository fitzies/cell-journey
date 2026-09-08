# Leader Events exploration

## Evidence

Opened the existing Expo web server through T3 at http://100.66.85.123:8082. Member Home loaded with Test Event, Cell Group 123 and Cell Group. Switched to Cell Journey Dev Test Group · Owner. Leader Events remained loading after navigation and reload. The loaded leader feed therefore has not been visually verified.

Source review: attendance/index.tsx puts ongoing events under Open now, future events under Upcoming, and both incomplete and complete past events under Past. Upcoming precedes unresolved past attendance. Cards emphasize the date and put attendance in a small final line. The overview count is a bounded feed count, not necessarily all events. Completion is based on required event-roster rows having an effective status, not the present count.

## References and decisions

| Decision | Reference | Adaptation |
| --- | --- | --- |
| Clear section hierarchy, generous spacing, system typography | Things style, https://culturedcode.com/things, Refero style 0796cd74-edc2-4e12-9c71-25fac02a1cb2 | Compact native product scale, no marketing imagery |
| Group outstanding work and collapse completed work | Todoist inbox, https://refero.design/screens/13ef6f3a-6f10-4278-8fe6-083c048a9c67 | Attendance state becomes the primary grouping; date remains metadata |
| Give completed work a quieter, explicit checked state | Todoist completion, https://refero.design/screens/7705b208-8b80-4d8c-8cfd-7c3c74846f21 | Marked events remain available for corrections |
| Rounded functional controls and restrained success badges | Todoist style d9a3223e-d0d5-436b-aa09-0facd1805a1e, https://todoist.com | Borrow component roles, omit brand red and decorative imagery |
| Preserve app identity and toolbar arrangement | Existing Cell Journey UI and AGENTS.md | Neutral canvas, native-style title, plus and group control positions, four tabs. HTML chrome is illustrative; implementation must use actual native controls |

## Reference locks before build

A, Status sections: existing product is the primary visual target; Things spacing and Todoist grouping are secondary. Preserve compact title, neutral surfaces, date context. Give remaining count more weight than the date. Needs attention first, upcoming second, marked collapsed last.

B, Attendance inbox: Todoist task separation is the primary structure within the existing product palette. Preserve counts in filters and compact divided rows. Separate attention, upcoming and marked views. Tradeoff: upcoming events require switching views.

C, People preview: existing expandable event detail is the primary product target. Borrow Todoist disclosure and explicit completed states. Expand one event to show remaining names by Active and Visitors. Tradeoff: longer page and more roster data to fetch.

Common tokens: system sans; title 22/28 semibold, body 14–16, metadata 12–13; spacing 4/8/12/16/24/32; neutral canvas and surfaces; blue interactive text, amber unfinished state, green marked state with textual labels; 16px event radius and 10px controls. Dark appearance mirrors the observed app's black and gray surfaces. No photography or generated assets needed.

## Proposed rules

- Needs attention means an event has started and required attendance is incomplete. Pin ongoing events above ended incomplete events, then sort ended incomplete events oldest first.
- Upcoming means it has not started. Do not label future events as overdue or unmarked work.
- Marked means every required event-roster person has an effective attendance status, including absences. Zero-required-person events need a distinct 'No attendance required' label, not an alarming 0/0.
- Keep optional connected people markable without blocking completion. Preserve event-time eligibility and historical memberships. Active/Visitor classification must not independently redefine required status.
- Use 'Happening now', not 'Check-in open', because member self-check-in is disabled.
- Show remaining names on detail or expansion. Start the marking view filtered to unmarked people, but keep already marked people available for corrections.
- Compute counts over the full relevant dataset or explicitly label limited counts. Existing feed pagination cannot support global badges without further backend work.
- Do not move a card out from under the user's finger. Save and acknowledge before returning it to Marked. Preserve scroll and filters.

## Prototype scope

events-options.html is standalone and contains fictional sample people and mixed-state sample events. Filters, theme switching, expansion and attendance marking operate only in memory. Reset restores the sample. No app or backend changes. A is recommended, with C's remaining-person preview as an optional addition.

## Validation

T3 browser rendered all three options without console errors. Verified status filtering, opening the attendance dialog, saving sample statuses, movement to Marked, and reset. Desktop had no horizontal overflow. T3 viewport resize timed out, so mobile QA used a same-origin 390px iframe; the comparison stacked into one column with no horizontal overflow. Visually checked dark appearance there. Removed the temporary QA iframe afterward. Native behavior remains untested.

Preview uses Python's static HTTP server bound only to 100.66.85.123:8090 and serves the design directory. The HTML returned HTTP 200 through the Tailscale address and with the forge Host header. Forge hostname resolution failed locally, so the handoff uses the verified IP address. Existing Expo server and mappings were reused unchanged.
