# PulseBoard Roadmap: From ~84/100 to 92+/100

## Objective
This roadmap is focused on one goal: increasing PulseBoard's challenge score from roughly `84/100` to `92+/100` by improving the categories that matter most to judges:

- `Clarity (15%)`
- `Usefulness / Value (25%)`
- `Creativity (20%)`
- `Execution (25%)`
- `Polish & Thoughtfulness (15%)`

This is not a general product roadmap. It is a challenge-optimization roadmap designed to improve the demo, sharpen the story, and make the product feel more real, useful, and memorable.

## Current Score Snapshot
Estimated current scoring based on the existing product:

| Category | Current | Why |
| --- | --- | --- |
| Clarity | `4/5` | Strong concept, but the product still spans multiple use cases and could be explained more sharply. |
| Usefulness / Value | `4/5` | Strong practical value, especially from multi-agent monitoring and CSV analysis, but the "so what?" layer can be stronger. |
| Creativity | `4/5` | The combination of monitoring, interview prep, CSV analysis, and cross-reference is distinctive, but one standout "wow" feature is still missing. |
| Execution | `4/5` | Core functionality works well and the app is fairly complete, but challenge-winning execution requires a bulletproof demo path. |
| Polish & Thoughtfulness | `4/5` | Good UI refinement and thoughtful flows already exist, but a few more intentional touches would make the product feel fully finished. |

Estimated overall score: `~84/100`

## Target Score Snapshot
Target scoring after roadmap execution:

| Category | Target | What gets us there |
| --- | --- | --- |
| Clarity | `5/5` | Sharper landing-page positioning, clearer use cases, stronger empty states, clearer "why it matters". |
| Usefulness / Value | `5/5` | Decision-oriented outputs, run history, and change detection make the product feel like a real workflow tool. |
| Creativity | `4.5-5/5` | Scenario simulation, audience-specific briefs, and stronger evidence-linked intelligence create a memorable edge. |
| Execution | `4.5-5/5` | Demo reliability, fallback runs, and safer live execution reduce risk during judging. |
| Polish & Thoughtfulness | `5/5` | Guided sample experiences, better source transparency, and intentional demo UX make the app feel "real". |

Target overall score: `92+/100`

## Biggest Gaps Keeping PulseBoard Below 92+
These are the highest-impact reasons the project may not yet score in the top tier:

1. The product is capable, but the core story is still a little broad.
2. The output is insightful, but not always explicitly decision-oriented.
3. The app is strong, but the live demo path is still more fragile than ideal.
4. The most memorable challenge-specific differentiator has not yet been fully surfaced.
5. The app already feels polished, but a few additional thoughtful details would make it feel submission-ready at a higher level.

## Phase 1: Must-Have Score Boosters
These are the highest-priority features. If time is limited, these are the ones to build first.

### 1. Run History + Change Detection
- **Why it matters:** This turns PulseBoard from a one-time analyzer into a true monitoring product.
- **Rubric lift:** `Usefulness`, `Execution`, `Polish`
- **Expected impact:** Very high
- **Effort:** Medium
- **Priority:** `P0`
- **Demo value:** Extremely high

What it should add:
- save previous runs by topic
- allow re-running a monitored topic
- show a clear "what changed since last run?" section
- highlight changes in:
  - sentiment
  - hiring signal
  - regulatory pressure
  - competitor movement
  - notable headlines

Why this is one of the best features:
- easy to understand in a demo
- clearly useful
- makes PulseBoard feel like a real product
- creates a memorable judging moment

### 2. Decision Memo / Executive Summary Mode
- **Why it matters:** Judges need to feel the output is actionable, not just informative.
- **Rubric lift:** `Usefulness`, `Clarity`, `Polish`
- **Expected impact:** Very high
- **Effort:** Low to medium
- **Priority:** `P0`
- **Demo value:** Very high

What it should add:
- a short decision-ready section after every brief
- suggested format:
  - `Situation`
  - `Key Risk`
  - `Key Opportunity`
  - `Recommended Action (Next 48 Hours)`
  - `Recommended Action (Next 2 Weeks)`

Why this matters:
- it answers "so what?"
- it gives the product executive value
- it helps the output feel useful to non-technical judges immediately

### 3. Bulletproof Demo Mode / Cached Fallback Runs
- **Why it matters:** Challenge demos get judged in real time; stability matters.
- **Rubric lift:** `Execution`, `Polish`
- **Expected impact:** Very high
- **Effort:** Medium
- **Priority:** `P0`
- **Demo value:** Critical

What it should add:
- preloaded demo topics with reliable sample outputs
- graceful fallback if provider/search calls fail
- "show sample intelligence run" flow that still demonstrates the full product
- no blank states during live judging

Why this matters:
- prevents the demo from depending fully on live provider/search behavior
- helps you present the product, not debug it

### 4. Sharper Landing-Page Positioning
- **Why it matters:** Clarity is one of the few categories you can improve very quickly with strong product communication.
- **Rubric lift:** `Clarity`, `Polish`
- **Expected impact:** High
- **Effort:** Low
- **Priority:** `P0`
- **Demo value:** High

What it should add:
- one sharper one-line value proposition
- explicit target users
- 2-3 strong example workflows
- a short "Why PulseBoard matters" section

Recommended positioning direction:
> PulseBoard helps students, analysts, and operators turn scattered external signals and internal CSV data into decision-ready briefs.

### 5. Stronger Guided Empty States / Demo Prompts
- **Why it matters:** Makes the app easier to understand in the first 10 seconds.
- **Rubric lift:** `Clarity`, `Polish`
- **Expected impact:** Medium-high
- **Effort:** Low
- **Priority:** `P1`
- **Demo value:** High

What it should add:
- suggested demo prompts and workflows
- clearer "start here" guidance
- sample runs for:
  - monitoring
  - interview prep
  - CSV analysis
  - cross-reference

## Phase 2: Differentiators
These features help PulseBoard stand out more strongly from typical dashboard or summarization tools.

### 6. Evidence Layer / Why This Was Flagged
- **Why it matters:** Makes the output feel credible, traceable, and more intelligent.
- **Rubric lift:** `Usefulness`, `Creativity`, `Polish`
- **Expected impact:** High
- **Effort:** Medium
- **Priority:** `P1`
- **Demo value:** Very high

What it should add:
- expandable evidence beneath major brief claims
- show:
  - contributing agent
  - source freshness
  - linked evidence or source summaries
  - confidence / signal strength tags

Why this matters:
- judges trust visible reasoning more than black-box summaries
- it makes the system feel sophisticated without changing the core concept

### 7. Saved Watchlists
- **Why it matters:** Reinforces that PulseBoard is a monitoring workspace, not just a one-off run tool.
- **Rubric lift:** `Usefulness`, `Polish`
- **Expected impact:** Medium-high
- **Effort:** Medium
- **Priority:** `P1`
- **Demo value:** High

What it should add:
- save topics to a watchlist
- one-click rerun from saved items
- optionally pin favorite topics
- eventually connect to run history

### 8. Audience-Specific Briefs
- **Why it matters:** Demonstrates that the same intelligence can be tailored to different users.
- **Rubric lift:** `Creativity`, `Usefulness`
- **Expected impact:** Medium-high
- **Effort:** Medium
- **Priority:** `P1`
- **Demo value:** High

What it should add:
- render brief variants for:
  - student/job seeker
  - recruiter
  - operator/founder
  - investor

Why this matters:
- it is a clever differentiation layer
- it makes the product feel more flexible and intentional

### 9. Submission-Quality Source Freshness and Confidence Signals
- **Why it matters:** Adds trust and refinement with relatively low interface complexity.
- **Rubric lift:** `Polish`, `Usefulness`
- **Expected impact:** Medium
- **Effort:** Low to medium
- **Priority:** `P1`
- **Demo value:** Medium-high

What it should add:
- freshness tags
- confidence labels
- "based on X signals" messaging
- partial-run transparency when some agents fail

## Phase 3: Stretch Features
These are high-upside features, but they come after the must-haves.

### 10. Scenario Simulator
- **Why it matters:** This adds a memorable "what if?" decision-support layer.
- **Rubric lift:** `Creativity`, `Usefulness`
- **Expected impact:** High
- **Effort:** Medium-high
- **Priority:** `P2`
- **Demo value:** Very high

What it should add:
- allow the user to test hypothetical scenarios:
  - "What if sentiment worsens?"
  - "What if hiring slows by 20%?"
  - "What if regulatory pressure increases?"
- produce a short projected impact summary

Why this matters:
- very demo-friendly
- makes PulseBoard feel like a decision-support system, not just a reporting tool

### 11. Cross-Reference Upgrade: Internal + External Insight Summary
- **Why it matters:** This is one of PulseBoard's strongest original ideas and deserves to be pushed harder.
- **Rubric lift:** `Creativity`, `Usefulness`, `Polish`
- **Expected impact:** Medium-high
- **Effort:** Medium
- **Priority:** `P2`
- **Demo value:** High

What it should add:
- stronger synthesis between uploaded CSV data and live intelligence
- more explicit output like:
  - `Internal Signal`
  - `External Signal`
  - `What They Mean Together`
  - `Action to Take`

### 12. Submission-Ready Presentation Layer
- **Why it matters:** Sometimes the final scoring jump comes from how "real" the app feels.
- **Rubric lift:** `Clarity`, `Polish`
- **Expected impact:** Medium
- **Effort:** Low to medium
- **Priority:** `P2`
- **Demo value:** Medium-high

What it should add:
- cleaner submission copy
- stronger demo labels
- "judge mode" polish pass
- small UX refinements for consistency and confidence

## Features Ranked by Judge Impact vs Effort

| Feature | Judge Impact | Effort | Recommendation |
| --- | --- | --- | --- |
| Run History + Change Detection | Very high | Medium | Build immediately |
| Decision Memo / Executive Summary | Very high | Low-Medium | Build immediately |
| Bulletproof Demo Mode | Very high | Medium | Build immediately |
| Sharper Landing-Page Positioning | High | Low | Build immediately |
| Guided Empty States / Demo Prompts | High | Low | Build immediately after positioning |
| Evidence Layer | High | Medium | Strong next step |
| Saved Watchlists | Medium-high | Medium | Build after run history |
| Audience-Specific Briefs | Medium-high | Medium | Build if time allows |
| Scenario Simulator | High | Medium-high | Great stretch feature |
| Cross-Reference Upgrade | Medium-high | Medium | Build if demo story leans heavily on CSV |

## Recommended Order of Attack

### Build First
1. `Run History + Change Detection`
2. `Decision Memo / Executive Summary Mode`
3. `Bulletproof Demo Mode / Cached Fallback Runs`

These three give the biggest scoring lift across usefulness, execution, and demo strength.

### Build Next
4. `Sharper Landing-Page Positioning / Why it matters`
5. `Guided Empty States / Sample Demo Flows`
6. `Evidence Layer / Why this was flagged`

These features improve clarity, trust, and polish quickly.

### Build After That
7. `Saved Watchlists`
8. `Audience-Specific Briefs`
9. `Cross-Reference Upgrade`

These strengthen distinctiveness and make the product feel more complete.

### Defer If Time Is Short
10. `Scenario Simulator`
11. broader stretch polish ideas that do not strengthen the core judging story

## Recommended Demo Story for the Challenge
The strongest judging narrative after the Phase 1 roadmap is:

1. Start on the landing page with a very clear value proposition.
2. Run a monitored topic with a reliable, polished path.
3. Show the multi-agent dashboard.
4. Show the generated brief.
5. Show the decision memo.
6. Re-run the same topic and highlight what changed since the previous run.
7. If time allows, show CSV cross-reference as the differentiator.

That sequence communicates:
- clear problem
- real usefulness
- creative workflow design
- stable execution
- thoughtful polish

## Success Definition
PulseBoard is ready for a `92+/100` level submission when:

- the product story is instantly understandable
- the demo is stable even under live uncertainty
- the output is explicitly decision-oriented
- the app shows monitoring over time, not just one-off analysis
- the UI includes enough traceability and thoughtfulness to feel real and trustworthy

## Immediate Next Step
Start with:

### `Feature 1: Run History + Change Detection`

This is the highest-leverage feature because it improves:
- usefulness
- execution story
- product realism
- demo memorability

It is the clearest path to moving PulseBoard from a strong student project to a challenge-winning submission.
