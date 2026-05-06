# PulseBoard

PulseBoard is an AI intelligence platform that turns live external signals and internal CSV data into decision-ready briefs. It combines 5 parallel monitoring agents, structured CSV analysis, cross-referencing between internal data and external market signals, and an interactive follow-up assistant called `Ask PulseBoard` to help users move from raw information to clear action.

This project was built independently from end to end, including product design, frontend experience, backend relay logic, multi-provider model integration, reliability handling, CSV analysis workflows, and deployment.

## Try It Live

- Live app: `Add your Vercel URL here`
- Demo video / walkthrough: `Add your demo link here`
- Screenshots: `Add screenshots or a GIF here`

Recommended reviewer path:

1. Open the deployed app.
2. Run a monitoring query.
3. Open `Ask PulseBoard` and ask a follow-up question.
4. Try a curated CSV demo file.
5. Run `Cross-Reference with Live Intelligence`.

## Built Independently

PulseBoard was built solo as a full-stack AI product. That includes:

- product direction and feature design
- frontend UX and interaction design
- multi-agent orchestration and backend relay logic
- model/provider integration across OpenAI, Anthropic, Gemini, and NVIDIA
- CSV analysis, comparison, cleaning, and cross-reference workflows
- Ask PulseBoard follow-up chat across monitoring, CSV analysis, and Interview Prep
- Vercel deployment setup and judge-friendly demo readiness

## Why PulseBoard

Most tools either monitor external signals or analyze internal data. PulseBoard is designed to do both in one workflow.

It helps users:

- monitor companies, industries, and market topics with parallel AI agents
- analyze uploaded CSV datasets and surface structured insights
- compare two CSV files to understand change over time
- cross-reference internal findings with external live intelligence
- ask natural follow-up questions after a result is generated

The goal is not just summarization. The goal is to make intelligence easier to act on.

## Core Features

### 1. 5-Agent Monitoring

PulseBoard runs five parallel monitoring agents that specialize in different signal types:

- `News Watcher`
- `Job Signal Tracker`
- `Sentiment Analyzer`
- `Regulatory & ESG Scanner`
- `Competitor Tracker`

These agents gather external signals and feed them into a synthesis layer that produces a single `Intelligence Brief` with:

- `Risk score`
- `Opportunity score`
- urgent findings
- notable findings
- FYI items
- recommended actions
- reliability metadata

### 2. Interview Prep Mode

PulseBoard includes a dedicated `Interview Prep` flow for company and role research. Instead of a generic market brief, it generates an interview-focused brief that can include:

- likely interview rounds
- prep focus areas
- role expectations
- process signals
- candidate-experience themes
- official or verified prep materials

### 3. CSV Analysis

PulseBoard supports single-file CSV analysis and turns raw uploaded data into a structured brief with:

- dataset summary
- schema and quality signals
- descriptive analytics
- trends and segments
- notable findings
- charts and summaries

### 4. Data Cleaning Workflow

The CSV experience also includes a dedicated cleaning workflow that can make transformation decisions visible instead of hidden. It supports:

- raw vs cleaned analysis mode
- missing-value handling strategies
- row-drop controls
- cleaning summary chips
- changed-value previews
- transformation logs

### 5. Compare Two CSV Files

PulseBoard can compare two CSV files and produce a change-focused brief that highlights:

- file-level differences
- metric movement
- anomalies and outliers
- key comparisons
- chartable changes over time

### 6. Cross-Reference Internal and External Signals

One of PulseBoard's strongest differentiators is cross-reference. After analyzing CSV data, users can connect internal findings to live external intelligence.

This makes it possible to move from questions like:

- "What changed in our data?"

to:

- "How does this change align with hiring, sentiment, competitors, or market conditions?"

### 7. Ask PulseBoard

`Ask PulseBoard` is a floating, draggable, resizable follow-up chat that appears after supported results are generated.

It currently works across:

- monitoring briefs
- Interview Prep briefs
- single-file CSV analysis

Capabilities include:

- brief follow-up questions on the current monitoring run
- live-search escalation when the answer is not explicitly present in the saved brief
- CSV dataset follow-up questions
- deterministic row retrieval from uploaded CSVs
- inline row previews with `See all rows`

### 8. Demo-Ready CSV Datasets

To reduce setup friction for judges and reviewers, PulseBoard includes curated CSV demo files for:

- general CSV analysis
- charts
- Ask PulseBoard row retrieval
- cross-reference with live intelligence
- data cleaning
- compare-mode demo pair

### 9. Built-In Demo Connection with Optional Override

PulseBoard supports a hosted demo mode where the app works out of the box using server-side provider keys. Users can still optionally enter their own key to override the built-in connection for their browser session.

This makes the product easier to evaluate without requiring API-key setup from first-time users.

## How It Works

### Frontend

The frontend is a single-page interface, with extracted helper scripts for CSV processing. It handles:

- route-style page states for home, query, csv, guide, and api-key
- live monitoring progress UI
- brief rendering
- CSV ingestion, preview, and cleaning controls
- Ask PulseBoard floating chat
- demo file selection for judge-friendly testing

### Relay / Backend

The backend relay

- provider normalization
- model execution
- multi-agent orchestration
- streaming monitoring updates
- CSV analysis and comparison relay paths
- Ask PulseBoard scenario follow-ups
- built-in demo connection resolution with fallback providers
- safe connection-status reporting to the frontend

### Model / Provider Layer

PulseBoard is designed to work across multiple LLM providers:

- OpenAI
- Anthropic
- Google Gemini
- NVIDIA

The relay supports:

- provider-specific request formatting
- validation probes
- normalized error handling
- built-in demo provider fallback behavior

### Search Layer

For live monitoring and follow-up answers, PulseBoard uses web search signals and attaches reliability metadata such as:

- source count
- verified links
- freshness labeling
- confidence labeling
- degraded-run warnings when coverage is partial

## Reliability and Trust Features

PulseBoard includes explicit reliability cues so the output feels inspectable instead of black-boxed:

- `Freshness tags`
- `Confidence labels`
- `Based on X signals`
- `Verified links only`
- honest partial-run messaging when agents or searches actually fail
- monitoring score normalization to keep scores on a real `0-100` scale

## Demo Flow for Judges and Reviewers

### Best Monitoring Demo

1. Go to `New Query Monitoring`.
2. Enter a company or topic.
3. Run the monitoring brief.
4. Show the 5 parallel agents updating.
5. Open the generated brief.
6. Click `Ask PulseBoard`.
7. Ask a follow-up question about the current brief.

Good follow-up examples:

- `What does the biggest risk actually mean in practice?`
- `Are they hiring for interns right now?`
- `What should I watch over the next 2 weeks?`

### Best CSV Demo

1. Go to `Analyze CSV`.
2. Load one of the curated demo files.
3. Run single-file analysis.
4. Open `Ask PulseBoard`.
5. Ask a row-level question such as:
   - `Show me the rows where payment method is crypto`
6. Show inline row retrieval and `See all rows`.

### Best Cross-Reference Demo

1. Load the recommended cross-reference CSV demo.
2. Run CSV analysis.
3. Click `Cross-Reference with Live Intelligence`.
4. Show how internal dataset patterns are paired with external market signals.

### Best Data Cleaning Demo

1. Load the cleaning-focused demo dataset.
2. Start in raw mode.
3. Switch to `Apply cleaning`.
4. Show changed-value previews, cleaning summary, and transformation log.

## Tech Stack

- Frontend: HTML, CSS, JavaScript
- Backend relay: Node.js HTTP server
- Deployment: Vercel
- Charts / visualization: Chart.js
- Search signals: Tavily-backed search flow
- AI providers: OpenAI, Anthropic, Gemini, NVIDIA


Some of the more interesting implementation decisions in PulseBoard include:

- multi-agent monitoring orchestration with a single synthesized brief
- provider-agnostic relay design across multiple model vendors
- safe built-in demo credentials with optional user override
- deterministic CSV row retrieval before LLM synthesis for data questions
- brief-first, then live-search escalation for Ask PulseBoard follow-ups
- reliability metadata attached to monitoring outputs
- curated demo datasets and compare-pair flows for reviewer usability

## What I Built

I built PulseBoard independently, including:

- the product concept and feature design
- the full frontend application and interaction model
- the Node relay and provider abstraction layer
- monitoring, Interview Prep, CSV analysis, compare, cleaning, and cross-reference flows
- Ask PulseBoard across multiple result types
- deployment setup and demo-readiness improvements

## Future Improvements

Possible next steps for PulseBoard include:

- stronger watchlist and recurring monitoring workflows
- deeper evidence tracing for every generated claim
- richer decision-memo style outputs after monitoring runs
- expanded cross-reference intelligence beyond single-file CSV analysis
- more persistent scenario conversation history across saved sessions


---

If you are reviewing PulseBoard for an application, demo, or portfolio project, the fastest way to understand it is to try one monitoring run, one CSV demo, and one Ask PulseBoard follow-up. That sequence shows the core product story best.
