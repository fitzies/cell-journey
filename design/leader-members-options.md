# Leader Members options

Design brief: redesign the third leader tab in the Expo app so leaders can find members and manage the ordered roster with less repeated labeling. These are proposals for selection, not changes to the live Members screen.

The current page repeats Active/Inactive counts in summary pills and section headings, gives every person a separate card, and shows reorder handles at all times. Active and inactive membership are distinct from attendance at an event; avoid checkmarks that could imply someone is present today.

## Shared direction

- Keep the existing native header, left-aligned Members title, Solar account/group switcher, and native tabs.
- Keep SF Pro 22/28 semibold with -0.7 tracking in the native header. Use bundled Inter Tight in content: body 14.5/18 with +0.3 tracking, and occasional section titles 19/24 semibold with -0.6 tracking. The supplied +0.6 section tracking conflicts with the request for negative tracking on headings; use -0.6.
- Keep the existing background, surface, text, muted, strong, and track tokens in both themes. Use 12–18pt radii and subtle layered shadows only on grouped containers and custom controls that need elevation. iOS owns native control materials.
- Use at least 44pt touch targets. Small circular icons can sit within larger hit areas. Keep meaningful names readable at larger text sizes.
- Remove duplicate count pills, the repeated page heading in content, and required/optional section subtitles. Show status through readable text, not color alone.
- Preserve stored roster order and reactivation. Search must not alter stored order. Reordering should be available only with search cleared and within the active or inactive roster, retaining accessible move actions.
- Preserve current permissions. These visual proposals do not introduce new member-management capabilities or backend changes.
- Use initials when a real profile image is unavailable. Do not invent portraits or attendance data.

## 1. Compact roster, recommended

Primary style: [Cal.com](https://cal.com), Refero style `23fd2b9b-b9ea-45e3-8370-7451ea05cee6`. Preserve monochrome surfaces, compact density, rounded containers, and diffuse shadows without card outlines. Borrow search and aligned person/action rows from [Genie](https://refero.design/screens/ca7dc92f-e39d-4c21-ad69-b8d6d8c8ce13).

Build direction: beneath the native header, show Search members followed by an Active / Inactive segmented filter with counts. Render the selected roster in one 16pt rounded white surface with 60pt minimum rows and subtle inset track dividers. Each row has initials, a name, and a quiet action. Move reorder handles into an explicit Reorder state. Inactive rows retain Activate. No section headings or summary cards.

Best for quick roster work and longer groups. Only one membership state is visible at a time.

Reject individual card shadows, oversized statistics, decorative status checkmarks, and new accent colors. Use initials, with existing profile photos only if supported.

## 2. Open directory

Primary screen: [Wabi members](https://refero.design/screens/beb6e181-2624-42d5-a41c-fe1eb2de7848). Preserve unboxed avatar/name/status rows and generous spacing. Borrow Cal.com's restrained monochrome palette and rounded custom controls, using the project's existing tokens.

Build direction: show one quiet line of group context and a search field under the native header. Use 76pt minimum unboxed rows with 44pt initials, names, and status/action text on the right. Show active members directly; put inactive members behind one collapsed Inactive row with a count. Retain the existing ordering and activation actions, revealing reorder handles only in Reorder mode. No statistics or repeated Active heading.

Best for a small cell group and a calmer reading experience. Fewer people fit on screen than option 1.

Reject Wabi's full-screen sheet treatment, usernames the app does not have, low-contrast text, and per-person cards. Initials carry identity without adding a photo requirement.

## 3. People grid

Primary screen: [Binge people](https://refero.design/screens/ef47bbf8-6407-4abe-a920-ce016b521ce8). Preserve the portrait-first grid, centered names, whitespace, and absence of per-person borders. Borrow the searchable status filter from option 1, with the existing monochrome tokens.

Build direction: place Search members and Active / Inactive filters below the native header. Use two columns of 64pt avatars or initials with full names below. Increase tile height for wrapped names; fall back to a single column at large text sizes. Selecting a person reveals existing actions. The HTML now uses a 350ms hold to lift a tile, followed by direct grid dragging. Other tiles shift into place and the screen scrolls near its edges. Release commits the example order; Escape, interrupted touches, or dropping outside the grid cancel. A quick swipe remains scrolling. Reordering is disabled during search; Active and Inactive orders stay separate. Keyboard users can focus a tile and use Alt + arrow keys. No Reorder button or list conversion.

Best for recognizing people in a small group, especially if real photos become available. Initials provide less visual recognition. Holding is less discoverable, so the example includes a short inline hint.

Reject Binge's three-column density, cast subtitles, synthetic faces, and shadowed card tiles. No extra section headings.

## Research decision

Reviewed full Refero styles for Cal.com, Relate, and Attio, plus the three iOS screenshots above. Cal.com's card treatment fits the user's shadow preference. Attio's outlined components and serif display treatment, and Relate's blue wash and 8/40pt card-radius split, were not adopted because they conflict with this app's current direction.

After selection, implement only that option and verify populated, empty, searching, inactive, reordering, loading/error, dark mode, and larger-text states. Check native header alignment and the switcher on an iPhone; browser rendering cannot establish native appearance.
