# Member visual refresh

Update the existing member Home, Events, and Attendance screens to match the leader app. Preserve member queries, check-in rules, navigation destinations, and event details. Profile is already the fourth tab on iOS and Android/web, and already uses the shared profile screen.

## Reference lock

The current leader Home and Events screens are the primary reference. Preserve their monochrome canvas, native navigation, compact date tiles, 20px page gutters, 30px section spacing, and softly elevated cards. Use the existing Inter Tight tokens, including negative heading tracking. Native iOS toolbar titles continue to use SF Pro.

Secondary research: Refero's Beau style reference supports restrained monochrome hierarchy and compact primary actions. Its marketing gradients, font, radii, and page composition do not apply here. Refero's bundled typography and craft guidance supports consistent type roles, readable wrapping, and accessible controls.

| Decision | Source | Application |
| --- | --- | --- |
| Native headers and four tabs | Leader navigation and user request | Keep Home, Events, Attendance, Profile; render header outside scroll content, as in leader screens. |
| Compact gathering cards | Leader Events | 54×60 date tile, 12px tile radius, 18px card radius, 15px padding. Keep member details inline. |
| Check-in action above next gathering | Leader Home and existing member action | 46px minimum pill with shared inset highlight and drop shadows. Keep current availability and submission behavior. |
| Small attendance summary | Leader stat typography and user brief | 34/38 semibold rate, muted descriptive text, thin history trend. |
| Attendance history rows | Leader Home upcoming rows | Separate entries with 1px track dividers; label present/absent in text and icons. |
| Empty states | Leader cards and user brief | Compact surface, section heading, muted explanation. |

No backend changes or new member capabilities. No bitmap assets needed.

## Validation

- Mobile TypeScript and focused ESLint checks passed.
- Reviewed the rendered member screens using temporary local fixture copies of the screen source, with only data hooks replaced. All fixture files were removed after review.
- Checked Home, Events, and Attendance at 390px in light mode, plus 320px dark layouts, long titles/venues, empty Home, and open/closed check-in presentation. Corrected time wrapping to keep am/pm attached to the time.
- Live authenticated review was blocked by existing development provisioning data: `The dev test group belongs to another profile`. Authentication and backend data were not changed to bypass this.
- Native iOS rendering and live attendance submission were not verified on a device.
