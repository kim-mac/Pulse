# PulseBoard — Product Requirements Document & Architecture
## Phase 1: Stateless Multi-Agent Intelligence Monitor
> Codex Creator Challenge Submission | Built with OpenAI Codex

---

## 1. PRODUCT OVERVIEW

### What is PulseBoard?
PulseBoard is a real-time multi-agent intelligence monitoring platform. A user enters any company, topic, or industry they want to track. Five specialized AI agents fire simultaneously — each watching a different signal channel — and the results are synthesized into a single tiered intelligence brief, color-coded by urgency. No backend. No database. Runs entirely in the browser.

### The One-Liner
> "Type anything. Five agents watch it. Get your intelligence brief in 60 seconds."

### The Two-Sided Value
**For students**: Track a company before an interview, monitor an industry for a class project, watch a competitor for a case competition, or follow a job market in real time.

**For companies**: Competitive intelligence, brand sentiment monitoring, regulatory tracking, hiring signal detection — all the things companies pay Bloomberg and Crayon tens of thousands of dollars per year for, running in a browser tab.

**The key insight**: The core technology is identical for both users. The only thing that changes is what they're tracking and why. A student tracks "Goldman Sachs" to prep for an interview. A UBS analyst tracks "Goldman Sachs" to monitor a competitor. Same agents. Same architecture. Same output.

### Why It Wins the Challenge
- Visually dramatic: 5 agents fire in parallel, cards populate in real time
- Genuinely two-sided: every student AND every judge in the room is a direct user
- Sponsor demo moment: typing a sponsor's own company name and watching agents analyze them in real time
- Technically sophisticated: true parallel multi-agent orchestration with web search tool use
- Immediately useful: zero learning curve, anyone can use it in 30 seconds

### Phase 1 Scope (What We're Building Now)
Phase 1 is the stateless version — agents run fresh on each query, no persistent memory, no delta detection. This is fully demo-ready and genuinely impressive. Phase 2 adds persistent memory, delta detection, and the CSV Data Analyst Agent.

---

## 2. SPONSOR ALIGNMENT

All 7 sponsors are direct users of PulseBoard. This is the strongest sponsor alignment of any submission.

| Sponsor | Student use case | Company use case |
|---|---|---|
| **Uber** | Track Uber before applying — understand culture, news, controversies | Monitor Lyft, regulatory changes across markets, driver sentiment |
| **UBS** | Research UBS wealth management division before an interview | Track Goldman/Morgan Stanley, monitor market-moving news, regulatory filings |
| **Sikich** | Understand Sikich's consulting practice before applying | Monitor client industries, track competitor CPA firms, watch regulatory changes |
| **GEICO** | Research GEICO's culture and recent news before interviewing | Monitor Progressive/Allstate, track insurance regulatory news |
| **L'Oréal** | Track beauty industry trends, L'Oréal sustainability news | Monitor Estée Lauder, track ESG sentiment, brand perception shifts |
| **ZS Associates** | Research ZS's pharma consulting practice | Monitor pharma industry regulatory moves, track competitor consultancies |
| **KPFF Engineers** | Understand engineering consulting market | Monitor infrastructure policy, track competitor firms, watch project bid signals |

### The Judge Demo Moment
Before presenting, pre-load PulseBoard with the name of the company whose judge is in the room. When you switch to demo mode, they see their own company being analyzed in real time — perception score, recent news, hiring signals, ESG standing, competitor moves. No judge walks away from that unmoved.

---

## 3. TARGET USERS

- **Students** — job seekers, case competition teams, researchers, investors with small portfolios, personal brand builders
- **Professionals** — early-career analysts, freelancers tracking their market, consultants monitoring client industries
- **Companies** — competitive intelligence teams, recruiting teams, PR/brand teams, compliance officers, product managers
- **Anyone** — the zero-friction input (just type a name) means literally anyone can use it immediately

---

## 4. CORE USER FLOW

```
1. Landing page (Ivory & Ink, clean, editorial)
2. User types a topic into one input field
   → Could be: "Uber", "pharma industry", "AI startups", "UBS wealth management"
3. Optional: selects a monitoring mode from a dropdown
   → General | Company Intel | Job Market | ESG Focus | Industry Trends
4. Clicks "Run PulseBoard →"
5. Agent dashboard slides in — 5 agent cards visible, all in WAITING state
6. All 5 agents fire simultaneously (Promise.all)
7. Each agent card independently updates as its result arrives:
   WAITING → ANALYZING (spinner) → COMPLETE (result populates)
8. Progress bar ticks up as each agent completes (1/5 → 2/5 → ... → 5/5)
9. Once all 5 complete, Aggregator Agent fires
10. Aggregator synthesizes all 5 outputs into a tiered intelligence brief
11. Brief renders below agent cards:
    🔴 URGENT — act on this now
    🟡 NOTABLE — worth knowing
    ⚪ FYI — background context
12. User can download brief as PDF or copy to clipboard
13. "Run Again" button resets all agents for a new query
```

---

## 5. MONITORING MODES

The mode dropdown changes each agent's focus without changing the architecture. Same 5 agents, different system prompt emphasis.

| Mode | Best for | Agent focus shifts |
|---|---|---|
| **General** | Default, any topic | Balanced across all signal types |
| **Company Intel** | Researching a specific company | News + hiring + sentiment weighted heavily |
| **Job Market** | Tracking hiring trends in a field | Job signal + competitor agents focus on roles |
| **ESG Focus** | Sustainability & values alignment | ESG/regulatory agents weighted heavily |
| **Industry Trends** | Sector-wide research | Competitor + news agents scan industry-wide |

---

## 6. THE 6 AGENTS — PHASE 1 DETAILED SPECS

### Agent 1 — News Watcher 📰
**Trigger**: Fires immediately, parallel with Agents 2-5
**Input**: Topic + monitoring mode
**Tool**: Web search (OpenAI web_search tool enabled)
**System Prompt**:
```
You are an intelligence analyst specializing in news monitoring. Search for the most recent and relevant news about the given topic. Return a JSON object with:
- headlines: array of 4 objects {title: string, summary: string (1 sentence), sentiment: string (positive/negative/neutral), recency: string (e.g. "2 days ago")}
- overallSentiment: string (positive/negative/mixed/neutral)
- biggestStory: string — the single most important recent development in 2 sentences
- signalStrength: number 0-100 — how much news activity exists (100 = major story everywhere, 0 = nothing recent)
- urgencyFlag: boolean — true if any headline represents a breaking or time-sensitive development
Return ONLY valid JSON, no markdown, no explanation.
```
**Output displayed as**: Sentiment badge + headline list with recency tags + biggest story callout

---

### Agent 2 — Job Signal Tracker 💼
**Trigger**: Fires immediately, parallel with Agents 1, 3, 4, 5
**Input**: Topic + monitoring mode
**Tool**: Web search
**System Prompt**:
```
You are a talent market analyst who monitors hiring signals to understand company health and strategy. Based on the topic provided, analyze the current hiring landscape. Return a JSON object with:
- hiringVelocity: string (accelerating/stable/slowing/freezing) — overall hiring pace
- velocityScore: number 0-100 (100 = aggressive hiring, 0 = layoffs/freeze)
- hotRoles: array of 3 strings — job titles being hired most aggressively right now
- hiringSignal: string — what the hiring pattern reveals about company strategy (2 sentences)
- redFlags: array of 2 strings — any concerning signals (mass layoffs, hiring freezes, leadership exits) — return empty array if none
- opportunitySignal: string — 1 sentence on what this means for someone considering working here or doing business with them
Return ONLY valid JSON, no markdown, no explanation.
```
**Output displayed as**: Velocity gauge + hot roles chips + signal insight + red flag warnings if present

---

### Agent 3 — Sentiment Analyzer 💬
**Trigger**: Fires immediately, parallel with Agents 1, 2, 4, 5
**Input**: Topic + monitoring mode
**Tool**: Web search
**System Prompt**:
```
You are a brand intelligence analyst who monitors public perception and sentiment. Search for what people are saying about the given topic across reviews, forums, social signals, and public commentary. Return a JSON object with:
- sentimentScore: number 0-100 (100 = extremely positive, 50 = neutral, 0 = extremely negative)
- sentimentLabel: string (e.g. "Cautiously Positive", "Divided", "Strong Backlash", "Enthusiastic")
- whatPeopleAreSaying: array of 3 objects {theme: string, sentiment: string (pos/neg/neutral), detail: string (1 sentence)}
- audienceBreakdown: object {employees: string, customers: string, investors: string} — 1 sentence each on how each group feels
- reputationRisk: string (low/medium/high)
- reputationInsight: string — most important perception insight in 2 sentences
Return ONLY valid JSON, no markdown, no explanation.
```
**Output displayed as**: Sentiment score ring + label + theme cards + audience breakdown + reputation risk badge

---

### Agent 4 — Regulatory & ESG Scanner 🏛️
**Trigger**: Fires immediately, parallel with Agents 1, 2, 3, 5
**Input**: Topic + monitoring mode
**Tool**: Web search
**System Prompt**:
```
You are a regulatory intelligence and ESG analyst. Monitor the regulatory environment and sustainability standing for the given topic. Return a JSON object with:
- regulatoryRisk: string (low/medium/high/critical)
- recentRegActions: array of 3 objects {action: string, impact: string (low/medium/high), detail: string (1 sentence)} — return fewer if none found
- esgScore: number 0-100 (100 = excellent ESG standing)
- esgLabel: string (e.g. "ESG Leader", "Improving", "Lagging", "Under Scrutiny")
- esgHighlights: array of 2 strings — notable ESG commitments or failures
- watchlist: array of 2 strings — upcoming regulatory events or deadlines to watch
- complianceInsight: string — most important regulatory or ESG insight in 2 sentences
Return ONLY valid JSON, no markdown, no explanation.
```
**Output displayed as**: Regulatory risk badge + recent actions list + ESG score ring + watchlist items

---

### Agent 5 — Competitor Tracker 🎯
**Trigger**: Fires immediately, parallel with Agents 1, 2, 3, 4
**Input**: Topic + monitoring mode
**Tool**: Web search
**System Prompt**:
```
You are a competitive intelligence analyst. Identify and analyze the competitive landscape for the given topic. Return a JSON object with:
- topCompetitors: array of 3 objects {name: string, threat: string (low/medium/high), recentMove: string (1 sentence on what they did recently)}
- competitiveLandscape: string (consolidating/stable/disrupted/emerging) — overall market dynamic
- marketPosition: string — where the subject stands relative to competitors in 2 sentences
- biggestThreat: string — the single most significant competitive threat right now in 1 sentence
- opportunity: string — a competitive gap or opportunity visible from the landscape in 1 sentence
- differentiator: string — what makes the subject distinctly different from competitors in 1 sentence
Return ONLY valid JSON, no markdown, no explanation.
```
**Output displayed as**: Competitor cards with threat badges + market position summary + threat/opportunity callouts

---

### Agent 6 — Aggregator (Synthesizer) ⚡
**Trigger**: Fires LAST, only after all 5 agents complete
**Input**: All 5 agent outputs combined + original topic + monitoring mode
**Tool**: None (synthesis only, no web search)
**System Prompt**:
```
You are a senior intelligence analyst. You have received reports from 5 specialized monitoring agents about a topic. Synthesize everything into one tiered intelligence brief. Return a JSON object with:
- subjectSummary: string — who/what this topic is, in 1-2 sentences for context
- overallRiskScore: number 0-100 (100 = maximum risk/urgency)
- overallOpportunityScore: number 0-100 (100 = maximum opportunity)
- urgent: array of objects {finding: string, source: string (which agent), action: string (what to do about it)} — only include if genuinely urgent, can be empty array
- notable: array of 3 objects {finding: string, source: string, whyItMatters: string}
- fyi: array of 3 objects {finding: string, context: string}
- oneLineSummary: string — single most important thing to know about this topic right now
- recommendedActions: array of 3 strings — specific things the user should do with this intelligence
- monitoringFrequency: string — how often they should re-run PulseBoard on this topic (daily/weekly/monthly) and why
Return ONLY valid JSON, no markdown, no explanation.
```
**Output displayed as**: One-line summary banner → 🔴 URGENT cards → 🟡 NOTABLE cards → ⚪ FYI cards → Recommended actions → Monitoring frequency suggestion

---

## 7. UI/UX REQUIREMENTS

### Design Language — Ivory & Ink
Full palette spec:

| Token | Value | Usage |
|---|---|---|
| Page background | `#f5f2ee` | Outermost background |
| Surface | `#eae5dd` | Topbar, mode dropdown, input bg |
| Card | `#ffffff` | Agent cards, brief cards |
| Card border | `rgba(26,26,46,0.10)` | All card borders |
| Accent / Ink | `#1a1a2e` | CTA button, score numbers, active states |
| Accent dim | `rgba(26,26,46,0.06)` | Hover fills, badge backgrounds |
| Text primary | `#1a1a2e` | Headings, labels |
| Text secondary | `rgba(26,26,46,0.55)` | Body copy, descriptions |
| Text muted | `rgba(26,26,46,0.30)` | Placeholders, hints, meta |
| Urgent red | `#c0392b` / bg `rgba(192,57,43,0.08)` | 🔴 URGENT items |
| Notable amber | `#b7770d` / bg `rgba(183,119,13,0.08)` | 🟡 NOTABLE items |
| FYI gray | `rgba(26,26,46,0.45)` / bg `rgba(26,26,46,0.04)` | ⚪ FYI items |
| Success green | `#3b6d11` / bg `rgba(59,109,17,0.08)` | Complete badges, positive signals |
| CTA button | bg `#1a1a2e` / text `#f5f2ee` | Primary action |

### Typography
- **Logo / Hero title**: Google Fonts — "Playfair Display" — editorial, premium, distinctive
- **All UI text**: Google Fonts — "DM Sans" — clean, readable, modern
- **Heading sizes**: h1 = 22px / h2 = 18px / h3 = 15px — all weight 500
- **Body**: 13px, weight 400, line-height 1.6
- **Labels/badges**: 10-11px, weight 500, uppercase where used for status

### Screen A — Hero / Input
```
┌─────────────────────────────────────────┐
│  TOPBAR: PulseBoard logo (Playfair)     │
│          + "Phase 1" subtle badge        │
├─────────────────────────────────────────┤
│                                         │
│   [Centered, generous whitespace]       │
│                                         │
│   PulseBoard                            │  ← Playfair Display, 32px
│   Real-time intelligence, in 60s        │  ← DM Sans, muted, 14px
│                                         │
│   ┌─────────────────────────────────┐   │
│   │ Type anything to monitor...     │   │  ← Single text input, full width
│   │ e.g. "Uber", "pharma industry"  │   │
│   └─────────────────────────────────┘   │
│                                         │
│   ┌──────────────┐                      │
│   │ Mode: General▼│                     │  ← Dropdown: General / Company Intel /
│   └──────────────┘                      │    Job Market / ESG Focus / Industry
│                                         │
│   [ Run PulseBoard → ]                  │  ← Full width, ink button
│                                         │
│   Example topics: [Uber] [UBS]          │  ← Clickable chips that pre-fill input
│   [L'Oréal] [pharma] [AI startups]     │
│                                         │
└─────────────────────────────────────────┘
```

### Screen B — Agent Dashboard
```
┌─────────────────────────────────────────┐
│  TOPBAR: PulseBoard | Monitoring: "Uber"│
│          [New Query] button (right)      │
├─────────────────────────────────────────┤
│  Progress: ████████░░ 4/5 agents done   │  ← Ink fill, 3px height
├─────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────────┐ │
│  │ 📰 News      │  │ 💼 Job Signals   │ │  ← 2-column grid
│  │ [ANALYZING]  │  │ [COMPLETE]       │ │
│  │ ...          │  │ output here      │ │
│  └──────────────┘  └──────────────────┘ │
│  ┌──────────────┐  ┌──────────────────┐ │
│  │ 💬 Sentiment │  │ 🏛️ Regulatory   │ │
│  │ [COMPLETE]   │  │ [WAITING]        │ │
│  │ output here  │  │ ...              │ │
│  └──────────────┘  └──────────────────┘ │
│  ┌──────────────────────────────────┐   │
│  │ 🎯 Competitor Tracker [COMPLETE] │   │  ← Full width (5th card)
│  │ output here                      │   │
│  └──────────────────────────────────┘   │
├─────────────────────────────────────────┤
│  ⚡ Aggregator firing...                │  ← Full-width banner, subtle pulse
├─────────────────────────────────────────┤
│  [Intelligence Brief renders here]      │
└─────────────────────────────────────────┘
```

### Screen C — Intelligence Brief (renders after Aggregator)
```
┌─────────────────────────────────────────┐
│  INTELLIGENCE BRIEF — Uber              │
│  "Uber is aggressively expanding into   │
│   autonomous logistics while facing     │
│   mounting regulatory pressure in EU"   │  ← oneLineSummary, prominent
│                                         │
│  Risk: ████░░░░ 52    Opp: ██████░░ 71 │  ← dual score bars
├─────────────────────────────────────────┤
│  🔴 URGENT                              │
│  ┌─────────────────────────────────┐   │
│  │ EU Commission opened antitrust  │   │
│  │ investigation this week         │   │
│  │ Source: Regulatory Agent        │   │
│  │ Action: Monitor for Q4 impact   │   │
│  └─────────────────────────────────┘   │
├─────────────────────────────────────────┤
│  🟡 NOTABLE                             │
│  [3 cards, amber background]            │
├─────────────────────────────────────────┤
│  ⚪ FYI                                 │
│  [3 items, subtle gray, smaller]        │
├─────────────────────────────────────────┤
│  Recommended Actions                    │
│  1. ...  2. ...  3. ...                 │
│                                         │
│  Monitor frequency: Weekly              │
│                                         │
│  [Download Brief PDF]  [Copy to Clipboard] [Run New Query →]
└─────────────────────────────────────────┘
```

### Agent Card States
Each card cycles through exactly 3 states:

**WAITING** (before run starts or before its turn):
- Border: `rgba(26,26,46,0.08)`
- Badge: muted gray, "Waiting" text, subtle pulse animation on the dot
- Body: "Standby..." in text-muted color

**ANALYZING** (agent API call in progress):
- Border: `rgba(26,26,46,0.20)` — slightly more visible
- Badge: ink color, spinning indicator, "Analyzing" text
- Body: shimmer/skeleton loading effect (CSS animation on placeholder bars)

**COMPLETE** (result received and rendered):
- Border: `rgba(59,109,17,0.25)` — green tint
- Badge: green `#3b6d11`, checkmark, "Complete" text
- Body: actual output fades in with 0.3s opacity transition

### Responsive Layout
- **Desktop (>768px)**: 2-column agent grid, brief in full width below
- **Mobile (<768px)**: Single column, all cards stacked, brief scrolls naturally
- **No horizontal scroll anywhere**

---

## 8. TECHNICAL ARCHITECTURE

### Stack
- **Single file**: `index.html` — all HTML, CSS, and JavaScript in one file
- **No build tools, no npm, no frameworks**
- **AI**: OpenAI API — `gpt-4o` model with `web_search_20250305` tool enabled
- **API key**: collected via `prompt()` on page load
- **No backend, no database**: fully stateless, everything in memory

### File Structure
```
pulseboard/
├── index.html        ← Everything lives here
├── README.md         ← Setup + API key instructions
└── demo-topics.txt   ← Pre-loaded demo topics for judging day
```

### State Object
```javascript
const state = {
  topic: "",
  mode: "general",        // general | company | jobmarket | esg | industry
  agentStatus: {
    news: "waiting",      // waiting | analyzing | complete | error
    jobs: "waiting",
    sentiment: "waiting",
    regulatory: "waiting",
    competitor: "waiting",
    aggregator: "waiting"
  },
  agentResults: {
    news: null,
    jobs: null,
    sentiment: null,
    regulatory: null,
    competitor: null,
    aggregator: null
  },
  runCount: 0             // tracks how many times user has run (for UI messaging)
}
```

### Core Agent Runner Function
```javascript
async function runAgent(agentName, systemPrompt, userContent, useWebSearch = true) {
  updateAgentStatus(agentName, "analyzing")

  const tools = useWebSearch ? [{
    type: "web_search_20250305",
    name: "web_search"
  }] : []

  const response = await fetch("https://api.openai.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": OPENAI_API_KEY,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      system: systemPrompt,
      messages: [{ role: "user", content: userContent }],
      tools: tools
    })
  })

  const data = await response.json()

  // Extract text content from response (handles tool use blocks)
  const fullText = data.content
    .filter(block => block.type === "text")
    .map(block => block.text)
    .join("")

  // Strip any markdown fences if present
  const clean = fullText.replace(/```json|```/g, "").trim()
  const result = JSON.parse(clean)

  state.agentResults[agentName] = result
  updateAgentStatus(agentName, "complete")
  renderAgentOutput(agentName, result)

  return result
}
```

### Orchestration Flow
```javascript
async function runPulseBoard() {
  showDashboard()
  resetAllAgents()

  // All 5 monitoring agents fire simultaneously
  const [newsResult, jobsResult, sentimentResult, regulatoryResult, competitorResult] =
    await Promise.all([
      runAgent("news", NEWS_PROMPT, buildUserContent(), true),
      runAgent("jobs", JOBS_PROMPT, buildUserContent(), true),
      runAgent("sentiment", SENTIMENT_PROMPT, buildUserContent(), true),
      runAgent("regulatory", REGULATORY_PROMPT, buildUserContent(), true),
      runAgent("competitor", COMPETITOR_PROMPT, buildUserContent(), true)
    ])

  // Aggregator fires only after all 5 complete
  showAggregatorBanner()

  const synthInput = `
    Topic: ${state.topic}
    Mode: ${state.mode}

    News Intelligence: ${JSON.stringify(newsResult)}
    Job Signals: ${JSON.stringify(jobsResult)}
    Sentiment Analysis: ${JSON.stringify(sentimentResult)}
    Regulatory & ESG: ${JSON.stringify(regulatoryResult)}
    Competitive Landscape: ${JSON.stringify(competitorResult)}
  `

  const briefResult = await runAgent("aggregator", AGGREGATOR_PROMPT, synthInput, false)
  renderBrief(briefResult)
}

function buildUserContent() {
  return `Topic to monitor: "${state.topic}"\nMonitoring mode: ${state.mode}`
}
```

### Error Handling
```javascript
// Per-agent error handling — one agent failing doesn't crash the run
async function runAgentSafe(agentName, systemPrompt, userContent, useWebSearch) {
  try {
    return await runAgent(agentName, systemPrompt, userContent, useWebSearch)
  } catch (err) {
    console.error(`Agent ${agentName} failed:`, err)
    updateAgentStatus(agentName, "error")
    showAgentError(agentName)
    // Return a minimal fallback so Aggregator can still run
    return { error: true, agentName, message: "Agent encountered an error" }
  }
}

// Aggregator checks for errors before synthesizing
function hasEnoughData() {
  const results = Object.values(state.agentResults)
  const successCount = results.filter(r => r && !r.error).length
  return successCount >= 3  // Need at least 3/5 agents to succeed
}
```

### PDF Download
```javascript
function downloadBrief() {
  window.print()  // CSS @media print hides everything except the brief section
}
```

Add print CSS:
```css
@media print {
  .topbar, .input-screen, .agent-dashboard, .aggregator-banner { display: none; }
  .brief-section { display: block !important; }
  body { background: white; }
}
```

---

## 9. AGENT TIMING & ORCHESTRATION MAP

```
T+0s     User clicks "Run PulseBoard"
         │
         ├──────────────────────────────────────────────────┐
         │              ALL 5 FIRE SIMULTANEOUSLY           │
         │                                                  │
         │  [Agent 1: News Watcher]      ~10-15s           │
         │  [Agent 2: Job Signal Tracker] ~10-15s          │
         │  [Agent 3: Sentiment Analyzer] ~10-15s          │
         │  [Agent 4: Regulatory Scanner] ~10-15s          │
         │  [Agent 5: Competitor Tracker] ~10-15s          │
         └──────────────────────────────────────────────────┘
                               │
                    (slowest agent finishes)
                               │ ~15s from start
T+15s    ┌─────────────────────▼──────────────────────────────┐
         │         Agent 6: Aggregator fires                   │
         │         (no web search, synthesis only)             │
         └─────────────────────┬──────────────────────────────┘
                               │ ~8-10s
T+25s    ✅ Full Intelligence Brief Rendered
         → One-line summary
         → 🔴 URGENT / 🟡 NOTABLE / ⚪ FYI cards
         → Recommended actions
         → Download + Copy buttons active
```

---

## 10. EXAMPLE TOPICS PRELOADED FOR DEMO

Add clickable chips on the hero screen that pre-fill the input:

```javascript
const DEMO_TOPICS = [
  { label: "Uber", mode: "company" },
  { label: "UBS", mode: "company" },
  { label: "L'Oréal", mode: "esg" },
  { label: "Sikich", mode: "company" },
  { label: "GEICO", mode: "company" },
  { label: "pharma industry", mode: "industry" },
  { label: "AI startups", mode: "industry" },
  { label: "ZS Associates", mode: "company" }
]
```

**For judging day**: Before the demo, click the chip for whichever sponsor's judge is in the room. Run it. Their own company appears in the brief. This is the moment.

---

## 11. MODE-SPECIFIC PROMPT MODIFIERS

Each monitoring mode adds a modifier line to the user content passed to all agents. This shifts agent focus without changing architecture.

```javascript
const MODE_MODIFIERS = {
  general: "Provide balanced coverage across all signal types.",
  company: "Focus heavily on company health, culture, hiring signals, and competitive position.",
  jobmarket: "Prioritize hiring trends, role demand, salary signals, and workforce movement.",
  esg: "Weight ESG performance, sustainability commitments, and regulatory compliance heavily.",
  industry: "Scan industry-wide trends, not just a single company — look for sector patterns."
}

function buildUserContent() {
  return `
    Topic to monitor: "${state.topic}"
    Monitoring mode: ${state.mode}
    Focus instruction: ${MODE_MODIFIERS[state.mode]}
  `
}
```

---

## 12. SPONSOR ALIGNMENT COPY (For submission write-up)

> PulseBoard is a real-time multi-agent intelligence platform that serves two audiences simultaneously — students who want to understand the world they're entering, and companies who need to understand the market they're competing in.

| Sponsor | Direct value |
|---|---|
| **Uber** | Drivers and operators use General mode to track Uber itself — understanding the company they work for. Uber's strategy team uses Company Intel mode to monitor Lyft, Waymo, and regulatory moves across 70+ markets. |
| **UBS** | Students use PulseBoard to research UBS before interviews — arriving informed, not generic. UBS analysts use it to generate morning intelligence briefs on Goldman Sachs, Morgan Stanley, and market-moving regulatory filings. |
| **Sikich** | Accounting and consulting students research Sikich's practice areas and culture. Sikich consultants monitor client industries and competitor CPA firms — exactly the kind of advisory intelligence Sikich sells. |
| **GEICO** | Students research GEICO's culture and competitive position before applying. GEICO's competitive team tracks Progressive, Allstate, and insurance regulatory changes in real time. |
| **L'Oréal** | Beauty and marketing students track L'Oréal's brand, campaigns, and ESG story. L'Oréal's brand team monitors Estée Lauder, tracks consumer sentiment, and watches sustainability headlines that affect their brand. |
| **ZS Associates** | Students research ZS's pharma consulting work. ZS analysts monitor FDA regulatory moves, pharma M&A signals, and competitor consultancies — intelligence they currently build manually. |
| **KPFF** | Engineering students understand KPFF's market and project focus. KPFF monitors infrastructure policy changes and competitor bid activity — market intelligence that wins projects. |

---

## 13. DEMO SCRIPT — JUDGING DAY

**Setup** (5 min before demo):
- API key already entered (hardcode for demo, remove after)
- Browser tab open on hero screen
- Demo topic chips visible

**Script** (2 minutes):

1. "PulseBoard is a multi-agent intelligence platform. Type anything — a company, an industry, a topic — and five AI agents monitor it simultaneously, each watching a different signal channel."

2. Click the chip for the sponsor judge in the room. E.g. click "UBS".

3. "Watch — all five agents fire at the same moment. News Watcher, Job Signal Tracker, Sentiment Analyzer, Regulatory Scanner, Competitor Tracker — all running in parallel right now."

4. As cards populate: "Each agent completes independently. You can already read the job signals while the regulatory agent is still working."

5. "Once all five finish, the Aggregator synthesizes everything into a single tiered brief — Urgent, Notable, FYI — so you know exactly what to act on."

6. Show the brief: "Here's what matters about UBS right now. One line summary. Ranked by urgency. With three specific recommended actions."

7. "A student uses this to walk into a UBS interview knowing more than most analysts. A UBS recruiter uses this to understand what candidates see when they research the firm."

8. "Same tool. Same agents. Different users. That's the design."

---

## 14. SUBMISSION CHECKLIST

- [ ] App runs fully in the browser with no installation
- [ ] All 5 monitoring agents fire in parallel and display output independently
- [ ] Aggregator fires after all 5 complete and renders tiered brief
- [ ] All 5 monitoring modes work (General, Company Intel, Job Market, ESG, Industry)
- [ ] Demo topic chips pre-fill the input correctly
- [ ] Error handling: one agent failing does not crash the full run
- [ ] Brief renders correctly: URGENT / NOTABLE / FYI sections
- [ ] Download brief (print CSS) works
- [ ] Copy to clipboard works
- [ ] Ivory & Ink design implemented correctly (all color tokens)
- [ ] Playfair Display + DM Sans fonts loaded from Google Fonts
- [ ] Mobile responsive (single column on small screens)
- [ ] README with API key setup instructions
- [ ] Demo topics pre-loaded: all 7 sponsor companies included
- [ ] Recorded demo video (60-90 seconds) — use a sponsor company for live demo
- [ ] Submitted on Handshake before April 30, 2026

---

## 15. PHASE 2 ROADMAP (Don't build yet — finish Phase 1 first)

Once Phase 1 is submitted and working, Phase 2 adds:

1. **Persistent Memory** — agents read previous run results from artifact storage API, compare deltas, surface only what changed since last run
2. **Delta Detection** — "New since your last run" section at top of brief
3. **Escalation Judge** — 7th agent that autonomously decides urgency level based on delta magnitude
4. **CSV Data Analyst Agent** — user uploads internal data CSV, a new agent cross-references it against monitoring agent findings ("your internal sales dropped 12% in the same quarter our agents detected a competitor price cut")
5. **Scheduled Monitoring** — set a topic to re-run automatically every 24 hours
6. **Multi-topic Dashboard** — monitor up to 5 topics simultaneously in a grid view

---

## 16. PROMPT TO START BUILDING IN CODEX

Copy and paste this exactly into Codex to begin:

```
Build a single-file web app called PulseBoard. It is a real-time multi-agent intelligence monitoring platform.

TECH STACK:
- Single index.html file — all HTML, CSS, and JavaScript in one file
- No frameworks, no build tools, no npm
- OpenAI API with web search tool enabled, called directly from the browser
- Collect API key via prompt() on page load
- Model: gpt-4o with web_search tool

DESIGN — Ivory & Ink palette:
- Page background: #f5f2ee (warm off-white)
- Surface / topbar: #eae5dd
- Cards: #ffffff with border rgba(26,26,46,0.10)
- Accent / ink: #1a1a2e (buttons, scores, active states)
- Text primary: #1a1a2e | Secondary: rgba(26,26,46,0.55) | Muted: rgba(26,26,46,0.30)
- URGENT: red #c0392b / bg rgba(192,57,43,0.08)
- NOTABLE: amber #b7770d / bg rgba(183,119,13,0.08)
- FYI: muted gray / bg rgba(26,26,46,0.04)
- Complete badge: green #3b6d11
- CTA button: bg #1a1a2e / text #f5f2ee
- Fonts: Google Fonts — "Playfair Display" for logo and hero title, "DM Sans" for all body/UI
- Feel: high-end editorial, premium, calm. No dark backgrounds, no glowing effects.

SCREENS:
1. Hero screen:
   - Logo "PulseBoard" in Playfair Display
   - Single text input: "Type anything to monitor..." 
   - Mode dropdown: General | Company Intel | Job Market | ESG Focus | Industry Trends
   - "Run PulseBoard →" CTA button (full width, ink bg)
   - Clickable example chips: Uber, UBS, L'Oréal, Sikich, GEICO, pharma industry, AI startups, ZS Associates

2. Agent dashboard:
   - Topbar showing "Monitoring: [topic]" + "New Query" button
   - Progress bar (ink fill, 3px height) showing X/5 agents complete
   - 2x2 grid of 4 agent cards + 1 full-width card for 5th agent
   - Each card: icon + agent name + status badge + output area
   - Status states: WAITING (muted, pulse dot) → ANALYZING (ink spinner + skeleton shimmer) → COMPLETE (green badge, content fades in)
   - Full-width "⚡ Aggregator synthesizing..." banner appears after all 5 complete

3. Intelligence Brief section (renders below dashboard after Aggregator):
   - One-line summary in large type
   - Dual score bars: Risk score + Opportunity score
   - 🔴 URGENT section (red cards) — can be empty
   - 🟡 NOTABLE section (amber cards)
   - ⚪ FYI section (gray, smaller)
   - Recommended Actions list
   - Monitoring frequency suggestion
   - Download Brief button (triggers window.print()) + Copy to Clipboard button

THE 6 AGENTS:

Agent 1 — News Watcher (web search enabled):
System: You are an intelligence analyst monitoring news. Search for recent news about the topic. Return JSON:
{ headlines: [{title, summary, sentiment, recency}] (4 items), overallSentiment, biggestStory, signalStrength (0-100), urgencyFlag (boolean) }

Agent 2 — Job Signal Tracker (web search enabled):
System: You are a talent market analyst monitoring hiring signals. Return JSON:
{ hiringVelocity, velocityScore (0-100), hotRoles (3 strings), hiringSignal, redFlags (array, can be empty), opportunitySignal }

Agent 3 — Sentiment Analyzer (web search enabled):
System: You are a brand intelligence analyst monitoring public perception. Return JSON:
{ sentimentScore (0-100), sentimentLabel, whatPeopleAreSaying [{theme, sentiment, detail}] (3 items), audienceBreakdown {employees, customers, investors}, reputationRisk (low/medium/high), reputationInsight }

Agent 4 — Regulatory & ESG Scanner (web search enabled):
System: You are a regulatory and ESG analyst. Return JSON:
{ regulatoryRisk (low/medium/high/critical), recentRegActions [{action, impact, detail}] (up to 3), esgScore (0-100), esgLabel, esgHighlights (2 strings), watchlist (2 strings), complianceInsight }

Agent 5 — Competitor Tracker (web search enabled):
System: You are a competitive intelligence analyst. Return JSON:
{ topCompetitors [{name, threat, recentMove}] (3 items), competitiveLandscape, marketPosition, biggestThreat, opportunity, differentiator }

Agent 6 — Aggregator (NO web search, synthesis only):
System: You are a senior intelligence analyst synthesizing 5 agent reports. Return JSON:
{ subjectSummary, overallRiskScore (0-100), overallOpportunityScore (0-100), urgent [{finding, source, action}] (can be empty array), notable [{finding, source, whyItMatters}] (3 items), fyi [{finding, context}] (3 items), oneLineSummary, recommendedActions (3 strings), monitoringFrequency }

ORCHESTRATION:
- Agents 1-5 all fire simultaneously using Promise.all()
- Each agent updates its card independently as it completes — do not wait for all to finish before showing results
- Agent 6 fires only after all 5 complete
- Wrap each agent in try/catch — one failure must not crash the run
- If 3+ agents succeed, still run the Aggregator with available data

Each agent call must:
- Use response_format: { type: "json_object" } for clean JSON output
- Have web_search tool enabled (except Aggregator)
- Show ANALYZING state with spinner while awaiting response
- Smoothly fade in output content on completion

PRINT CSS:
Hide everything except .brief-section when printing. White background.

Make it look polished, editorial, and impressive. This is a competition submission judged by executives from Uber, UBS, Sikich, GEICO, L'Oréal, ZS Associates, and KPFF Engineers.
```
