# ARTEL Replay Studio Design System

> Product direction: **A — Replay Studio**  
> Scope: The React interface used to observe Unity game QA sessions and reconstruct an AI agent's actions, decisions, and failures.

## Product principles

1. **Replay first** — Game footage is the primary workspace. Every event must align to the same timeline.
2. **Evidence over metrics** — Prefer reproducible timestamps, actions, state changes, and evidence over summary metrics.
3. **Calm until critical** — Keep default surfaces quiet. Reserve strong colors for actions, warnings, and failures.
4. **Dense, not crowded** — Preserve professional information density without filling the UI with decorative cards.
5. **Inspectable automation** — Users must be able to trace the agent's observation, reasoning summary, action, and outcome.

## Visual direction

Combine the strengths of video editors, game-engine debuggers, and modern developer tools.

- Dark-first, flat graphite surfaces
- Cyan for agent actions and selection
- Violet for agent reasoning
- Green for success
- Amber for uncertainty and retries
- Coral for failures and critical evidence
- Monospace only for timestamps, IDs, logs, and input events
- Glow and gradients only for live or selected states

Avoid generic KPI dashboards, repeated rounded cards, excessive glassmorphism, decorative neon, genre-specific decoration, and color-only status communication.

## Foundation tokens

### Color

| Token | Value | Usage |
|---|---:|---|
| `bg.canvas` | `#090C10` | Application background |
| `bg.surface` | `#10151B` | Sidebars and panels |
| `bg.raised` | `#171D25` | Inspector and popovers |
| `bg.hover` | `#1D2530` | Hovered surfaces |
| `border.subtle` | `#27313D` | Default dividers |
| `border.strong` | `#3B4857` | Emphasized boundaries |
| `text.primary` | `#F4F7FA` | Titles and critical values |
| `text.secondary` | `#A7B0BC` | Body text and descriptions |
| `text.muted` | `#707B88` | Metadata |
| `action.primary` | `#24C7E8` | Agent actions and primary controls |
| `agent.reasoning` | `#8F7CF6` | Agent reasoning events |
| `status.success` | `#48C78E` | Passed and healthy states |
| `status.warning` | `#F2B84B` | Warnings and retries |
| `status.critical` | `#FF634F` | Failures and blockers |

Always pair semantic colors with an icon, shape, or text label.

### Typography

```css
--font-sans: "Inter", "Pretendard Variable", Pretendard, sans-serif;
--font-mono: "JetBrains Mono", "SFMono-Regular", Consolas, monospace;
```

| Style | Size / line height | Weight |
|---|---:|---:|
| Display | `28 / 36` | 650 |
| Heading 1 | `22 / 30` | 650 |
| Heading 2 | `18 / 26` | 600 |
| Heading 3 | `15 / 22` | 600 |
| Body | `14 / 21` | 400 |
| Compact | `12 / 18` | 450 |
| Caption | `11 / 16` | 500 |
| Code | `12 / 18` | 450 |

Apply `font-variant-numeric: tabular-nums` to timestamps and frequently changing numeric values.

### Spacing, radius, and motion

- Spacing: `4, 8, 12, 16, 20, 24, 32, 40, 48px`
- Radius: `3, 5, 8, 12px`; use `999px` only for pills and status dots
- Motion: fast `100ms`, normal `160ms`, slow `240ms`
- Standard easing: `cubic-bezier(.2, 0, 0, 1)`
- Never interpolate the timeline playhead or real-time numeric values.
- Disable panel transitions when `prefers-reduced-motion` is active.

## Application shell

```text
┌──────────────────────────────────────────────────────────────────┐
│ Top bar: project / session / connection / actions               │
├──────────┬───────────────────────────────────────────┬───────────┤
│ Layers   │                                           │ Inspector │
│ & events │              Replay viewport              │ & evidence│
│          │                                           │           │
├──────────┴───────────────────────────────────────────┴───────────┤
│ Transport controls + synchronized event timeline                │
└──────────────────────────────────────────────────────────────────┘
```

- Top bar: `48px`
- Left rail: `240px`, collapsed to `48px`
- Inspector: `320px` default, resizable from `280–480px`
- Timeline: `184px` default, resizable from `120–360px`
- Replay viewport: fills the remaining space, minimum `640 × 360px`
- Resize-handle hit area: at least `8px`

Responsive rules:

- `>= 1440px`: Full three-pane layout
- `1024–1439px`: Collapsed left rail; inspector may become an overlay
- `< 1024px`: Prioritize the viewport and timeline; show the inspector as a drawer
- Mobile: Support notifications and evidence review only

## Core components

### `ReplayViewport`

- Unity WebRTC stream or recorded clip
- Agent cursor, movement path, clicks, and key-input annotations
- Bounding boxes for selected failures
- Connection state and stream quality
- Fullscreen, fit, and actual-size controls
- Show video controls on hover, focus, or pause
- Pair critical coral outlines with an icon
- Place text overlays on a solid translucent backdrop

### `ReplayTransport`

- Previous/next event, rewind/forward five seconds, and play/pause
- Current/total timecode, playback speed, and live state
- Shortcuts: `Space`, `J`, `K`, `L`, `Left Arrow`, `Right Arrow`
- Show `Go to LIVE` when the user moves behind the live edge
- Allow millisecond-precision timecodes to be copied

### `EvidenceTimeline`

Lane order:

1. Critical and warning markers
2. Agent observation
3. Agent reasoning
4. Agent action
5. Game state and telemetry
6. Input events
7. System logs

| Event | Color | Shape |
|---|---|---|
| Observation | Cyan | Circle |
| Reasoning | Violet | Diamond |
| Action | Cyan | Tick |
| Success | Green | Check |
| Retry | Amber | Loop |
| Failure | Coral | Triangle |
| System | Gray | Square |

### `EventInspector`

Display information in this order:

1. Outcome and severity
2. Timecode and event ID
3. Agent observation
4. Agent reasoning summary
5. Executed action and parameters
6. Expected versus actual result
7. Related evidence
8. `Create bug` or `Link existing bug`

Do not expose long raw reasoning by default. Show a concise summary first and make detailed logs explicitly expandable.

### `LayerPanel`

- Provide Agent Actions, Failure Points, Game State, Input, and Logs layers
- Show a checkbox, icon, label, and event count for each layer
- Preserve the user's layer configuration across sessions

### `ConnectionIndicator`

In a healthy state, show only a status dot and `Live`. The popover contains WebRTC state, resolution, FPS, bitrate, packet loss, round-trip time, and agent control-channel state.

### `BugComposer`

Use the selected replay range to generate an editable bug draft containing title, severity, priority, expected and actual results, reproduction steps, build, environment, timecodes, evidence, and related agent events. Never submit AI-generated content automatically.

## States

```ts
type RunStatus =
  | "queued"
  | "connecting"
  | "running"
  | "paused"
  | "passed"
  | "failed"
  | "cancelled";

type Severity = "info" | "low" | "medium" | "high" | "critical";
```

- Empty: Offer `Connect Unity session`, `Open recording`, and `Run test`
- Connecting: Show `Start instance → Signaling → Receive video → Prepare agent`
- Degraded: Keep video visible and mark degraded evidence ranges on the timeline
- Disconnected: Show the disconnect time and reconnection state over the last frame
- Never present the last received frame as if it were still live

## Accessibility

- Maintain WCAG AA contrast of at least `4.5:1` for normal text
- Maintain at least `3:1` for large text and meaningful UI boundaries
- Make every feature keyboard accessible
- Follow chronological order for timeline focus navigation
- Provide an accessible event-list alternative for visual annotations
- Use a minimum pointer target of `32 × 32px` and `44 × 44px` for primary touch targets
- Announce summarized state changes with `aria-live="polite"`; do not announce every live log entry

## React architecture

```text
src/design-system/
  tokens/
    colors.css
    typography.css
    spacing.css
    motion.css
  primitives/
    Button/
    Badge/
    Input/
    Tabs/
    Tooltip/
    Popover/
    ResizablePanel/
  replay/
    ReplayViewport/
    ReplayTransport/
    EvidenceTimeline/
    TimelineMarker/
    EventInspector/
    LayerPanel/
    ConnectionIndicator/
    BugComposer/
```

Implementation rules:

- Keep ARTEL domain meaning out of primitives.
- Compose domain components from primitives.
- Never place raw hexadecimal colors in TSX files.
- Prefer explicit variants over combinations of boolean props.
- Share one playback state across the viewport, timeline, and inspector.
- Separate raw server events from UI view models.

```tsx
<TimelineMarker
  kind="failure"
  severity="critical"
  timestampMs={68342}
  label="Damage was not applied after dodge"
  selected={selectedEventId === event.id}
/>
```

## Definition of done

- The relationship to the replay viewport or current evidence is clear.
- Every state uses semantic tokens.
- Loading, empty, error, degraded, and disconnected states are defined.
- Keyboard focus and screen-reader labels are provided.
- Layout is verified at 1024px and 1440px or wider.
- Live data updates do not cause layout shifts.
- Observation, reasoning, action, and outcome are visually distinct.
- Every bug is linked to a timestamp and evidence.
- Storybook covers default, hover, focus, disabled, loading, and error states.

## Implementation order

1. Foundation tokens and typography
2. Button, Badge, Tooltip, Tabs, and ResizablePanel
3. ReplayViewport and ConnectionIndicator
4. ReplayTransport and shared playback state
5. EvidenceTimeline and TimelineMarker
6. LayerPanel and EventInspector
7. BugComposer
8. Accessibility and degraded-stream states
9. Storybook and visual-regression tests
