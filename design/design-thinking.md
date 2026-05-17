# Cell Journey Design Thinking

This document captures the current visual and UX direction explored in `design/onboarding-3.html`. The direction is not limited to onboarding; it should inform the broader mobile app design system for member and leader experiences.

## Core Direction

Cell Journey should feel:

- calm
- minimal
- trustworthy
- native-mobile-first
- warm without being decorative
- church-adjacent without looking traditional or overly religious
- clear enough for leaders managing practical attendance tasks

The strongest direction so far is a paired theme system:

- **Light mode:** Quiet Chapel
- **Dark mode:** Night Mono

These should be treated as two expressions of the same product, not two unrelated skins.

---

## Theme Pairing

### Light Mode — Quiet Chapel

Quiet Chapel is the primary light theme direction.

Characteristics:

- warm off-white background
- dark brown/near-black text
- taupe muted text
- soft cream cards
- low-contrast borders
- restrained warmth instead of bright color

Intended feeling:

- personal
- calm
- slightly editorial
- suitable for church/community context
- not corporate SaaS

Example token direction:

```txt
background: #f8f4ef
text:       #201915
muted:      #756b62
card:       #fffdf9
border:     #ded6cd
accent:     #5d4030
```

### Dark Mode — Night Mono

Night Mono is the primary dark theme direction.

Characteristics:

- near-black background
- warm off-white text
- charcoal cards
- subtle grey borders
- almost monochrome
- no glow or saturated accents

Intended feeling:

- focused
- premium
- quiet
- good for evening use
- minimal but still warm

Example token direction:

```txt
background: #151515
text:       #f4f1ea
muted:      #aaa49b
card:       #1e1e1e
border:     #333333
accent:     #f4f1ea
```

---

## Typography

Typography should carry a lot of the product personality, especially because the visual system is intentionally minimal.

### Display / Editorial Typeface

Current prototype uses **Fraunces** and sometimes **Newsreader**.

Use for:

- onboarding headings
- empty states
- approval/pending states
- milestone moments
- emotionally-weighted screens

Avoid overusing display type in dense product screens.

Recommended use:

```txt
Onboarding question: 36–40px, tight line-height
Milestone heading:   34–40px
Empty state heading: 28–34px
```

### App / Utility Typeface

Use a clean sans-serif for everyday app UI.

Use for:

- tabs
- buttons
- forms
- lists
- schedules
- attendance rows
- labels
- profile fields

Prototype uses **Inter**, but in the Expo app this could become the platform/system font unless we decide otherwise.

### Mono Typeface

Use a mono style sparingly for:

- section labels / eyebrows
- group codes
- small technical indicators
- progress/meta labels

Prototype uses **IBM Plex Mono**.

Do not let mono text dominate the interface.

---

## Motion

The motion direction is inspired by Olive’s onboarding structure, but should be quieter.

Use:

- short fade-up page entrances
- animated progress rail during onboarding
- subtle pressed states on options
- gentle state transitions

Avoid:

- glow pulses
- floating blobs
- excessive background animation
- celebratory confetti for normal flows

Motion should communicate state and continuity, not decoration.

---

## Onboarding Structure

The onboarding flow currently modeled is:

1. **Signed-in handoff**
   - User has already authenticated.
   - Introduces profile setup.

2. **Full name**
   - Required.
   - Should use name leader recognizes.

3. **Preferred name**
   - Optional.
   - Should allow skip.

4. **Services attending**
   - Required multi-select.
   - Options are church-service specific.

5. **Singapore region**
   - Required.
   - Options:
     - North
     - South
     - East
     - West
     - Central
     - Northeast

6. **Group code intro**
   - Explains private group join.
   - Sets expectation that approval is required.

7. **Enter group code**
   - User enters code from leader.
   - Should support error/help state for invalid code.

8. **Confirm matched group**
   - Shows group name, leader, and context.
   - User confirms before sending request.

9. **Pending approval**
   - Persistent state.
   - No progress bar.
   - No back button.
   - No Done button.
   - User remains here on app reopen until approved/rejected.
   - Should include option to change group code.

10. **Rejected / retry**
   - User returns to code entry.
   - Existing profile answers remain saved.

---

## Pending Approval State

This is important enough to treat as a real app state, not a final onboarding page.

Requirements:

- should feel polished and reassuring
- should show the requested group
- should explain that the leader has been notified
- should persist across app restarts
- should not imply the user is finished
- should allow changing the group code

Recommended actions:

```txt
Primary visible state: Waiting for leader approval
Secondary action: Change group code
Optional info: Group name, leader name, request submitted time
```

No progress bar or back button should appear here because the user is no longer progressing through onboarding steps.

---

## UI Components From Prototype

Reusable components suggested by the prototype:

- Onboarding shell with progress rail
- Back circle button
- Sticky bottom CTA
- Text input field
- Option pill
- Multi-select chip
- Info note / group summary card
- Persistent pending state
- Rejected request state

These should eventually become native React Native components with shared tokens.

---

## Copy Direction

Keep onboarding copy short.

Avoid excessive helper text. The interface should not explain obvious things.

Good:

```txt
Use the name your leader would know.
Pick one or more.
Your leader will approve the request.
```

Too much:

```txt
Next: name, preferred name, services, region, and group code.
Shown to your cell leader after approval.
Back and edit anytime.
```

Tone should be:

- direct
- calm
- human
- not cute
- not overly spiritualized

---

## Broader App Application

These theme and typography decisions should extend beyond onboarding.

### Member App

Use this direction for:

- home dashboard
- schedule
- attendance history
- profile
- pending approval
- leave group flow

Member screens should feel simple and reassuring.

### Leader App

Use the same design system, but with denser layouts where needed.

Leader screens need to support:

- attendance marking
- join request approval/rejection
- event creation/editing
- member lists
- attendance summaries

For leader workflows, prioritize clarity over editorial styling.

Use display typography only for major screen titles or empty states. Lists, forms, and attendance controls should use the sans-serif app type.

---

## Design Principles Going Forward

1. **Minimal first**
   - Add detail only when it improves clarity or trust.

2. **Warm neutral palette**
   - Avoid bright colors and heavy glow.

3. **Native-feeling mobile UI**
   - The Expo app should feel like a mobile app, not a website inside a phone.

4. **Clear state design**
   - Pending, rejected, loading, empty, error, and retry states should be explicitly designed.

5. **Leader workflows must stay practical**
   - The app cannot be so editorial that attendance tasks become slow.

6. **Historical continuity matters**
   - Removal/rejection/leave flows should preserve user profile and attendance history where required by the domain model.
