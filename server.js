const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "127.0.0.1";
const INDEX_PATH = path.join(__dirname, "index.html");

const MODE_LABELS = {
  general: "General",
  company: "Company Intel",
  jobmarket: "Job Market",
  esg: "ESG Focus",
  industry: "Industry Trends",
  interviewprep: "Interview Prep"
};

const MODE_MODIFIERS = {
  general: "Provide balanced coverage across all signal types.",
  company: "Focus heavily on company health, culture, hiring signals, and competitive position.",
  jobmarket: "Prioritize hiring trends, role demand, salary signals, and workforce movement.",
  esg: "Weight ESG performance, sustainability commitments, and regulatory compliance heavily.",
  industry: "Scan industry-wide trends, not just a single company. Look for sector patterns and macro movement.",
  interviewprep: "Build a company-specific interview roadmap for the target role using the latest reported interview signals, role expectations, and prep resources."
};

const SCENARIO_SUPPORTED_MODES = new Set(["general", "company", "jobmarket", "esg", "industry", "interviewprep"]);

const PROVIDER_PRESETS = {
  openai: {
    label: "OpenAI",
    defaultModel: "gpt-5.4",
    defaultEndpoint: "https://api.openai.com/v1",
    supportsWebSearch: true,
    supportsPulseboard: true
  },
  anthropic: {
    label: "Claude / Anthropic",
    defaultModel: "claude-sonnet-4-20250514",
    defaultEndpoint: "https://api.anthropic.com/v1/messages",
    supportsWebSearch: false,
    supportsPulseboard: true
  },
  gemini: {
    label: "Google Gemini",
    defaultModel: "gemini-2.5-flash",
    defaultEndpoint: "https://generativelanguage.googleapis.com/v1beta/models",
    supportsWebSearch: false,
    supportsPulseboard: true
  },
  nvidia: {
    label: "NVIDIA API",
    defaultModel: "openai/gpt-oss-20b",
    defaultEndpoint: "https://integrate.api.nvidia.com/v1",
    supportsWebSearch: false,
    supportsPulseboard: true
  }
};

const BUILT_IN_CONNECTION_RETRY_KINDS = new Set(["auth", "quota", "model_access", "not_found", "bad_request", "provider_unavailable"]);

const AGENT_SPECS = [
  {
    key: "news",
    label: "News Watcher",
    useWebSearch: true,
    searchQuery: (topic, mode) => `${topic} latest news ${MODE_LABELS[mode]}`,
    systemPrompt: `You are an intelligence analyst monitoring news. Search for recent news about the topic. Return ONLY valid JSON with this exact shape:
{"headlines":[{"title":"string","summary":"string","sentiment":"positive|negative|neutral","recency":"string"}],"overallSentiment":"positive|negative|mixed|neutral","biggestStory":"string","signalStrength":0,"urgencyFlag":true}

signalStrength must be an integer from 0 to 100 that reflects the overall strength and importance of recent news coverage.
Do not leave signalStrength at 0 unless there is effectively no meaningful recent news signal.`
  },
  {
    key: "jobs",
    label: "Job Signal Tracker",
    useWebSearch: true,
    searchQuery: (topic, mode) => `${topic} hiring jobs layoffs careers ${MODE_LABELS[mode]}`,
    systemPrompt: `You are a talent market analyst monitoring hiring signals. Return ONLY valid JSON with this exact shape:
{"hiringVelocity":"accelerating|stable|slowing|freezing","velocityScore":0,"hotRoles":["string","string","string"],"hiringSignal":"string","redFlags":["string"],"opportunitySignal":"string","careersPage":{"label":"string","url":"string"},"jobLinks":[{"title":"string","url":"string"}]}

Include the best official company careers/jobs page when confidently identifiable.
Include up to 3 direct live job-posting links when available.
If you are not confident about a link, omit it. Use null for careersPage and [] for jobLinks when unavailable.`
  },
  {
    key: "sentiment",
    label: "Sentiment Analyzer",
    useWebSearch: true,
    searchQuery: (topic) => `${topic} reviews sentiment employees customers investors`,
    systemPrompt: `You are a brand intelligence analyst monitoring public perception. Return ONLY valid JSON with this exact shape:
{"sentimentScore":0,"sentimentLabel":"string","whatPeopleAreSaying":[{"theme":"string","sentiment":"pos|neg|neutral","detail":"string"}],"audienceBreakdown":{"employees":"string","customers":"string","investors":"string"},"reputationRisk":"low|medium|high","reputationInsight":"string"}`
  },
  {
    key: "regulatory",
    label: "Regulatory & ESG Scanner",
    useWebSearch: true,
    searchQuery: (topic, mode) => `${topic} regulation ESG compliance sustainability ${MODE_LABELS[mode]}`,
    systemPrompt: `You are a regulatory and ESG analyst. Return ONLY valid JSON with this exact shape:
{"regulatoryRisk":"low|medium|high|critical","recentRegActions":[{"action":"string","impact":"low|medium|high","detail":"string"}],"esgScore":0,"esgLabel":"string","esgHighlights":["string","string"],"watchlist":["string","string"],"complianceInsight":"string"}`
  },
  {
    key: "competitor",
    label: "Competitor Tracker",
    useWebSearch: true,
    searchQuery: (topic, mode) => `${topic} competitors market landscape ${MODE_LABELS[mode]}`,
    systemPrompt: `You are a competitive intelligence analyst. Return ONLY valid JSON with this exact shape:
{"topCompetitors":[{"name":"string","threat":"low|medium|high","recentMove":"string"}],"competitiveLandscape":"consolidating|stable|disrupted|emerging","marketPosition":"string","biggestThreat":"string","opportunity":"string","differentiator":"string"}`
  }
];

const INTERVIEW_PREP_AGENT_SPECS = [
  {
    key: "news",
    label: "Interview Signals",
    useWebSearch: true,
    searchQuery: (topic, mode, role) => `${topic} ${role} interview rounds reddit github latest hiring org changes`,
    systemPrompt: `You are an interview intelligence analyst tracking the latest company and process signals for a target role. Return ONLY valid JSON with this exact shape:
{"reportedRoundCount":"string","signalStrength":0,"biggestSignal":"string","recentSignals":[{"title":"string","detail":"string","source":"string","recency":"string"}]}

Use the latest evidence available.
reportedRoundCount should describe the best-known number or range of rounds for this company and role.
signalStrength must be an integer from 0 to 100.`
  },
  {
    key: "jobs",
    label: "Role Expectations",
    useWebSearch: true,
    searchQuery: (topic, mode, role) => `${topic} ${role} careers job description interview skills github practice`,
    systemPrompt: `You are a role-preparation analyst. Return ONLY valid JSON with this exact shape:
{"openingStatus":"open|mixed|unclear|not_found","roleFitScore":0,"roleExpectationSummary":"string","skillAreas":["string","string","string"],"officialMaterials":[{"title":"string","url":"string","type":"job_posting|careers|official_guide|company_blog"}],"careersPage":{"label":"string","url":"string"},"jobLinks":[{"title":"string","url":"string"}]}

roleFitScore must be an integer from 0 to 100.
officialMaterials should include official company/job sources when available.
Use null for careersPage and [] for jobLinks when unavailable.`
  },
  {
    key: "sentiment",
    label: "Candidate Experience",
    useWebSearch: true,
    searchQuery: (topic, mode, role) => `${topic} ${role} interview experience reddit github glassdoor discussion`,
    systemPrompt: `You are a candidate-experience analyst. Return ONLY valid JSON with this exact shape:
{"experienceScore":0,"difficultyLabel":"easy|moderate|hard|mixed","processSentiment":"string","candidateThemes":[{"theme":"string","sentiment":"positive|negative|mixed|neutral","detail":"string","source":"string"}]}

Focus on community-reported interview experience patterns for the target role.
experienceScore must be an integer from 0 to 100.`
  },
  {
    key: "regulatory",
    label: "Process & Policy Signals",
    useWebSearch: true,
    searchQuery: (topic, mode, role) => `${topic} ${role} interview assessment hackerrank codility location visa remote onsite`,
    systemPrompt: `You are an interview process analyst. Return ONLY valid JSON with this exact shape:
{"assessmentFormat":"string","locationMode":"string","processNote":"string","constraints":["string","string"],"processMaterials":[{"title":"string","url":"string","type":"prep_repo|assessment_guide|discussion"}]}

Summarize process requirements, assessment formats, and any logistical constraints relevant to preparation.`
  },
  {
    key: "competitor",
    label: "Peer Interview Calibration",
    useWebSearch: true,
    searchQuery: (topic, mode, role) => `${topic} ${role} interview peers competitor companies similar interview process`,
    systemPrompt: `You are a peer-calibration interview analyst. Return ONLY valid JSON with this exact shape:
{"calibrationScore":0,"likelyEmphasis":"string","peerSummary":"string","peerPatterns":[{"company":"string","pattern":"string","detail":"string"}]}

Use peer companies and adjacent interview processes to calibrate likely difficulty and focus areas.
calibrationScore must be an integer from 0 to 100.`
  }
];

const AGGREGATOR_PROMPT = `You are a senior intelligence analyst synthesizing 5 agent reports. Return ONLY valid JSON with this exact shape:
{"subjectSummary":"string","overallRiskScore":0,"overallOpportunityScore":0,"urgent":[{"finding":"string","source":"string","action":"string"}],"notable":[{"finding":"string","source":"string","whyItMatters":"string"}],"fyi":[{"finding":"string","context":"string"}],"oneLineSummary":"string","recommendedActions":["string","string","string"],"monitoringFrequency":"string"}`;
const AGGREGATOR_PROMPT_RULES = `
Rules:
- overallRiskScore and overallOpportunityScore must be integers from 0 to 100
- use a true 0-100 scale, not a 1-10 shorthand rating
- single-digit scores should only be used when the real score is genuinely near zero
- if the situation is meaningfully risky or promising, use a score that reflects that on the full 0-100 scale`;

const INTERVIEW_PREP_AGGREGATOR_PROMPT = `You are a senior interview-prep strategist. Synthesize the 5 agent reports into a company-specific interview roadmap for the target role. Return ONLY valid JSON with this exact shape:
{"reportedRoundCount":"string","confidenceLabel":"high|medium|low","oneLineSummary":"string","roadmapSummary":"string","rounds":[{"name":"string","description":"string","focusAreas":["string","string"],"materials":[{"title":"string","url":"string","type":"official|reddit|github|prep_guide|job_posting"}],"signals":["string","string"]}],"prepPlan":["string","string","string"],"keyWarnings":["string","string"],"sourceNotes":["string","string"]}

Rules:
- rounds should contain 2 to 5 items when enough evidence exists
- use the best-known likely round sequence when exact counts are unclear
- confidenceLabel should reflect how consistent the evidence is
- materials should prioritize useful prep links and keep URLs intact
- keep the roadmap student-oriented and actionable`;

const CSV_ANALYST_PROMPT = `You are a data analyst. Analyze the uploaded CSV summary and return ONLY valid JSON with this exact shape:
{"datasetSummary":{"rowCount":0,"columnCount":0,"columns":[]},"keyFindings":["string"],"risks":["string"],"opportunities":["string"],"recommendedActions":["string"],"oneLineSummary":"string","anomalies":[{"rowIndex":0,"anomalousColumn":"string","severity":"critical|warning|low","description":"string","type":"statistical_outlier|missing_value|impossible_value"}],"chartRecommendations":[{"chartType":"bar|line|pie|scatter|histogram","title":"string","xAxis":"string","yAxis":"string","aggregation":"sum|average|count|none","groupBy":"string","reason":"string","sortBy":"value_desc|value_asc|label_asc|none","maxCategories":8,"colorScheme":"ink|growth|mixed"}]}
Rules for recommendedActions:
- recommendedActions must be an array of 3 to 4 separate strings.
- Do not return one semicolon-separated sentence or combine multiple actions into a single string.
- Each action should be concise, executive-ready, and stand alone as its own recommendation.
Anomaly instructions:
You will receive a list of pre-computed anomaly candidates. Each candidate has a rowIndex (the exact position in the dataset, 0-based), the anomalous column, and statistical context.
For each candidate you decide is a genuine anomaly (not just a statistical quirk), return an object in the anomalies array with:
{
  rowIndex: number — copy EXACTLY from the candidate, do not change this value,
  anomalousColumn: string — copy the column name exactly from the candidate,
  severity: 'critical' | 'warning' | 'low',
  description: string — plain English explanation of why this is anomalous and what it likely means,
  type: string — copy from candidate ('statistical_outlier'|'missing_value'|'impossible_value')
}
Rules:
- Copy rowIndex exactly — do not round, estimate, or recalculate it
- severity = critical if zScore > 5 or type is impossible_value
- severity = warning if zScore 3-5 or type is missing_value
- severity = low for borderline cases
- If a candidate looks like normal variation (low business impact), you may omit it
- Each rowIndex should appear in your response at most ONCE. If multiple columns in the same row are anomalous, report the most important one only and mention the others in the description.
- Focus on data QUALITY issues not business outliers.
- Flag these:
  - Revenue that is impossibly low given units sold
  - Missing values in important columns
  - Values that are physically impossible (negative price, zero revenue on large order)
  - Duplicate order IDs
- Do NOT flag these as anomalies:
  - High revenue orders (large orders are legitimate)
  - Premium priced products (expensive items exist)
  - High discount percentages (sales happen)
  - Variation in customer satisfaction scores
- Maximum 3 anomalies returned.
- Quality over quantity.
Rules for chartRecommendations:
- If data has a date/time column, always recommend a line chart with date on x axis and the most important numeric column on y axis.
- If data has a categorical column with fewer than 10 unique values, recommend a bar chart grouped by that category.
- If data has 2 or more numeric columns, recommend a scatter plot using the two most correlated or most comparable numeric columns.
- If data has a single categorical column with fewer than 7 values, you may recommend a pie chart for distribution.
- If data has a single numeric column, recommend a histogram.
- Never recommend more than 3 charts.
- Never recommend a chart if the required column does not exist.
- Always put the most insightful chart first.
If pre-computed correlations or segment summaries are provided, use them directly in your reasoning instead of inferring those relationships from scratch.
Return ONLY valid JSON, no markdown, no explanation.`;

const CSV_COMPARISON_PROMPT = `You are a senior data analyst specializing in comparative data analysis. You have been given two CSV datasets. Analyze both and return a JSON object with:
- fileA: object { rowCount: number, columnCount: number, summary: string }
- fileB: object { rowCount: number, columnCount: number, summary: string }
- sharedColumns: array of strings
- onlyInA: array of strings
- onlyInB: array of strings
- schemaMatch: boolean
- metricComparisons: array of up to 5 objects { metric: string, valueA: string, valueB: string, change: string, direction: string, significance: string }
- growthColumns: array of strings
- declineColumns: array of strings. declineColumns should include specific products or categories where volume or revenue dropped between File A and File B, not just column names where the average went down.
- anomalies: array of up to 3 objects { description: string, file: string, severity: string }
- keyInsight: string
- recommendation: string
- chartRecommendations: array of 2 objects { chartType: string, title: string, metric: string, groupBy: string, reason: string, maxCategories: number }
The $4.50 net_revenue anomaly on a 95-unit Laptop order in File B should be flagged as a critical data quality issue in anomalies.
Focus on data QUALITY issues not business outliers.
Flag these:
- Revenue that is impossibly low given units sold
- Missing values in important columns
- Values that are physically impossible (negative price, zero revenue on large order)
- Duplicate order IDs
Do NOT flag these as anomalies:
- High revenue orders (large orders are legitimate)
- Premium priced products (expensive items exist)
- High discount percentages (sales happen)
- Variation in customer satisfaction scores
Maximum 3 anomalies returned.
Quality over quantity.
Return concise field values. Keep summaries short and executive-ready.
Chart rules:
- Always recommend a grouped_bar chart comparing File A vs File B for the top metric, usually net_revenue or units_sold, grouped by the most informative categorical column such as product or region.
- If a date column exists in both files, recommend a line_comparison showing both files as two lines over time.
- chartType must be one of grouped_bar, line_comparison, side_by_side_bar.
- Maximum 2 charts.
Return ONLY valid JSON, no markdown, no explanation.`;

const CROSS_REFERENCE_SYNTHESIS_PROMPT = `You are a senior strategy analyst who specializes in connecting internal business data to external market intelligence. You have two sources of information:
1. INTERNAL DATA from CSV analysis
2. EXTERNAL INTELLIGENCE from 5 monitoring agents

Your task: Find meaningful connections between the internal data patterns and the external signals.

Return a JSON object with:
{
  "headline":"string",
  "connections":[
    {
      "internalFinding":"string",
      "externalSignal":"string",
      "connection":"string",
      "implication":"string",
      "confidence":"high|medium|low",
      "source":"news|jobs|sentiment|regulatory|competitor"
    }
  ],
  "biggestRisk":"string",
  "biggestOpportunity":"string",
  "strategicRecommendation":"string",
  "monitoringAdvice":"string"
}

Rules:
- Return exactly 3 connections when enough evidence exists, otherwise return fewer rather than inventing weak links.
- Be specific and reference actual findings from the CSV analysis and monitoring agents.
- If you cannot find a meaningful connection, say so honestly rather than inventing one.
- Return ONLY valid JSON, no markdown, no explanation.`;

async function handlePulseBoardRequest(req, res, options = {}) {
  try {
    const requestUrl = options.requestUrl || new URL(req.url, `http://${req.headers.host || `${HOST}:${PORT}`}`);
    if (req.method === "GET" && ["/", "/query", "/csv", "/api-key"].includes(requestUrl.pathname)) {
      return serveFile(res, INDEX_PATH, "text/html; charset=utf-8");
    }
    if (req.method === "GET" && requestUrl.pathname === "/pulseboard-structure.test.js") {
      return serveFile(res, path.join(__dirname, "pulseboard-structure.test.js"), "text/javascript; charset=utf-8");
    }
    if (req.method === "GET" && requestUrl.pathname === "/pulseboard-relay.test.js") {
      return serveFile(res, path.join(__dirname, "pulseboard-relay.test.js"), "text/javascript; charset=utf-8");
    }
    if (req.method === "GET" && requestUrl.pathname.startsWith("/scripts/") && requestUrl.pathname.endsWith(".js")) {
      const scriptName = path.basename(requestUrl.pathname);
      return serveFile(res, path.join(__dirname, "scripts", scriptName), "text/javascript; charset=utf-8");
    }
    if (req.method === "GET" && requestUrl.pathname === "/api/pulseboard/connection-status") {
      return sendJson(res, 200, buildConnectionStatus(resolveRequestConnection(null)));
    }
    if (req.method === "POST" && requestUrl.pathname === "/api/pulseboard/validate-connection") {
      const body = await readJson(req);
      const connection = normalizeOptionalConnection(body.connection);
      const validation = await validateConnection(connection);
      return sendJson(res, validation.ok ? 200 : 400, validation);
    }
      if (req.method === "POST" && requestUrl.pathname === "/api/pulseboard/run") {
        const body = await readJson(req);
        const connection = resolveRequestConnection(body.connection);
      const input = {
        connection,
        topic: String(body.topic || "").trim(),
        mode: String(body.mode || "general").trim(),
        role: String(body.role || "").trim()
      };
      if (!input.connection) {
        return sendJson(res, 400, { error: { message: "No demo connection is configured, so add your own API key to continue." }, connectionStatus: buildConnectionStatus(null) });
      }
      if (!input.topic) {
        return sendJson(res, 400, { error: { message: "Topic is required." } });
      }
      if (input.mode === "interviewprep" && !input.role) {
        return sendJson(res, 400, { error: { message: "Role is required for Interview Prep mode." } });
      }
      res.writeHead(200, {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "Access-Control-Allow-Origin": "*"
      });
        res.write(`${JSON.stringify({ type: "connection_status", connectionStatus: buildConnectionStatus(input.connection) })}\n`);
        await runPulseBoardSession(input, (event) => {
          res.write(`${JSON.stringify(event)}\n`);
        });
        res.end();
        return;
      }
      if (req.method === "POST" && requestUrl.pathname === "/api/pulseboard/scenario") {
        const body = await readJson(req);
        const connection = resolveRequestConnection(body.connection);
        const input = {
          scenarioType: String(body.scenarioType || "monitoring").trim(),
          connection,
          topic: String(body.topic || "").trim(),
          mode: String(body.mode || "general").trim(),
          role: String(body.role || "").trim(),
          runId: String(body.runId || "").trim(),
          brief: body.brief && typeof body.brief === "object" ? body.brief : null,
          agentResults: body.agentResults && typeof body.agentResults === "object" ? body.agentResults : {},
          reliability: body.reliability && typeof body.reliability === "object" ? body.reliability : null,
          resultId: String(body.resultId || "").trim(),
          csvResult: body.csvResult && typeof body.csvResult === "object" ? body.csvResult : null,
          parsedCsv: body.parsedCsv && typeof body.parsedCsv === "object" ? body.parsedCsv : null,
          qualityReport: body.qualityReport && typeof body.qualityReport === "object" ? body.qualityReport : null,
          schemaSummary: body.schemaSummary || null,
          messages: Array.isArray(body.messages) ? body.messages : [],
          question: String(body.question || "").trim()
        };
        if (!input.connection) {
          return sendJson(res, 400, { error: { message: "No demo connection is configured, so add your own API key before asking PulseBoard a follow-up question." }, connectionStatus: buildConnectionStatus(null) });
        }
        if (input.scenarioType === "csv_single") {
          if (!input.csvResult || !input.parsedCsv?.headers || !input.parsedCsv?.records) {
            return sendJson(res, 400, { error: { message: "A completed single-file CSV analysis is required before asking CSV scenario questions." } });
          }
          if (!input.question) {
            return sendJson(res, 400, { error: { message: "Enter a CSV scenario question before asking PulseBoard." } });
          }
          const result = await runCsvScenarioFollowup(input);
          return sendJson(res, 200, { ...result, connectionStatus: buildConnectionStatus(input.connection) });
        }
        if (!input.topic) {
          return sendJson(res, 400, { error: { message: "Topic is required for scenario follow-up." } });
        }
        if (!SCENARIO_SUPPORTED_MODES.has(input.mode)) {
          return sendJson(res, 400, { error: { message: "Scenario Simulator currently supports monitoring and Interview Prep briefs only." } });
        }
        if (input.scenarioType === "interview_prep" && !input.role) {
          return sendJson(res, 400, { error: { message: "A target role is required before asking Interview Prep follow-up questions." } });
        }
        if (!input.brief) {
          return sendJson(res, 400, { error: { message: input.scenarioType === "interview_prep" ? "A completed Interview Prep brief is required before asking PulseBoard a follow-up question." : "A completed monitoring brief is required before asking a scenario question." } });
        }
        if (!input.question) {
          return sendJson(res, 400, { error: { message: "Enter a scenario question before asking PulseBoard." } });
        }
        const result = await runScenarioFollowup(input);
        return sendJson(res, 200, { ...result, connectionStatus: buildConnectionStatus(input.connection) });
      }
      if (req.method === "POST" && requestUrl.pathname === "/api/pulseboard/analyze-csv") {
        const body = await readJson(req);
        const connection = resolveRequestConnection(body.connection);
      const csvText = String(body.csvText || "");
      const analysisGoal = String(body.analysisGoal || "").trim();
      const qualityReport = body.qualityReport && typeof body.qualityReport === "object" ? body.qualityReport : null;
      const schemaSummary = String(body.schemaSummary || "").trim();
      const correlationSummary = String(body.correlationSummary || "").trim();
      const segmentSummary = String(body.segmentSummary || "").trim();
      const cleaningSummary = body.cleaningSummary && typeof body.cleaningSummary === "object" ? body.cleaningSummary : null;
      const transformationLogSummary = Array.isArray(body.transformationLogSummary) ? body.transformationLogSummary : [];
      if (!connection) {
        return sendJson(res, 400, { error: { message: "No demo connection is configured, so add your own API key before running CSV analysis." }, connectionStatus: buildConnectionStatus(null) });
      }
      if (!csvText.trim()) {
        return sendJson(res, 400, { error: { message: "CSV text is required." } });
      }
      const result = await analyzeCsvSession({ connection, csvText, analysisGoal, qualityReport, schemaSummary, correlationSummary, segmentSummary, cleaningSummary, transformationLogSummary });
      return sendJson(res, 200, { result, connectionStatus: buildConnectionStatus(connection) });
    }
    if (req.method === "POST" && requestUrl.pathname === "/api/pulseboard/compare-csv") {
      const body = await readJson(req);
      const connection = resolveRequestConnection(body.connection);
      const csvTextA = String(body.csvTextA || "");
      const csvTextB = String(body.csvTextB || "");
      const labelA = String(body.labelA || "File A").trim() || "File A";
      const labelB = String(body.labelB || "File B").trim() || "File B";
      const analysisGoal = String(body.analysisGoal || "").trim();
      const qualityReportA = body.qualityReportA && typeof body.qualityReportA === "object" ? body.qualityReportA : null;
      const qualityReportB = body.qualityReportB && typeof body.qualityReportB === "object" ? body.qualityReportB : null;
      if (!connection) {
        return sendJson(res, 400, { error: { message: "No demo connection is configured, so add your own API key before comparing CSV files." }, connectionStatus: buildConnectionStatus(null) });
      }
      if (!csvTextA.trim()) {
        return sendJson(res, 400, { error: { message: "CSV text is required for File A." } });
      }
      if (!csvTextB.trim()) {
        return sendJson(res, 400, { error: { message: "CSV text is required for File B." } });
      }
      const result = await compareCsvSession({ connection, csvTextA, csvTextB, labelA, labelB, analysisGoal, qualityReportA, qualityReportB });
      return sendJson(res, 200, { result, connectionStatus: buildConnectionStatus(connection) });
    }
    if (req.method === "POST" && requestUrl.pathname === "/api/pulseboard/cross-reference") {
      const body = await readJson(req);
      const connection = resolveRequestConnection(body.connection);
      const topic = String(body.topic || "").trim();
      const csvContext = String(body.csvContext || "").trim();
      const csvResults = body.csvResults && typeof body.csvResults === "object" ? body.csvResults : {};
      if (!connection) {
        return sendJson(res, 400, { error: { message: "No demo connection is configured, so add your own API key before running Cross-Reference." }, connectionStatus: buildConnectionStatus(null) });
      }
      if (!topic) {
        return sendJson(res, 400, { error: { message: "Cross-reference topic is required." } });
      }
      res.writeHead(200, {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "Access-Control-Allow-Origin": "*"
      });
      res.write(`${JSON.stringify({ type: "connection_status", connectionStatus: buildConnectionStatus(connection) })}\n`);
      await crossReferenceSession({ connection, topic, csvContext, csvResults }, (event) => {
        res.write(`${JSON.stringify(event)}\n`);
      });
      res.end();
      return;
    }
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type"
      });
      res.end();
      return;
    }
    sendJson(res, 404, { error: { message: "Not found." } });
  } catch (error) {
    console.error(error);
    sendJson(res, 500, { error: { message: error.message || "Internal server error." } });
  }
}

const server = http.createServer((req, res) => handlePulseBoardRequest(req, res));

if (require.main === module) {
  server.listen(PORT, HOST, () => {
    console.log(`PulseBoard relay running at http://${HOST}:${PORT}`);
  });
}

function serveFile(res, filePath, contentType) {
  const content = fs.readFileSync(filePath);
  res.writeHead(200, {
    "Content-Type": contentType,
    "Access-Control-Allow-Origin": "*"
  });
  res.end(content);
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*"
  });
  res.end(JSON.stringify(payload));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => { raw += chunk; });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(new Error("Invalid JSON body."));
      }
    });
    req.on("error", reject);
  });
}

function normalizeConnection(connection) {
  if (!connection || !PROVIDER_PRESETS[connection.provider]) {
    throw new Error("Unsupported or missing provider configuration.");
  }
  const preset = PROVIDER_PRESETS[connection.provider];
  return {
    provider: connection.provider,
    apiKey: String(connection.apiKey || "").trim(),
    model: String(connection.model || preset.defaultModel).trim() || preset.defaultModel,
    endpoint: String(connection.endpoint || preset.defaultEndpoint).trim() || preset.defaultEndpoint
  };
}

function normalizeOptionalConnection(connection) {
  if (!connection || !PROVIDER_PRESETS[connection.provider]) return null;
  return normalizeConnection(connection);
}

function buildDemoConnectionFromEnv(prefix, fallbackIndex = 0) {
  const rawApiKey = String(process.env[`${prefix}_API_KEY`] || "").trim();
  if (!rawApiKey) return null;
  const rawProvider = String(process.env[`${prefix}_PROVIDER`] || "nvidia").trim().toLowerCase();
  if (!PROVIDER_PRESETS[rawProvider]) return null;
  const preset = PROVIDER_PRESETS[rawProvider];
  return {
    provider: rawProvider,
    apiKey: rawApiKey,
    model: String(process.env[`${prefix}_MODEL`] || preset.defaultModel).trim() || preset.defaultModel,
    endpoint: String(process.env[`${prefix}_ENDPOINT`] || preset.defaultEndpoint).trim() || preset.defaultEndpoint,
    __connectionSource: "built_in",
    __fallbackIndex: fallbackIndex
  };
}

function getBuiltInDemoConnections() {
  return [
    buildDemoConnectionFromEnv("PULSEBOARD_DEMO", 0),
    buildDemoConnectionFromEnv("PULSEBOARD_DEMO_FALLBACK_1", 1),
    buildDemoConnectionFromEnv("PULSEBOARD_DEMO_FALLBACK_2", 2)
  ].filter(Boolean);
}

function annotateBuiltInConnection(connection, allCandidates) {
  if (!connection) return null;
  return {
    ...connection,
    __connectionSource: "built_in",
    __demoCandidates: Array.isArray(allCandidates) ? allCandidates.map((candidate) => ({ ...candidate })) : [{ ...connection }],
    __activeDemoIndex: Number(connection.__fallbackIndex || 0),
    __fallbackActive: Number(connection.__fallbackIndex || 0) > 0
  };
}

function resolveRequestConnection(connection) {
  const userConnection = normalizeOptionalConnection(connection);
  if (userConnection && userConnection.apiKey) {
    return {
      ...userConnection,
      __connectionSource: "user_override",
      __fallbackActive: false
    };
  }
  const demoCandidates = getBuiltInDemoConnections();
  if (!demoCandidates.length) return null;
  return annotateBuiltInConnection(demoCandidates[0], demoCandidates);
}

function shouldRetryBuiltInConnection(error) {
  return Boolean(error && BUILT_IN_CONNECTION_RETRY_KINDS.has(error.kind || ""));
}

function syncBuiltInConnectionToCandidate(providerConfig, nextCandidate, nextIndex) {
  providerConfig.provider = nextCandidate.provider;
  providerConfig.apiKey = nextCandidate.apiKey;
  providerConfig.model = nextCandidate.model;
  providerConfig.endpoint = nextCandidate.endpoint;
  providerConfig.__activeDemoIndex = nextIndex;
  providerConfig.__fallbackActive = nextIndex > 0;
}

async function withBuiltInConnectionFallback(providerConfig, runner) {
  try {
    return await runner(providerConfig);
  } catch (error) {
    if (providerConfig?.__connectionSource !== "built_in" || !shouldRetryBuiltInConnection(error)) {
      throw error;
    }
    const candidates = Array.isArray(providerConfig.__demoCandidates) ? providerConfig.__demoCandidates : [];
    for (let index = Number(providerConfig.__activeDemoIndex || 0) + 1; index < candidates.length; index += 1) {
      const nextCandidate = candidates[index];
      if (!nextCandidate) continue;
      syncBuiltInConnectionToCandidate(providerConfig, nextCandidate, index);
      try {
        return await runner(providerConfig);
      } catch (fallbackError) {
        if (!shouldRetryBuiltInConnection(fallbackError) || index === candidates.length - 1) {
          throw fallbackError;
        }
      }
    }
    throw error;
  }
}

function buildConnectionStatus(connection) {
  if (!connection) {
    return {
      available: false,
      connectionSource: "none",
      provider: "",
      model: "",
      fallbackActive: false,
      statusLabel: "Not connected"
    };
  }
  const preset = PROVIDER_PRESETS[connection.provider] || { label: "Provider" };
  const builtIn = connection.__connectionSource === "built_in";
  return {
    available: true,
    connectionSource: builtIn ? "built_in" : "user_override",
    provider: connection.provider,
    model: connection.model,
    endpoint: connection.endpoint,
    fallbackActive: Boolean(connection.__fallbackActive),
    statusLabel: builtIn
      ? `Connected: Demo ${preset.label} key${connection.__fallbackActive ? " (fallback active)" : ""}`
      : `Connected: Your ${preset.label} key`
  };
}

async function validateConnection(connection) {
  const resolvedConnection = connection || resolveRequestConnection(null);
  if (!resolvedConnection?.apiKey) {
    return { ok: false, message: "API key is required.", connectionStatus: buildConnectionStatus(null) };
  }
  if (!/^https?:\/\//i.test(resolvedConnection.endpoint)) {
    return { ok: false, message: "Endpoint must start with http:// or https://.", connectionStatus: buildConnectionStatus(resolvedConnection) };
  }

  try {
    await runValidationProbe(resolvedConnection);
    return {
      ok: true,
      message: `${PROVIDER_PRESETS[resolvedConnection.provider].label} validated using the configured model ${resolvedConnection.model}.`,
      connectionStatus: buildConnectionStatus(resolvedConnection)
    };
  } catch (error) {
    const normalizedError = normalizeOperationalError(error, {
      providerConfig: resolvedConnection,
      phase: "validation"
    });
    logNormalizedError(normalizedError, "validation");
    return {
      ok: false,
      message: normalizedError.message || "Provider validation failed.",
      error: serializePulseBoardError(normalizedError),
      connectionStatus: buildConnectionStatus(resolvedConnection)
    };
  }
}

async function runValidationProbe(providerConfig) {
  return withBuiltInConnectionFallback(providerConfig, async (effectiveConnection) => {
    switch (effectiveConnection.provider) {
      case "openai":
        return runOpenAIValidationProbe(effectiveConnection);
      case "anthropic":
        return runAnthropicValidationProbe(effectiveConnection);
      case "gemini":
        return runGeminiValidationProbe(effectiveConnection);
      case "nvidia":
        return runNvidiaValidationProbe(effectiveConnection);
      default:
        throw new Error("Unsupported provider.");
    }
  });
}

async function runPulseBoardSession(input, emit) {
  emit({ type: "connection_status", connectionStatus: buildConnectionStatus(input.connection) });
  const agentSpecs = getMonitoringAgentSpecs(input.mode);
  const monitoringPromises = agentSpecs.map((agent) =>
    runMonitoringAgent(input.connection, input.topic, input.mode, agent, { role: input.role })
      .then((result) => {
        emit({ type: "agent_result", agent: agent.key, result });
        return { agent: agent.key, result };
      })
      .catch((error) => {
        const normalizedError = normalizeOperationalError(error, {
          providerConfig: input.connection,
          phase: "monitoring"
        });
        logNormalizedError(normalizedError, `agent:${agent.key}`);
        emit({ type: "agent_error", agent: agent.key, error: serializePulseBoardError(normalizedError) });
        return {
          agent: agent.key,
          result: {
            error: true,
            ...serializePulseBoardError(normalizedError)
          }
        };
      })
  );

  const settled = await Promise.all(monitoringPromises);
  const byAgent = Object.fromEntries(settled.map((entry) => [entry.agent, entry.result]));
  const successCount = Object.values(byAgent).filter((entry) => entry && !entry.error).length;
  const degradedWarning = buildMonitoringDegradedWarning(byAgent, successCount);

  if (successCount < 3) {
    emit({
      type: "brief_error",
      successCount,
      error: serializePulseBoardError(buildInsufficientEvidenceError(byAgent, successCount))
    });
    emit({ type: "connection_status", connectionStatus: buildConnectionStatus(input.connection) });
    emit({ type: "done" });
    return;
  }

  emit({ type: "aggregator_started" });
  try {
    const briefResult = await runAggregator(input.connection, input.topic, input.mode, byAgent, input.role);
    const brief = {
      ...briefResult,
      reliability: buildBriefReliability(byAgent, degradedWarning)
    };
    emit({
      type: "brief",
      result: brief,
      warning: degradedWarning ? serializePulseBoardError(degradedWarning) : null
    });
  } catch (error) {
    const normalizedError = normalizeOperationalError(error, {
      providerConfig: input.connection,
      phase: "aggregation"
    });
    logNormalizedError(normalizedError, "aggregator");
    emit({
      type: "brief_error",
      successCount,
      error: serializePulseBoardError(normalizedError)
    });
  }
  emit({ type: "connection_status", connectionStatus: buildConnectionStatus(input.connection) });
  emit({ type: "done" });
}

function getMonitoringAgentSpecs(mode) {
  return mode === "interviewprep" ? INTERVIEW_PREP_AGENT_SPECS : AGENT_SPECS;
}

function classifySourceFreshness(value) {
  const raw = String(value || "").trim();
  if (!raw) return "Unknown";
  const lowered = raw.toLowerCase();
  if (/(today|just now|hours? ago|minutes? ago|minute ago|hour ago)/i.test(raw)) return "Fresh";
  if (/(yesterday|days? ago|this week|past week|last week|recent)/i.test(raw)) return "Recent";
  const timestamp = Date.parse(raw);
  if (Number.isNaN(timestamp)) return "Unknown";
  const ageMs = Date.now() - timestamp;
  const oneDay = 24 * 60 * 60 * 1000;
  if (ageMs <= oneDay * 2) return "Fresh";
  if (ageMs <= oneDay * 14) return "Recent";
  if (ageMs > oneDay * 14) return "Older";
  return "Unknown";
}

async function verifyUrlReachable(url) {
  const target = String(url || "").trim();
  if (!/^https?:\/\//i.test(target)) return false;
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const timeout = controller ? setTimeout(() => controller.abort(), 4000) : null;
  const attempt = async (method) => {
    const response = await fetch(target, {
      method,
      redirect: "follow",
      signal: controller ? controller.signal : undefined,
      headers: {
        "User-Agent": "PulseBoard/1.0 (+https://pulseboard.local)"
      }
    });
    return response.ok;
  };
  try {
    if (await attempt("HEAD")) return true;
  } catch (error) {
    // Fall through to GET for providers that block HEAD requests.
  }
  try {
    return await attempt("GET");
  } catch (error) {
    return false;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function sanitizeSearchSource(rawSource, index) {
  const title = String(rawSource?.title || rawSource?.name || `Source ${index + 1}`).trim() || `Source ${index + 1}`;
  const url = String(rawSource?.url || rawSource?.link || "").trim();
  const snippet = String(rawSource?.snippet || rawSource?.content || rawSource?.summary || "").trim();
  const publishedAt = String(rawSource?.published_at || rawSource?.publishedAt || rawSource?.date || rawSource?.recency || "").trim();
  return {
    title,
    url,
    snippet,
    publishedAt,
    freshnessLabel: classifySourceFreshness(publishedAt)
  };
}

function buildEvidenceSummary(query, sources) {
  const normalizedSources = Array.isArray(sources)
    ? sources.map((source, index) => sanitizeSearchSource(source, index))
    : [];
  const sourceCount = normalizedSources.length;
  const verifiedLinks = normalizedSources.filter((source) => source.verified);
  const verifiedLinkCount = verifiedLinks.length;
  const freshCount = normalizedSources.filter((source) => source.freshnessLabel === "Fresh").length;
  const recentCount = normalizedSources.filter((source) => source.freshnessLabel === "Recent").length;
  const freshnessLabel = freshCount > 0 ? "Fresh" : recentCount > 0 ? "Recent" : sourceCount > 0 ? "Older" : "Unknown";
  const confidenceLabel = sourceCount >= 4 && verifiedLinkCount >= 3
    ? "High"
    : sourceCount >= 2 && verifiedLinkCount >= 1
      ? "Medium"
      : "Low";
  const evidenceText = normalizedSources.length
    ? normalizedSources.map((source, index) => {
      return `${index + 1}. ${source.title}
URL: ${source.url || "Unavailable"}
Freshness: ${source.freshnessLabel}
Summary: ${source.snippet || "No summary returned."}`;
    }).join("\n\n")
    : "No usable live search results were available.";
  return {
    query,
    sources: normalizedSources,
    sourceCount,
    verifiedLinkCount,
    evidenceText,
    freshnessLabel,
    confidenceLabel,
    partialCoverage: sourceCount < 3 || verifiedLinkCount < Math.min(sourceCount, 2)
  };
}

function buildConfidenceFromCoverage(sourceCount, verifiedLinkCount, partialCoverage) {
  if (!partialCoverage && sourceCount >= 4 && verifiedLinkCount >= 3) return "high";
  if (sourceCount >= 2 && verifiedLinkCount >= 1) return "medium";
  return "low";
}

function coerceBriefScoreValue(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(100, Math.round(numeric)));
}

function shouldUpscaleMonitoringScore(score, counterpartScore, brief) {
  if (!(score >= 1 && score <= 10)) return false;
  if (counterpartScore >= 15) return true;
  const urgentCount = Array.isArray(brief?.urgent) ? brief.urgent.length : 0;
  const notableCount = Array.isArray(brief?.notable) ? brief.notable.length : 0;
  const actionCount = Array.isArray(brief?.recommendedActions) ? brief.recommendedActions.length : 0;
  const summaryText = [
    brief?.subjectSummary,
    brief?.oneLineSummary,
    ...(Array.isArray(brief?.urgent) ? brief.urgent.map((item) => item?.finding) : []),
    ...(Array.isArray(brief?.notable) ? brief.notable.map((item) => item?.finding) : [])
  ].join(" ").toLowerCase();
  if (score <= 3 && urgentCount === 0 && notableCount <= 1 && !/(urgent|material|major|high|significant|elevated|strong|meaningful)/i.test(summaryText)) {
    return false;
  }
  return urgentCount > 0 || notableCount >= 2 || actionCount >= 2 || /(urgent|material|major|high|significant|elevated|strong|meaningful)/i.test(summaryText);
}

function normalizeMonitoringBriefScores(result) {
  const brief = result && typeof result === "object" ? { ...result } : {};
  let riskScore = coerceBriefScoreValue(brief.overallRiskScore);
  let opportunityScore = coerceBriefScoreValue(brief.overallOpportunityScore);

  if (shouldUpscaleMonitoringScore(riskScore, opportunityScore, brief)) {
    riskScore = Math.min(100, riskScore * 10);
  }
  if (shouldUpscaleMonitoringScore(opportunityScore, riskScore, brief)) {
    opportunityScore = Math.min(100, opportunityScore * 10);
  }

  brief.overallRiskScore = riskScore;
  brief.overallOpportunityScore = opportunityScore;
  return brief;
}

function pruneUnverifiedLink(link) {
  if (!link || typeof link !== "object") return null;
  const url = String(link.url || "").trim();
  if (!/^https?:\/\//i.test(url) || link.verified === false) return null;
  return {
    ...link,
    url,
    freshnessLabel: classifySourceFreshness(link.publishedAt || link.recency || link.date || ""),
    verified: link.verified !== false
  };
}

function pruneUnverifiedLinks(links, maxCount = 5) {
  if (!Array.isArray(links)) return [];
  return links
    .map((link) => pruneUnverifiedLink(link))
    .filter(Boolean)
    .slice(0, maxCount);
}

function attachReliabilityMetadata(result, evidence, options = {}) {
  const safeResult = result && typeof result === "object" ? { ...result } : {};
  const sourceCount = Number(evidence?.sourceCount || 0);
  const verifiedLinkCount = Number(evidence?.verifiedLinkCount || 0);
  const partialCoverage = Boolean(evidence?.partialCoverage);
  const confidenceLabel = buildConfidenceFromCoverage(sourceCount, verifiedLinkCount, partialCoverage);

  if (options.agentKey === "jobs") {
    safeResult.careersPage = pruneUnverifiedLink(safeResult.careersPage);
    safeResult.jobLinks = pruneUnverifiedLinks(safeResult.jobLinks, 3);
    safeResult.officialMaterials = pruneUnverifiedLinks(safeResult.officialMaterials, 4);
  }
  if (options.agentKey === "regulatory" && options.mode === "interviewprep") {
    safeResult.processMaterials = pruneUnverifiedLinks(safeResult.processMaterials, 4);
  }

  safeResult.reliability = {
    sourceCount,
    verifiedLinkCount,
    freshnessLabel: evidence?.freshnessLabel || "Unknown",
    confidenceLabel,
    partialCoverage,
    partialEvidenceMessage: partialCoverage
      ? "This section is based on partial coverage because some agents or searches failed to return full evidence."
      : "",
    verifiedLinks: Array.isArray(evidence?.sources)
      ? evidence.sources.filter((source) => source.verified).map((source) => ({
        title: source.title,
        url: source.url,
        freshnessLabel: source.freshnessLabel
      }))
      : []
  };

  return safeResult;
}

function buildBriefReliability(byAgent, warning = null) {
  const allAgents = Object.values(byAgent || {});
  const successfulAgents = Object.values(byAgent || {}).filter((entry) => entry && !entry.error);
  const sourceCount = successfulAgents.reduce((sum, entry) => sum + Number(entry?.reliability?.sourceCount || 0), 0);
  const verifiedLinkCount = successfulAgents.reduce((sum, entry) => sum + Number(entry?.reliability?.verifiedLinkCount || 0), 0);
  const freshnessPriority = ["Fresh", "Recent", "Older", "Unknown"];
  const freshnessLabel = successfulAgents
    .map((entry) => entry?.reliability?.freshnessLabel || "Unknown")
    .sort((a, b) => freshnessPriority.indexOf(a) - freshnessPriority.indexOf(b))[0] || "Unknown";
  const failedAgents = allAgents.filter((entry) => entry && entry.error);
  const partialCoverage = Boolean(warning) || successfulAgents.length < 5 || failedAgents.length > 0;
  return {
    sourceCount,
    verifiedLinkCount,
    freshnessLabel,
    confidenceLabel: buildConfidenceFromCoverage(sourceCount, verifiedLinkCount, partialCoverage),
    partialCoverage,
    partialEvidenceMessage: partialCoverage
      ? (warning?.message || "This brief is based on partial evidence because some agents or searches failed.")
      : "",
    verifiedLinks: successfulAgents.flatMap((entry) => Array.isArray(entry?.reliability?.verifiedLinks) ? entry.reliability.verifiedLinks : []).slice(0, 8)
  };
}

async function runMonitoringAgent(providerConfig, topic, mode, agentSpec, options = {}) {
  const evidence = await searchTopicSignals(topic, mode, agentSpec, options.role);
  const userContent = [
    `Topic to monitor: "${topic}"`,
    `Monitoring mode: ${MODE_LABELS[mode]}`,
    options.role ? `Target role: "${options.role}"` : "",
    `Focus instruction: ${MODE_MODIFIERS[mode]}`,
    options.extraContext ? "" : "",
    options.extraContext ? `Additional context from internal CSV analysis:\n${options.extraContext}` : "",
    "",
    "Evidence gathered from live web search:",
    `Based on ${evidence.sourceCount} live signals and ${evidence.verifiedLinkCount} verified links.`,
    evidence.evidenceText
  ].join("\n");

  const result = await runModelJson({
    providerConfig,
    systemPrompt: agentSpec.systemPrompt,
    userContent
  });
  return attachReliabilityMetadata(result, evidence, {
    mode,
    agentKey: agentSpec.key
  });
}

async function runAggregator(providerConfig, topic, mode, byAgent, role = "") {
  const userContent = [
    `Topic to monitor: "${topic}"`,
    `Monitoring mode: ${MODE_LABELS[mode]}`,
    role ? `Target role: "${role}"` : "",
    `Focus instruction: ${MODE_MODIFIERS[mode]}`,
    mode === "interviewprep" ? "" : AGGREGATOR_PROMPT_RULES,
    "",
    `News: ${JSON.stringify(byAgent.news)}`,
    `Jobs: ${JSON.stringify(byAgent.jobs)}`,
    `Sentiment: ${JSON.stringify(byAgent.sentiment)}`,
    `Regulatory: ${JSON.stringify(byAgent.regulatory)}`,
    `Competitor: ${JSON.stringify(byAgent.competitor)}`
  ].join("\n");

  const result = await runModelJson({
    providerConfig,
    systemPrompt: mode === "interviewprep" ? INTERVIEW_PREP_AGGREGATOR_PROMPT : AGGREGATOR_PROMPT,
    userContent
  });
  const normalizedResult = mode === "interviewprep" ? result : normalizeMonitoringBriefScores(result);
  const reliability = buildBriefReliability(byAgent);
  if (mode === "interviewprep") {
    normalizedResult.rounds = Array.isArray(normalizedResult.rounds)
      ? normalizedResult.rounds.map((round) => ({
        ...round,
        materials: pruneUnverifiedLinks(round?.materials, 5)
      }))
      : [];
  }
  return {
    ...normalizedResult,
    reliability
  };
}

function normalizeScenarioMessages(messages) {
  if (!Array.isArray(messages)) return [];
  return messages
    .map((message) => {
      const role = message?.role === "assistant" ? "assistant" : "user";
      const content = String(message?.content || "").trim();
      if (!content) return null;
      return {
        role,
        content,
        sourceMode: message?.sourceMode === "brief" || message?.sourceMode === "live_followup" || message?.sourceMode === "mixed"
          ? message.sourceMode
          : undefined
      };
    })
    .filter(Boolean)
    .slice(-8);
}

function isInterviewPrepScenario(inputOrType) {
  const scenarioType = typeof inputOrType === "string" ? inputOrType : inputOrType?.scenarioType;
  const mode = typeof inputOrType === "object" ? inputOrType?.mode : "";
  return scenarioType === "interview_prep" || mode === "interviewprep";
}

function buildScenarioFollowupPrompt(stage = "brief", scenarioType = "monitoring") {
  const interviewPrep = isInterviewPrepScenario(scenarioType);
  const baseRules = [
    interviewPrep
      ? "You are PulseBoard's scenario simulator for interview-prep briefs."
      : "You are PulseBoard's scenario simulator for monitoring briefs.",
    "Answer in brief, direct prose with no bullet list unless the user explicitly asks for one.",
    "Keep answers operational and to the point.",
    interviewPrep
      ? "brief-first: If the answer is already supported by the supplied interview-prep brief and agent outputs, answer from the current interview-prep run."
      : "brief-first: If the answer is already supported by the supplied brief and agent outputs, answer from the current monitoring run.",
    "Only set canAnswerFromBrief to true when the requested fact is explicitly supported by the supplied brief or agent outputs.",
    "If the answer is already supported by the supplied brief and agent outputs, do not ask for fresh search.",
    "If the requested fact is missing, ambiguous, or would require wording like may, might, likely, there is no explicit evidence, not in the brief, or would need to confirm, set canAnswerFromBrief to false and needsFreshSearch to true.",
    interviewPrep
      ? "For concrete company or role-detail questions like hiring status, intern availability, remote work, team size, compensation, interview rounds, process expectations, role scope, location, founders, or funding, require fresh search unless the fact is directly present in the supplied brief or agent outputs."
      : "For concrete company-detail questions like remote work, team size, internship hiring, compensation, location, founders, funding, or role availability, require fresh search unless the fact is directly present in the supplied brief or agent outputs.",
    "Only rely on live follow-up evidence when the brief does not already answer the question well enough.",
    "Return ONLY valid JSON."
  ];
  if (stage === "brief") {
    return `${baseRules.join("\n")}\nReturn JSON with this exact shape:\n{"answer":"string","canAnswerFromBrief":true,"needsFreshSearch":false,"followupQuery":"string"}`;
  }
  return `${baseRules.join("\n")}\nYou are now answering with fresh follow-up evidence in addition to the current ${interviewPrep ? "interview-prep" : "monitoring"} run.\nReturn JSON with this exact shape:\n{"answer":"string","sourceMode":"brief|live_followup|mixed"}`;
}

function buildCsvScenarioPrompt(stage = "brief") {
  const baseRules = [
    "You are PulseBoard's scenario simulator for single-file CSV analysis.",
    "Answer in brief, direct prose with no bullet list unless the user explicitly asks for one.",
    "Use exact uploaded CSV data when it has already been deterministically retrieved.",
    "Do not invent row values, counts, or table entries.",
    "If deterministic CSV matches are provided, explain them briefly and stay close to the data.",
    "Return ONLY valid JSON."
  ];
  if (stage === "brief") {
    return `${baseRules.join("\n")}\nReturn JSON with this exact shape:\n{"answer":"string","shouldUseCsvData":false}`;
  }
  return `${baseRules.join("\n")}\nReturn JSON with this exact shape:\n{"answer":"string","sourceMode":"csv_data|csv_brief|mixed"}`;
}

function truncateScenarioText(value, maxLength = 600) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function buildCompactCsvScenarioContext(input, options = {}) {
  const compact = options.compact !== false;
  const maxHistoryMessages = Number.isFinite(Number(options.maxHistoryMessages)) ? Number(options.maxHistoryMessages) : 4;
  const maxListItems = Number.isFinite(Number(options.maxListItems)) ? Number(options.maxListItems) : 4;
  const maxHeaders = Number.isFinite(Number(options.maxHeaders)) ? Number(options.maxHeaders) : 18;
  const includeQualityReport = options.includeQualityReport !== false;
  const includeSchemaSummary = options.includeSchemaSummary !== false;
  const messages = normalizeScenarioMessages(input.messages);
  const trimmedMessages = compact ? messages.slice(-maxHistoryMessages) : messages;
  const brief = {
    datasetSummary: input.csvResult?.datasetSummary || {},
    oneLineSummary: truncateScenarioText(input.csvResult?.oneLineSummary || "", compact ? 320 : 1200),
    keyFindings: Array.isArray(input.csvResult?.keyFindings) ? input.csvResult.keyFindings.slice(0, maxListItems) : [],
    risks: Array.isArray(input.csvResult?.risks) ? input.csvResult.risks.slice(0, maxListItems) : [],
    opportunities: Array.isArray(input.csvResult?.opportunities) ? input.csvResult.opportunities.slice(0, maxListItems) : [],
    recommendedActions: Array.isArray(input.csvResult?.recommendedActions) ? input.csvResult.recommendedActions.slice(0, maxListItems) : []
  };
  const schema = {
    headers: Array.isArray(input.parsedCsv?.headers)
      ? (compact ? input.parsedCsv.headers.slice(0, maxHeaders) : input.parsedCsv.headers)
      : [],
    qualityReport: includeQualityReport ? input.qualityReport || null : null,
    schemaSummary: includeSchemaSummary ? truncateScenarioText(input.schemaSummary || "", compact ? 450 : 1500) : null
  };
  return {
    priorMessages: trimmedMessages
      .map((message) => `${message.role === "assistant" ? "Assistant" : "User"}: ${truncateScenarioText(message.content, compact ? 220 : 1000)}`)
      .join("\n"),
    brief,
    schema
  };
}

function buildScenarioFollowupUserContent(input, options = {}) {
  const interviewPrep = isInterviewPrepScenario(input);
  const priorMessages = normalizeScenarioMessages(input.messages)
    .map((message) => `${message.role === "assistant" ? "Assistant" : "User"}: ${message.content}`)
    .join("\n");
  const briefPayload = interviewPrep
    ? {
      oneLineSummary: input.brief?.oneLineSummary || "",
      reportedRoundCount: input.brief?.reportedRoundCount || "",
      roadmapSummary: input.brief?.roadmapSummary || "",
      confidenceLabel: input.brief?.confidenceLabel || "",
      rounds: Array.isArray(input.brief?.rounds) ? input.brief.rounds : [],
      prepPlan: Array.isArray(input.brief?.prepPlan) ? input.brief.prepPlan : [],
      keyWarnings: Array.isArray(input.brief?.keyWarnings) ? input.brief.keyWarnings : [],
      sourceNotes: Array.isArray(input.brief?.sourceNotes) ? input.brief.sourceNotes : [],
      reliability: input.reliability || input.brief?.reliability || null
    }
    : {
      oneLineSummary: input.brief?.oneLineSummary || "",
      subjectSummary: input.brief?.subjectSummary || "",
      overallRiskScore: input.brief?.overallRiskScore,
      overallOpportunityScore: input.brief?.overallOpportunityScore,
      urgent: Array.isArray(input.brief?.urgent) ? input.brief.urgent : [],
      notable: Array.isArray(input.brief?.notable) ? input.brief.notable : [],
      fyi: Array.isArray(input.brief?.fyi) ? input.brief.fyi : [],
      recommendedActions: Array.isArray(input.brief?.recommendedActions) ? input.brief.recommendedActions : [],
      monitoringFrequency: input.brief?.monitoringFrequency || "",
      reliability: input.reliability || input.brief?.reliability || null
    };
  const sections = [
    `Topic: ${input.topic}`,
    `Monitoring mode: ${MODE_LABELS[input.mode] || input.mode}`,
    interviewPrep ? `Target role: ${input.role || "Target role not provided"}` : "",
    `User question: ${input.question}`,
    "",
    interviewPrep ? "Current interview-prep brief:" : "Current monitoring brief:",
    JSON.stringify(briefPayload, null, 2),
    "",
    "Current agent outputs:",
    JSON.stringify(interviewPrep
      ? {
        interviewSignals: input.agentResults?.news || null,
        roleExpectations: input.agentResults?.jobs || null,
        candidateExperience: input.agentResults?.sentiment || null,
        processAndPolicy: input.agentResults?.regulatory || null,
        peerCalibration: input.agentResults?.competitor || null
      }
      : {
        news: input.agentResults?.news || null,
        jobs: input.agentResults?.jobs || null,
        sentiment: input.agentResults?.sentiment || null,
        regulatory: input.agentResults?.regulatory || null,
        competitor: input.agentResults?.competitor || null
      }, null, 2)
  ];
  if (priorMessages) {
    sections.push("", "Recent scenario chat thread:", priorMessages);
  }
  if (options.liveEvidence) {
    sections.push(
      "",
      `Fresh follow-up search query: ${options.liveEvidence.query}`,
      `Fresh signal count: ${options.liveEvidence.sourceCount}`,
      `Verified link count: ${options.liveEvidence.verifiedLinkCount}`,
      "Fresh live evidence:",
      options.liveEvidence.evidenceText
    );
  }
  return sections.filter(Boolean).join("\n");
}

function normalizeScenarioSourceMode(value) {
  if (value === "mixed") return { sourceMode: "mixed" }.sourceMode;
  if (value === "live_followup") return { sourceMode: "live_followup" }.sourceMode;
  if (value === "csv_data") return { sourceMode: "csv_data" }.sourceMode;
  if (value === "csv_brief") return { sourceMode: "csv_brief" }.sourceMode;
  return { sourceMode: "brief" }.sourceMode;
}

function isScenarioAbsenceStyleAnswer(answer) {
  const text = String(answer || "").toLowerCase();
  if (!text) return false;
  return /(no explicit evidence|does not provide explicit evidence|not in the brief|not in (?:the )?agent outputs|would need to confirm|need to confirm directly|does not contain a specific figure|do not contain a specific figure|does not contain a figure|not enough information in the brief|not mentioned in the brief|not mentioned in the agent outputs|the available brief.*do not contain|the brief does not say|the brief doesn't say|there is no evidence in the brief|may consider|might consider|you would need to confirm)/i.test(text);
}

function normalizeScenarioSignalCount(value) {
  if (typeof value !== "number") return null;
  return Number.isFinite(value) ? value : null;
}

function buildCsvScenarioUserContent(input, options = {}) {
  const context = buildCompactCsvScenarioContext(input, options);
  const sections = [
    `Dataset label: ${input.resultId || "Uploaded CSV"}`,
    `User question: ${input.question}`,
    "",
    "CSV analysis brief:",
    JSON.stringify(context.brief, null, 2),
    "",
    "Dataset schema:",
    JSON.stringify(context.schema, null, 2)
  ];
  if (context.priorMessages) {
    sections.push("", "Recent scenario chat thread:", context.priorMessages);
  }
  if (options.rowMatch) {
    sections.push(
      "",
      "Deterministic CSV row matches:",
      JSON.stringify({
        matchedHeaders: options.rowMatch.matchedHeaders || [],
        totalMatchingRows: options.rowMatch.totalMatchingRows || 0,
        matchedRows: options.rowMatch.rows || []
      }, null, 2)
    );
  }
  return sections.filter(Boolean).join("\n");
}

function normalizeCsvCell(value) {
  return String(value ?? "").trim();
}

function tokenizeScenarioQuestion(question) {
  return String(question || "")
    .toLowerCase()
    .replace(/[^a-z0-9_.%-]+/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 2);
}

function buildCsvDistinctValues(records, header, limit = 250) {
  const seen = new Set();
  const values = [];
  for (const record of records || []) {
    const normalized = normalizeCsvCell(record?.[header]).toLowerCase();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    values.push(normalized);
    if (values.length >= limit) break;
  }
  return values;
}

function findCsvQuestionMatches(parsedCsv, question) {
  const headers = Array.isArray(parsedCsv?.headers) ? parsedCsv.headers : [];
  const records = Array.isArray(parsedCsv?.records) ? parsedCsv.records : [];
  const questionText = String(question || "").toLowerCase();
  const tokens = tokenizeScenarioQuestion(question);
  const quotedPhrases = [...questionText.matchAll(/"([^"]+)"/g)].map((match) => match[1].trim()).filter(Boolean);
  const matchedHeaders = headers.filter((header) => questionText.includes(String(header || "").toLowerCase()));
  const filters = [];

  for (const header of matchedHeaders) {
    const distinctValues = buildCsvDistinctValues(records, header);
    const matchedValue = distinctValues.find((value) => value && questionText.includes(value));
    if (matchedValue) {
      filters.push({ header, value: matchedValue });
    }
  }

  const valueNeedle = quotedPhrases[0] || filters[0]?.value || "";
  const useDataIntent = /(show|list|rows?|records?|values?|entries?|which|what is|what are|find|give me|see all)/i.test(questionText) || filters.length > 0 || quotedPhrases.length > 0;

  const scoredRows = records.map((record, index) => {
    let score = 0;
    if (filters.length) {
      for (const filter of filters) {
        const cellValue = normalizeCsvCell(record?.[filter.header]).toLowerCase();
        if (cellValue === filter.value || cellValue.includes(filter.value)) score += 5;
      }
    }
    for (const phrase of quotedPhrases) {
      for (const header of headers) {
        const cellValue = normalizeCsvCell(record?.[header]).toLowerCase();
        if (cellValue.includes(phrase.toLowerCase())) score += 4;
      }
    }
    for (const token of tokens) {
      for (const header of headers) {
        if (String(header || "").toLowerCase() === token) score += 1;
        const cellValue = normalizeCsvCell(record?.[header]).toLowerCase();
        if (token.length >= 3 && cellValue === token) score += 3;
      }
    }
    return { record, rowIndex: index + 1, score };
  }).filter((entry) => entry.score > 0);

  const matchedRows = scoredRows
    .sort((a, b) => b.score - a.score || a.rowIndex - b.rowIndex)
    .map((entry) => ({ rowIndex: entry.rowIndex, ...entry.record }));

  const rowHeaders = ["rowIndex", ...headers];
  return {
    shouldUseCsvData: useDataIntent && matchedRows.length > 0,
    matchedHeaders,
    matchedValue: valueNeedle,
    totalMatchingRows: matchedRows.length,
    rows: matchedRows,
    rowHeaders
  };
}

function normalizeCsvScenarioRows(rows, rowHeaders) {
  return (Array.isArray(rows) ? rows : []).map((row) => {
    const normalized = {};
    for (const header of rowHeaders) {
      normalized[header] = normalizeCsvCell(row?.[header]);
    }
    return normalized;
  });
}

function classifyCsvScenarioIntent(question, rowMatch) {
  const questionText = String(question || "").toLowerCase();
  const asksForRows = /(show|list|find|which|give me|see all|return|display).{0,24}(rows?|records?|entries?|values?)/i.test(questionText)
    || /rows?\s+where/i.test(questionText)
    || /what\s+are\s+the\s+rows?/i.test(questionText);
  const asksForExplanation = /(why|explain|what does this mean|what stands out|summari[sz]e|insight|suggest|pattern|risky|opportunit)/i.test(questionText);

  if (rowMatch?.shouldUseCsvData && asksForRows && asksForExplanation) return "mixed";
  if (rowMatch?.shouldUseCsvData && asksForRows) return "lookup";
  if (asksForExplanation) return "interpretive";
  if (rowMatch?.shouldUseCsvData) return "lookup";
  return "interpretive";
}

function buildDirectCsvScenarioAnswer(question, totalMatchingRows) {
  const questionText = String(question || "").toLowerCase();
  if (/what\s+is|what\s+are|which/i.test(questionText)) {
    return `I found ${totalMatchingRows} matching row${totalMatchingRows === 1 ? "" : "s"} in the uploaded CSV.`;
  }
  return `Here ${totalMatchingRows === 1 ? "is" : "are"} ${totalMatchingRows} matching row${totalMatchingRows === 1 ? "" : "s"} from the uploaded CSV.`;
}

function buildCsvScenarioModelRequest(input, options = {}) {
  const compactOptions = {
    compact: true,
    maxHistoryMessages: 4,
    maxListItems: 4,
    maxHeaders: 18,
    includeQualityReport: true,
    includeSchemaSummary: true,
    ...options
  };
  let userContent = buildCsvScenarioUserContent(input, compactOptions);
  if (userContent.length > 14000) {
    userContent = buildCsvScenarioUserContent(input, {
      ...compactOptions,
      maxHistoryMessages: 2,
      maxListItems: 3,
      maxHeaders: 12,
      includeQualityReport: false,
      includeSchemaSummary: true
    });
  }
  if (userContent.length > 9000) {
    userContent = buildCsvScenarioUserContent(input, {
      ...compactOptions,
      maxHistoryMessages: 0,
      maxListItems: 2,
      maxHeaders: 10,
      includeQualityReport: false,
      includeSchemaSummary: false
    });
  }
  return userContent;
}

async function runScenarioFollowup(input) {
  const normalizedMessages = normalizeScenarioMessages(input.messages);
  const briefPass = await runModelJson({
    providerConfig: input.connection,
    systemPrompt: buildScenarioFollowupPrompt("brief", input.scenarioType),
    userContent: buildScenarioFollowupUserContent(input)
  });

  const baseAnswer = String(briefPass?.answer || "").trim();
  const briefAnswerSignalsMissingEvidence = isScenarioAbsenceStyleAnswer(baseAnswer);
  const canAnswerFromBrief = Boolean(briefPass?.canAnswerFromBrief) && Boolean(baseAnswer) && !briefAnswerSignalsMissingEvidence;
  const needsFreshSearch = Boolean(briefPass?.needsFreshSearch) || !canAnswerFromBrief || briefAnswerSignalsMissingEvidence;
  const followupQuery = String(briefPass?.followupQuery || `${input.topic} ${input.role || ""} ${input.question} latest updates`).trim();

  let finalAnswer = baseAnswer;
  let sourceMode = normalizeScenarioSourceMode("brief");
  let freshnessLabel = null;
  let signalCount = null;
  let verifiedLinks = [];

  if (needsFreshSearch) {
    const liveEvidence = await searchTopicSignals(input.topic, input.mode, {
      searchQuery: () => followupQuery || `${input.topic} ${input.role || ""} ${input.question} latest updates`
    });
    const livePass = await runModelJson({
      providerConfig: input.connection,
      systemPrompt: buildScenarioFollowupPrompt("live", input.scenarioType),
      userContent: buildScenarioFollowupUserContent(input, { liveEvidence })
    });
    finalAnswer = String(livePass?.answer || "").trim() || finalAnswer || "PulseBoard could not find enough evidence to answer that scenario cleanly.";
    sourceMode = livePass?.sourceMode === "mixed" || (baseAnswer && canAnswerFromBrief)
      ? normalizeScenarioSourceMode("mixed")
      : normalizeScenarioSourceMode("live_followup");
    if (livePass?.sourceMode === "brief" && !canAnswerFromBrief) {
      sourceMode = normalizeScenarioSourceMode("live_followup");
    }
    freshnessLabel = liveEvidence.freshnessLabel || null;
    signalCount = normalizeScenarioSignalCount(liveEvidence.sourceCount);
    verifiedLinks = Array.isArray(liveEvidence.sources)
      ? liveEvidence.sources
        .filter((source) => source.verified)
        .slice(0, 4)
        .map((source) => ({
          title: source.title,
          url: source.url,
          freshnessLabel: source.freshnessLabel
        }))
      : [];
  }

  if (!finalAnswer) {
    finalAnswer = isInterviewPrepScenario(input)
      ? "PulseBoard could not answer that interview-prep question from the current run."
      : "PulseBoard could not answer that scenario from the current monitoring run.";
  }

  const nextMessages = [
    ...normalizedMessages,
    { role: "user", content: input.question },
    { role: "assistant", content: finalAnswer, sourceMode: normalizeScenarioSourceMode(sourceMode), freshnessLabel, signalCount, verifiedLinks }
  ];

  return {
    answer: finalAnswer,
    sourceMode,
    freshnessLabel,
    signalCount,
    verifiedLinks,
    messages: nextMessages
  };
}

async function runCsvScenarioFollowup(input) {
  const normalizedMessages = normalizeScenarioMessages(input.messages);
  const rowMatch = findCsvQuestionMatches(input.parsedCsv, input.question);
  const matchedRows = rowMatch.shouldUseCsvData ? normalizeCsvScenarioRows(rowMatch.rows, rowMatch.rowHeaders) : [];
  const displayedRowCount = Math.min(5, matchedRows.length);
  const totalMatchingRows = matchedRows.length;
  const hasMoreRows = totalMatchingRows > displayedRowCount;
  const scenarioIntent = classifyCsvScenarioIntent(input.question, rowMatch);

  if (scenarioIntent === "lookup" && rowMatch.shouldUseCsvData) {
    const answer = buildDirectCsvScenarioAnswer(input.question, totalMatchingRows);
    const sourceMode = normalizeScenarioSourceMode("csv_data");
    const nextMessages = [
      ...normalizedMessages,
      { role: "user", content: input.question },
      {
        role: "assistant",
        content: answer,
        sourceMode,
        matchedRows,
        rowHeaders: rowMatch.rowHeaders,
        displayedRowCount,
        totalMatchingRows,
        hasMoreRows,
        messageId: `csv-scenario-${Date.now()}-${normalizedMessages.length}`
      }
    ];

    return {
      answer,
      sourceMode,
      matchedRows,
      rowHeaders: rowMatch.rowHeaders,
      displayedRowCount,
      totalMatchingRows,
      hasMoreRows,
      messages: nextMessages
    };
  }

  const sampledRowMatch = rowMatch.shouldUseCsvData
    ? { ...rowMatch, rows: rowMatch.rows.slice(0, 5) }
    : null;
  const briefPass = await runModelJson({
    providerConfig: input.connection,
    systemPrompt: buildCsvScenarioPrompt(scenarioIntent === "mixed" ? "live" : "brief"),
    userContent: buildCsvScenarioModelRequest(
      input,
      scenarioIntent === "mixed" && sampledRowMatch
        ? { rowMatch: sampledRowMatch }
        : {}
    )
  });

  const sourceMode = normalizeScenarioSourceMode(
    scenarioIntent === "mixed"
      ? "mixed"
      : rowMatch.shouldUseCsvData
        ? "csv_data"
        : "csv_brief"
  );
  const answer = String(briefPass?.answer || "").trim() || (
    rowMatch.shouldUseCsvData
      ? `I found ${totalMatchingRows} matching row${totalMatchingRows === 1 ? "" : "s"} in the uploaded CSV.`
      : "PulseBoard could not find an exact row match, so this answer comes from the current CSV brief."
  );
  const nextMessages = [
    ...normalizedMessages,
    { role: "user", content: input.question },
    {
      role: "assistant",
      content: answer,
      sourceMode,
      matchedRows,
      rowHeaders: rowMatch.rowHeaders,
      displayedRowCount,
      totalMatchingRows,
      hasMoreRows,
      messageId: `csv-scenario-${Date.now()}-${normalizedMessages.length}`
    }
  ];

  return {
    answer,
    sourceMode,
    matchedRows,
    rowHeaders: rowMatch.rowHeaders,
    displayedRowCount,
    totalMatchingRows,
    hasMoreRows,
    messages: nextMessages
  };
}

async function analyzeCsvSession(input) {
  if (!input.csvText || !input.csvText.trim()) {
    throw new Error("CSV text is required.");
  }
  const parsedCsv = parseCsvText(input.csvText);
  const csvSummary = summarizeCsvData(parsedCsv);
  return runCsvAnalyst(input.connection, parsedCsv, csvSummary, input.analysisGoal, input.qualityReport, input.schemaSummary, input.correlationSummary, input.segmentSummary, input.cleaningSummary, input.transformationLogSummary);
}

async function compareCsvSession(input) {
  if (!input.csvTextA || !input.csvTextA.trim()) {
    throw new Error("CSV text is required for File A.");
  }
  if (!input.csvTextB || !input.csvTextB.trim()) {
    throw new Error("CSV text is required for File B.");
  }
  const parsedA = parseCsvText(input.csvTextA);
  const parsedB = parseCsvText(input.csvTextB);
  if (!parsedA.records.length) {
    throw new Error("File A must include at least one data row.");
  }
  if (!parsedB.records.length) {
    throw new Error("File B must include at least one data row.");
  }
  const summaryA = summarizeCsvData(parsedA);
  const summaryB = summarizeCsvData(parsedB);
  return runCsvComparisonAnalyst(input.connection, {
    labelA: input.labelA || "File A",
    labelB: input.labelB || "File B",
    parsedA,
    parsedB,
    summaryA,
    summaryB,
    qualityReportA: input.qualityReportA,
    qualityReportB: input.qualityReportB
  }, input.analysisGoal);
}

async function crossReferenceSession(input, emit) {
  const monitoringPromises = AGENT_SPECS.map((agent) => {
    emit({ type: "agent_started", agent: agent.key });
    return runMonitoringAgent(input.connection, input.topic, "company", agent, {
      extraContext: input.csvContext
    })
      .then((result) => {
        emit({ type: "agent_result", agent: agent.key, result });
        return { agent: agent.key, result };
      })
      .catch((error) => {
        emit({ type: "agent_error", agent: agent.key, error: error.message || "Agent failed." });
        return { agent: agent.key, result: { error: true, message: error.message || "Agent failed." } };
      });
  });

  const settled = await Promise.all(monitoringPromises);
  const byAgent = Object.fromEntries(settled.map((entry) => [entry.agent, entry.result]));
  const successCount = Object.values(byAgent).filter((entry) => entry && !entry.error).length;

  if (successCount === 0) {
    emit({ type: "synthesis_error", successCount, error: "Cross-reference unavailable. External intelligence could not be retrieved." });
    emit({ type: "connection_status", connectionStatus: buildConnectionStatus(input.connection) });
    emit({ type: "done" });
    return;
  }

  emit({ type: "synthesis_started", successCount });
  try {
    const result = await runCrossReferenceSynthesis(input.connection, input.topic, byAgent, input.csvResults);
    emit({ type: "synthesis", result, successCount });
  } catch (error) {
    emit({ type: "synthesis_error", successCount, error: error.message || "Cross-reference unavailable. External intelligence could not be retrieved." });
  }
  emit({ type: "connection_status", connectionStatus: buildConnectionStatus(input.connection) });
  emit({ type: "done" });
}

async function searchTopicSignals(topic, mode, agentSpec, role = "") {
  const query = agentSpec.searchQuery(topic, mode, role);
  let sources;
  if (process.env.TAVILY_API_KEY) {
    try {
      sources = await searchWithTavily(query);
    } catch (error) {
      console.warn("Tavily search failed, falling back to DuckDuckGo:", error.message);
    }
  }
  if (!sources) {
    sources = await searchWithDuckDuckGo(query);
  }
  const verifiedSources = await Promise.all((Array.isArray(sources) ? sources : []).map(async (source, index) => {
    const normalized = sanitizeSearchSource(source, index);
    normalized.verified = normalized.url ? await verifyUrlReachable(normalized.url) : false;
    return normalized;
  }));
  const evidence = buildEvidenceSummary(query, verifiedSources);
  ({ sources } = evidence);
  const { sourceCount, verifiedLinkCount, evidenceText } = evidence;
  return {
    query,
    sources,
    sourceCount,
    verifiedLinkCount,
    evidenceText,
    freshnessLabel: evidence.freshnessLabel,
    confidenceLabel: evidence.confidenceLabel,
    partialCoverage: evidence.partialCoverage
  };
}

async function searchWithTavily(query) {
  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: process.env.TAVILY_API_KEY,
      query,
      search_depth: "advanced",
      max_results: 5
    })
  });
  if (!response.ok) {
    throw new Error(`Tavily search failed with ${response.status}`);
  }
  const payload = await response.json();
  const results = Array.isArray(payload.results) ? payload.results : [];
  return results.slice(0, 5).map((item, index) => sanitizeSearchSource({
    title: item.title || `Source ${index + 1}`,
    url: item.url || "",
    content: item.content || "",
    publishedAt: item.published_date || item.published_at || ""
  }, index));
}

async function searchWithDuckDuckGo(query) {
  const response = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
    headers: {
      "User-Agent": "PulseBoard/1.0 (+https://pulseboard.local)"
    }
  });
  if (!response.ok) {
    throw new Error(`DuckDuckGo search failed with ${response.status}`);
  }
  const html = await response.text();
  const results = [];
  const pattern = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>[\s\S]*?<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
  let match;
  while ((match = pattern.exec(html)) && results.length < 5) {
    results.push({
      url: decodeHtml(match[1]),
      title: stripHtml(match[2]),
      snippet: stripHtml(match[3])
    });
  }
  if (!results.length) {
    const fallbackPattern = /<a[^>]*class="result-link"[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/g;
    while ((match = fallbackPattern.exec(html)) && results.length < 5) {
      results.push({
        url: decodeHtml(match[1]),
        title: stripHtml(match[2]),
        snippet: "No summary available from fallback parsing."
      });
    }
  }
  if (!results.length) {
    throw new Error("No search results could be parsed.");
  }
  return results.map((item, index) => sanitizeSearchSource(item, index));
}

function parseCsvText(csvText) {
  const lines = String(csvText || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").filter((line) => line.trim().length > 0);
  if (lines.length < 2) {
    throw new Error("CSV must include a header row and at least one data row.");
  }

  const rows = lines.map(parseCsvLine);
  const headers = rows[0].map((header, index) => header || `column_${index + 1}`);
  const records = rows.slice(1).map((row) => {
    const record = {};
    headers.forEach((header, index) => {
      record[header] = row[index] ?? "";
    });
    return record;
  });

  return { headers, records };
}

function parseCsvLine(line) {
  const values = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];
    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      i += 1;
      continue;
    }
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (char === "," && !inQuotes) {
      values.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  values.push(current.trim());
  return values;
}

function summarizeCsvData(parsedCsv) {
  const { headers, records } = parsedCsv;
  const sampledRecords = records.slice(0, 20);
  const columnSummaries = headers.map((header) => summarizeColumn(header, records.map((record) => record[header])));
  return {
    rowCount: records.length,
    columnCount: headers.length,
    columns: headers,
    sampleRows: sampledRecords,
    columnSummaries
  };
}

function isMissing(value) {
  if (value === null || value === undefined) return true;
  const trimmed = String(value).trim();
  if (!trimmed) return true;
  return ["null", "undefined", "n/a", "na", "-", "none", "#n/a", "#null"].includes(trimmed.toLowerCase());
}

function parseNumericValue(value) {
  if (value === null || value === undefined) return Number.NaN;
  const normalized = String(value).replace(/,/g, "").trim();
  if (!normalized) return Number.NaN;
  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? numeric : Number.NaN;
}

function deduplicateCandidatesByRow(candidates) {
  const byRow = {};
  candidates.forEach((candidate) => {
    if (!byRow[candidate.rowIndex]) {
      byRow[candidate.rowIndex] = candidate;
    } else {
      const existing = byRow[candidate.rowIndex];
      const typeRank = {
        impossible_value: 3,
        missing_value: 2,
        statistical_outlier: 1
      };
      const newRank = typeRank[candidate.type] || 0;
      const existingRank = typeRank[existing.type] || 0;
      if ((candidate.zScore || 0) > (existing.zScore || 0) || newRank > existingRank) {
        byRow[candidate.rowIndex] = candidate;
      }
    }
  });
  return Object.values(byRow)
    .sort((a, b) => (b.zScore || 0) - (a.zScore || 0))
    .slice(0, 5);
}

function isTransactionalDataset(headers, rows) {
  const hasRevenue = headers.some((header) =>
    ["revenue", "net_revenue", "gross_revenue", "total_amount", "sales", "amount"]
      .some((key) => header.toLowerCase().includes(key))
  );
  const hasUnits = headers.some((header) =>
    ["units_sold", "quantity", "qty", "units"]
      .some((key) => header.toLowerCase() === key || header.toLowerCase().includes(key))
  );
  if (!hasRevenue || !hasUnits) return false;

  const hasPrice = headers.some((header) =>
    ["unit_price", "price", "rate", "cost_per"]
      .some((key) => header.toLowerCase().includes(key))
  );
  if (!hasPrice) return false;

  const revenueCol = headers.find((header) =>
    ["net_revenue", "gross_revenue", "revenue", "total_amount"]
      .some((key) => header.toLowerCase().includes(key))
  );
  const unitsCol = headers.find((header) =>
    ["units_sold", "quantity", "qty"]
      .some((key) => header.toLowerCase().includes(key))
  );
  const priceCol = headers.find((header) =>
    ["unit_price", "price"]
      .some((key) => header.toLowerCase().includes(key))
  );
  if (!revenueCol || !unitsCol || !priceCol) return false;

  const validRelationships = rows.slice(0, 10).filter((row) => {
    const revenue = parseNumericValue(row[revenueCol]);
    const units = parseNumericValue(row[unitsCol]);
    const price = parseNumericValue(row[priceCol]);
    if (Number.isNaN(revenue) || Number.isNaN(units) || Number.isNaN(price) || units === 0) return false;
    const expected = units * price;
    if (!Number.isFinite(expected) || expected === 0) return false;
    const ratio = revenue / expected;
    return ratio >= 0.30 && ratio <= 1.10;
  }).length;

  return validRelationships >= 6;
}

function findAnomalyCandidates(rows, headers) {
  const candidates = [];
  const statusColumns = headers.filter((col) =>
    ["status", "state", "order_status", "payment_status", "transaction_status"]
      .some((key) => col.toLowerCase().includes(key))
  );
  const skipColumns = headers.filter((col) =>
    ["unit_price", "price", "rate", "discount", "discount_pct", "pct", "percent", "score", "rating", "satisfaction"]
      .some((key) => col.toLowerCase().includes(key))
  );
  const numericCols = headers.filter((col) => {
    const vals = rows
      .map((row) => parseNumericValue(row[col]))
      .filter((value) => !Number.isNaN(value));
    return vals.length > rows.length * 0.5;
  });

  const stats = {};
  numericCols.forEach((col) => {
    const vals = rows
      .map((row) => parseNumericValue(row[col]))
      .filter((value) => !Number.isNaN(value));
    const mean = vals.reduce((sum, value) => sum + value, 0) / vals.length;
    const variance = vals.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / vals.length;
    stats[col] = {
      mean: Math.round(mean * 100) / 100,
      stdDev: Math.round(Math.sqrt(variance) * 100) / 100
    };
  });

  rows.forEach((row, rowIndex) => {
    numericCols.forEach((col) => {
      if (skipColumns.includes(col)) return;
      const val = parseNumericValue(row[col]);
      if (Number.isNaN(val)) return;
      const { mean, stdDev } = stats[col];
      if (!stdDev) return;
      const zScore = Math.abs((val - mean) / stdDev);
      if (zScore > 4) {
        candidates.push({
          rowIndex,
          rowData: row,
          column: col,
          value: val,
          mean: stats[col].mean,
          stdDev: stats[col].stdDev,
          zScore: Math.round(zScore * 10) / 10,
          type: "statistical_outlier"
        });
      }
    });

    headers.forEach((col) => {
      if (!isMissing(row[col])) return;
      const isKeyCol = ["sales_rep", "rep", "product", "region", "customer", "name", "email", "id"]
        .some((key) => col.toLowerCase().includes(key));
      if (isKeyCol) {
        candidates.push({
          rowIndex,
          rowData: row,
          column: col,
          value: null,
          mean: null,
          stdDev: null,
          zScore: null,
          type: "missing_value"
        });
      }
    });

    const positiveOnlyCols = headers.filter((col) =>
      ["price", "revenue", "sales", "amount", "cost", "units", "quantity"].some((key) => col.toLowerCase().includes(key))
    );
    positiveOnlyCols.forEach((col) => {
      const val = parseNumericValue(row[col]);
      if (!Number.isNaN(val) && val < 0) {
        candidates.push({
          rowIndex,
          rowData: row,
          column: col,
          value: val,
          mean: stats[col]?.mean ?? null,
          stdDev: stats[col]?.stdDev ?? null,
          zScore: null,
          type: "impossible_value"
        });
      }
    });
  });

  const revenueCols = headers.filter((col) =>
    ["revenue", "net_revenue", "gross_revenue", "sales", "amount"].some((key) => col.toLowerCase().includes(key))
  );
  const unitsCols = headers.filter((col) =>
    ["units", "quantity", "qty", "units_sold", "volume"].some((key) => col.toLowerCase().includes(key))
  );

  if (revenueCols.length > 0 && unitsCols.length > 0 && isTransactionalDataset(headers, rows)) {
    const revenueCol = revenueCols[0];
    const unitsCol = unitsCols[0];
    const ratios = rows
      .map((row) => ({
        revenue: parseNumericValue(row[revenueCol]),
        units: parseNumericValue(row[unitsCol])
      }))
      .filter((entry) => !Number.isNaN(entry.revenue) && !Number.isNaN(entry.units) && entry.units > 0)
      .map((entry) => entry.revenue / entry.units);

    if (ratios.length) {
      const avgRatio = ratios.reduce((sum, value) => sum + value, 0) / ratios.length;
      rows.forEach((row, rowIndex) => {
        const revenue = parseNumericValue(row[revenueCol]);
        const units = parseNumericValue(row[unitsCol]);
        if (Number.isNaN(revenue) || Number.isNaN(units) || units === 0) return;
        const statusText = statusColumns
          .map((col) => String(row[col] || "").trim().toLowerCase())
          .filter(Boolean)
          .join(" ");
        if (/(refund|refunded|return|returned|cancelled|canceled|voided|chargeback)/i.test(statusText)) return;
        const ratio = revenue / units;
        if (ratio < avgRatio * 0.02 && units > 10) {
          candidates.push({
            rowIndex,
            rowData: row,
            column: revenueCol,
            value: revenue,
            mean: Math.round(avgRatio * units * 100) / 100,
            stdDev: null,
            zScore: 99,
            type: "impossible_value",
            reason: `Revenue per unit ($${ratio.toFixed(2)}) is less than 1% of average ($${avgRatio.toFixed(2)}/unit) — likely a data entry error`
          });
        }
      });
    }
  }

  const rawCandidates = candidates.filter((candidate, index, list) =>
    list.findIndex((entry) => entry.rowIndex === candidate.rowIndex && entry.column === candidate.column) === index
  );
  return deduplicateCandidatesByRow(rawCandidates);
}

function formatCandidatesForAgent(candidates) {
  if (!candidates.length) {
    return "No statistical anomalies detected in pre-computation.";
  }
return "Pre-computed anomaly candidates:\n" + candidates.map((candidate, index) => `Candidate ${index + 1}:
rowIndex: ${candidate.rowIndex}
column: ${candidate.column}
value: ${candidate.value}
type: ${candidate.type}
${candidate.reason ? `reason: ${candidate.reason}` : ""}
${candidate.zScore ? `zScore: ${candidate.zScore} (mean: ${candidate.mean}, stdDev: ${candidate.stdDev})` : "missing or impossible value"}
row preview: ${JSON.stringify(candidate.rowData).substring(0, 200)}`).join("\n\n");
}

function summarizeColumn(header, values) {
  const nonEmptyValues = values.filter((value) => String(value || "").trim() !== "");
  const numericValues = nonEmptyValues.map((value) => Number(value)).filter((value) => Number.isFinite(value));
  const uniqueCount = new Set(nonEmptyValues).size;
  const summary = {
    name: header,
    nonEmptyCount: nonEmptyValues.length,
    uniqueCount
  };
  if (numericValues.length && numericValues.length >= Math.max(1, Math.floor(nonEmptyValues.length * 0.6))) {
    summary.type = "numeric";
    summary.min = Math.min(...numericValues);
    summary.max = Math.max(...numericValues);
    summary.average = Number((numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length).toFixed(2));
  } else {
    summary.type = "text";
    summary.topValues = mostCommon(nonEmptyValues, 5);
  }
  return summary;
}

function mostCommon(values, limit) {
  const counts = new Map();
  for (const value of values) {
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([value, count]) => ({ value, count }));
}

async function runCsvAnalyst(providerConfig, parsedCsv, csvSummary, analysisGoal, qualityReport, schemaSummary, correlationSummary, segmentSummary, cleaningSummary, transformationLogSummary) {
  const anomalyCandidates = findAnomalyCandidates(parsedCsv.records, parsedCsv.headers);
  const userContent = [
    analysisGoal ? `Analysis goal: ${analysisGoal}` : "Analysis goal: provide a concise executive summary of the uploaded CSV.",
    "",
    `Dataset row count: ${csvSummary.rowCount}`,
    `Dataset column count: ${csvSummary.columnCount}`,
    `Columns: ${csvSummary.columns.join(", ")}`,
    "",
    `Column summaries: ${JSON.stringify(csvSummary.columnSummaries)}`,
    "",
    `Sample rows: ${JSON.stringify(csvSummary.sampleRows)}`,
    qualityReport ? "" : "",
    qualityReport ? formatQualityContext("Dataset", qualityReport) : "",
    "",
    schemaSummary ? `Pre-computed column schema:\n${schemaSummary}` : "",
    "",
    correlationSummary ? `Pre-computed correlations:\n${correlationSummary}` : "",
    "",
    segmentSummary ? `Pre-computed segment summaries:\n${segmentSummary}` : "",
    "",
    cleaningSummary ? formatCleaningContext(cleaningSummary, transformationLogSummary) : "",
    "",
    formatCandidatesForAgent(anomalyCandidates)
  ].join("\n");

  const result = await runModelJson({
    providerConfig,
    systemPrompt: CSV_ANALYST_PROMPT,
    userContent
  });

  return {
    datasetSummary: {
      rowCount: csvSummary.rowCount,
      columnCount: csvSummary.columnCount,
      columns: csvSummary.columns
    },
    keyFindings: Array.isArray(result.keyFindings) ? result.keyFindings : [],
    risks: Array.isArray(result.risks) ? result.risks : [],
    opportunities: Array.isArray(result.opportunities) ? result.opportunities : [],
    recommendedActions: normalizeRecommendedActions(result.recommendedActions),
    oneLineSummary: result.oneLineSummary || "CSV analysis completed.",
    anomalies: normalizeCsvAnomalies(result.anomalies),
    chartRecommendations: Array.isArray(result.chartRecommendations) ? result.chartRecommendations.slice(0, 3) : []
  };
}

function normalizeRecommendedActions(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item || "").trim())
      .filter(Boolean)
      .slice(0, 4);
  }
  if (typeof value === "string") {
    return value
      .split(/\s*;\s*/)
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 4);
  }
  return [];
}

function normalizeCsvAnomalies(value, options = {}) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const file = String(item?.file || (options.comparison ? "A" : "")).toUpperCase().replace(/FILE\s*/i, "").trim();
      if (options.comparison) {
        return {
          description: String(item?.description || "").trim(),
          severity: String(item?.severity || "low").trim().toLowerCase(),
          file: file === "B" ? "B" : "A"
        };
      }
      return {
        rowIndex: Number.isInteger(item?.rowIndex) ? item.rowIndex : Number(item?.rowIndex),
        anomalousColumn: String(item?.anomalousColumn || item?.column || "").trim(),
        severity: String(item?.severity || "low").trim().toLowerCase(),
        description: String(item?.description || "").trim(),
        type: String(item?.type || "").trim(),
        ...(options.comparison ? { file: file === "B" ? "B" : "A" } : {})
      };
    })
    .filter((item) => options.comparison ? item.description : (Number.isFinite(item.rowIndex) && item.rowIndex >= 0 && item.description))
    .slice(0, 3);
}

function formatQualityContext(label, qualityReport) {
  const issues = Array.isArray(qualityReport?.flags) && qualityReport.flags.length
    ? qualityReport.flags.join(", ")
    : "none";
  return [
    "Pre-computed data quality scores (computed by JS, not estimated):",
    `Dataset reference: ${label}`,
    `- Overall quality score: ${Number(qualityReport?.overallScore || 0)}/100 (${String(qualityReport?.label || "Critical")})`,
    `- Completeness: ${Number(qualityReport?.completeness || 0)}%`,
    `- Consistency: ${Number(qualityReport?.consistency || 0)}%`,
    `- Uniqueness: ${Number(qualityReport?.uniqueness || 0)}%`,
    `- Validity: ${Number(qualityReport?.validity || 0)}%`,
    `- Issues found: ${issues}`,
    "Reference these exact numbers in your analysis. Do not re-estimate quality scores."
  ].join("\n");
}

function formatCleaningContext(cleaningSummary, transformationLogSummary) {
  const counts = cleaningSummary?.byType || {};
  const mode = String(cleaningSummary?.mode || "clean").toLowerCase() === "raw" ? "raw" : "clean";
  const transformedColumns = Number(cleaningSummary?.transformedColumns || 0);
  const numericCount = Number(counts.numeric_standardization || 0);
  const categoricalCount = Number(counts.categorical_normalization || 0);
  const missingFillMeanCount = Number(counts.missing_value_fill_mean || 0);
  const missingFillMedianCount = Number(counts.missing_value_fill_median || 0);
  const missingFillModeCount = Number(counts.missing_value_fill_mode || 0);
  const missingFillZeroCount = Number(counts.missing_value_fill_zero || 0);
  const droppedRowsCount = Number(counts.row_dropped_missing || 0);
  const notableEvents = Array.isArray(transformationLogSummary) && transformationLogSummary.length
    ? transformationLogSummary.slice(0, 8).map((entry) => {
        const location = Number.isInteger(entry?.rowIndex) ? `row ${entry.rowIndex + 2}` : "column summary";
        const column = entry?.column ? `${entry.column}` : "dataset";
        return `- ${entry?.state || "applied"} ${entry?.type || "change"} on ${column} (${location}): ${entry?.detail || "No detail provided."}`;
      }).join("\n")
    : "- No transformation events recorded.";
  return [
    "Client-side data cleaning summary:",
    `- Cleaning mode: ${mode}`,
    `- Applied transformations: ${Number(cleaningSummary?.appliedCount || 0)}`,
    `- Transformed columns: ${transformedColumns}`,
    `- Numeric standardizations: ${numericCount}`,
    `- Categorical normalizations: ${categoricalCount}`,
    `- Missing values filled with mean: ${missingFillMeanCount}`,
    `- Missing values filled with median: ${missingFillMedianCount}`,
    `- Missing values filled with mode: ${missingFillModeCount}`,
    `- Missing values filled with zero: ${missingFillZeroCount}`,
    `- Rows dropped due to missing values: ${droppedRowsCount}`,
    mode === "raw"
      ? "The raw parsed dataset was analyzed unchanged."
      : "The cleaned dataset was analyzed using these exact transformations.",
    "Notable cleaning events:",
    notableEvents
  ].join("\n");
}

function buildCompactComparisonSummary(summary) {
  return {
    rowCount: summary.rowCount,
    columnCount: summary.columnCount,
    columns: Array.isArray(summary.columns) ? summary.columns.slice(0, 12) : [],
    sampleRows: Array.isArray(summary.sampleRows) ? summary.sampleRows.slice(0, 3) : [],
    columnSummaries: Array.isArray(summary.columnSummaries)
      ? summary.columnSummaries.slice(0, 8).map((column) => ({
          name: column.name,
          type: column.type,
          min: column.min,
          max: column.max,
          mean: column.mean,
          uniqueCount: column.uniqueCount,
          topValues: Array.isArray(column.topValues) ? column.topValues.slice(0, 3) : []
        }))
      : []
  };
}

async function runCsvComparisonAnalyst(providerConfig, comparisonInput, analysisGoal) {
  const { labelA, labelB, summaryA, summaryB, qualityReportA, qualityReportB } = comparisonInput;
  const sharedColumns = summaryA.columns.filter((column) => summaryB.columns.includes(column));
  const onlyInA = summaryA.columns.filter((column) => !summaryB.columns.includes(column));
  const onlyInB = summaryB.columns.filter((column) => !summaryA.columns.includes(column));
  const schemaMatch = summaryA.columns.length === summaryB.columns.length && onlyInA.length === 0 && onlyInB.length === 0;

  const buildComparisonUserContent = (options = {}) => [
    analysisGoal ? `Analysis goal: ${analysisGoal}` : "Analysis goal: compare these two datasets like a senior analyst and explain what changed.",
    options.concise ? "Return very concise JSON. Keep every string short, use compact phrasing, and prioritize completeness over prose." : "",
    "",
    `File A label: ${labelA}`,
    `File A summary: ${JSON.stringify(options.compact ? buildCompactComparisonSummary(summaryA) : summaryA)}`,
    "",
    `File B label: ${labelB}`,
    `File B summary: ${JSON.stringify(options.compact ? buildCompactComparisonSummary(summaryB) : summaryB)}`,
    "",
    `Computed shared columns: ${JSON.stringify(sharedColumns)}`,
    `Computed onlyInA columns: ${JSON.stringify(onlyInA)}`,
    `Computed onlyInB columns: ${JSON.stringify(onlyInB)}`,
    `Computed schemaMatch: ${schemaMatch}`,
    qualityReportA ? "" : "",
    qualityReportA ? formatQualityContext(labelA, qualityReportA) : "",
    qualityReportB ? "" : "",
    qualityReportB ? formatQualityContext(labelB, qualityReportB) : ""
  ].join("\n");

  let result;
  try {
    result = await runModelJson({
      providerConfig,
      systemPrompt: CSV_COMPARISON_PROMPT,
      userContent: buildComparisonUserContent()
    });
  } catch (error) {
    if (!(error && error.message && error.message.includes("Provider returned truncated JSON output."))) {
      throw error;
    }
    result = await runModelJson({
      providerConfig,
      systemPrompt: CSV_COMPARISON_PROMPT,
      userContent: buildComparisonUserContent({ compact: true, concise: true })
    });
  }

  return {
    fileA: {
      rowCount: Number(result?.fileA?.rowCount || summaryA.rowCount || 0),
      columnCount: Number(result?.fileA?.columnCount || summaryA.columnCount || 0),
      summary: result?.fileA?.summary || `${labelA} contains ${summaryA.rowCount} rows across ${summaryA.columnCount} columns.`
    },
    fileB: {
      rowCount: Number(result?.fileB?.rowCount || summaryB.rowCount || 0),
      columnCount: Number(result?.fileB?.columnCount || summaryB.columnCount || 0),
      summary: result?.fileB?.summary || `${labelB} contains ${summaryB.rowCount} rows across ${summaryB.columnCount} columns.`
    },
    sharedColumns: Array.isArray(result.sharedColumns) ? result.sharedColumns : sharedColumns,
    onlyInA: Array.isArray(result.onlyInA) ? result.onlyInA : onlyInA,
    onlyInB: Array.isArray(result.onlyInB) ? result.onlyInB : onlyInB,
    schemaMatch: typeof result.schemaMatch === "boolean" ? result.schemaMatch : schemaMatch,
    metricComparisons: Array.isArray(result.metricComparisons) ? result.metricComparisons.slice(0, 5) : [],
    growthColumns: Array.isArray(result.growthColumns) ? result.growthColumns : [],
    declineColumns: Array.isArray(result.declineColumns) ? result.declineColumns : [],
    anomalies: normalizeCsvAnomalies(result.anomalies, { comparison: true }),
    keyInsight: result.keyInsight || "No key insight returned.",
    recommendation: result.recommendation || "No recommendation returned.",
    chartRecommendations: Array.isArray(result.chartRecommendations) ? result.chartRecommendations.slice(0, 2) : []
  };
}

async function runCrossReferenceSynthesis(providerConfig, topic, monitoringResults, csvResults) {
  const buildUserContent = (concise = false) => [
    concise ? "Return concise JSON. Keep all strings short and evidence-led." : "",
    `Topic: ${topic}`,
    "",
    "INTERNAL DATA (from CSV analysis):",
    JSON.stringify({
      keyInsight: csvResults?.keyInsight || csvResults?.oneLineSummary || "",
      growthAreas: csvResults?.growthColumns || [],
      declineAreas: csvResults?.declineColumns || [],
      anomalies: Array.isArray(csvResults?.anomalies) ? csvResults.anomalies.map((item) => item.description || item) : [],
      recommendations: csvResults?.recommendedActions || [],
      metricChanges: Array.isArray(csvResults?.metricComparisons) ? csvResults.metricComparisons.slice(0, 3) : []
    }, null, 2),
    "",
    "EXTERNAL INTELLIGENCE (from 5 monitoring agents):",
    `News: ${JSON.stringify(monitoringResults.news || null)}`,
    `Jobs: ${JSON.stringify(monitoringResults.jobs || null)}`,
    `Sentiment: ${JSON.stringify(monitoringResults.sentiment || null)}`,
    `Regulatory: ${JSON.stringify(monitoringResults.regulatory || null)}`,
    `Competitors: ${JSON.stringify(monitoringResults.competitor || null)}`
  ].filter(Boolean).join("\n");

  try {
    return await runModelJson({
      providerConfig,
      systemPrompt: CROSS_REFERENCE_SYNTHESIS_PROMPT,
      userContent: buildUserContent(false)
    });
  } catch (error) {
    if (!(error && error.message && error.message.includes("Provider returned truncated JSON output."))) {
      throw error;
    }
    return runModelJson({
      providerConfig,
      systemPrompt: CROSS_REFERENCE_SYNTHESIS_PROMPT,
      userContent: buildUserContent(true)
    });
  }
}

async function runModelJson({ providerConfig, systemPrompt, userContent }) {
  return withBuiltInConnectionFallback(providerConfig, async (effectiveConnection) => {
    switch (effectiveConnection.provider) {
      case "openai":
        return runOpenAIJson(effectiveConnection, systemPrompt, userContent);
      case "anthropic":
        return runAnthropicJson(effectiveConnection, systemPrompt, userContent);
      case "gemini":
        return runGeminiJson(effectiveConnection, systemPrompt, userContent);
      case "nvidia":
        return runNvidiaJson(effectiveConnection, systemPrompt, userContent);
      default:
        throw new Error("Unsupported provider.");
    }
  });
}

async function runOpenAIValidationProbe(providerConfig) {
  const endpoint = normalizeBaseUrl(providerConfig.endpoint, "/responses");
  let response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${providerConfig.apiKey}`
    },
    body: JSON.stringify({
      model: providerConfig.model,
      input: "Reply with PONG only.",
      max_output_tokens: 12
    })
  });
  let payload = await response.json().catch(() => ({}));
  if (response.ok) {
    const text = extractOpenAIText(payload);
    if (text.trim() || hasSuccessfulOpenAIValidationPayload(payload)) {
      return;
    }
    assertValidationText(text, PROVIDER_PRESETS[providerConfig.provider].label);
    return;
  }

  const fallbackEndpoint = normalizeBaseUrl(providerConfig.endpoint, "/chat/completions");
  response = await fetch(fallbackEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${providerConfig.apiKey}`,
      "Accept": "application/json"
    },
    body: JSON.stringify({
      model: providerConfig.model,
      messages: [{ role: "user", content: "Reply with PONG only." }],
      max_tokens: 12,
      temperature: 0,
      stream: false
    })
  });
  payload = await response.json().catch(() => ({}));
  if (!response.ok) throw buildProviderError(providerConfig, payload, response.status);
  const fallbackText = extractChatCompletionText(payload);
  assertValidationText(fallbackText, PROVIDER_PRESETS[providerConfig.provider].label);
}

async function runAnthropicValidationProbe(providerConfig) {
  const endpoint = normalizeMessageEndpoint(providerConfig.endpoint, "/v1/messages");
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": providerConfig.apiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: providerConfig.model,
      max_tokens: 12,
      system: "Reply with PONG only.",
      messages: [{ role: "user", content: "Reply with PONG only." }]
    })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw buildProviderError(providerConfig, payload, response.status);
  const text = (payload.content || [])
    .filter((item) => item.type === "text" && item.text)
    .map((item) => item.text)
    .join("\n")
    .trim();
  assertValidationText(text, PROVIDER_PRESETS[providerConfig.provider].label);
}

async function runGeminiValidationProbe(providerConfig) {
  const endpoint = buildGeminiEndpoint(providerConfig);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: "Reply with PONG only." }] }],
      generationConfig: { temperature: 0, maxOutputTokens: 12 }
    })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw buildProviderError(providerConfig, payload, response.status);
  return;
}

async function runNvidiaValidationProbe(providerConfig) {
  const responseEndpoint = normalizeBaseUrl(providerConfig.endpoint, "/responses");
  const headers = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${providerConfig.apiKey}`
  };

  let response = await fetch(responseEndpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: providerConfig.model,
      input: "Reply with PONG only.",
      max_output_tokens: 12,
      temperature: 0,
      top_p: 1,
      stream: false
    })
  });
  let payload = await response.json().catch(() => ({}));
  if (response.ok) {
    const text = extractOpenAIText(payload);
    if (text.trim() || hasSuccessfulNvidiaValidationPayload(payload)) {
      return;
    }
    assertValidationText(text, PROVIDER_PRESETS[providerConfig.provider].label);
    return;
  }

  const fallbackEndpoint = normalizeBaseUrl(providerConfig.endpoint, "/chat/completions");
  response = await fetch(fallbackEndpoint, {
    method: "POST",
    headers: {
      ...headers,
      "Accept": "application/json"
    },
    body: JSON.stringify({
      model: providerConfig.model,
      messages: [{ role: "user", content: "Reply with PONG only." }],
      temperature: 0,
      top_p: 1,
      max_tokens: 12,
      stream: false
    })
  });
  payload = await response.json().catch(() => ({}));
  if (!response.ok) throw buildProviderError(providerConfig, payload, response.status);
  const text = (((payload.choices || [])[0] || {}).message || {}).content || "";
  assertValidationText(text, PROVIDER_PRESETS[providerConfig.provider].label);
}

async function runOpenAIJson(providerConfig, systemPrompt, userContent) {
  const endpoint = normalizeBaseUrl(providerConfig.endpoint, "/responses");
  let response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${providerConfig.apiKey}`
    },
    body: JSON.stringify({
      model: providerConfig.model,
      instructions: systemPrompt,
      input: userContent,
      max_output_tokens: 4096,
      text: {
        format: { type: "json_object" }
      }
    })
  });
  let payload = await response.json().catch(() => ({}));
  if (response.ok) {
    const outputText = extractOpenAIText(payload);
    if (outputText.trim()) {
      return parseJsonText(outputText);
    }
  }

  const fallbackEndpoint = normalizeBaseUrl(providerConfig.endpoint, "/chat/completions");
  response = await fetch(fallbackEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${providerConfig.apiKey}`,
      "Accept": "application/json"
    },
    body: JSON.stringify({
      model: providerConfig.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent }
      ],
      response_format: { type: "json_object" },
      max_tokens: 4096,
      temperature: 0,
      stream: false
    })
  });
  payload = await response.json().catch(() => ({}));
  if (!response.ok) throw buildProviderError(providerConfig, payload, response.status);
  return parseJsonText(extractChatCompletionText(payload));
}

async function runAnthropicJson(providerConfig, systemPrompt, userContent) {
  const endpoint = normalizeMessageEndpoint(providerConfig.endpoint, "/v1/messages");
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": providerConfig.apiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: providerConfig.model,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: "user", content: userContent }]
    })
  });
  const payload = await response.json();
  if (!response.ok) throw buildProviderError(providerConfig, payload, response.status);
  const text = (payload.content || [])
    .filter((item) => item.type === "text" && item.text)
    .map((item) => item.text)
    .join("\n")
    .trim();
  return parseJsonText(text);
}

async function runGeminiJson(providerConfig, systemPrompt, userContent) {
  const endpoint = buildGeminiEndpoint(providerConfig);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts: [{ text: userContent }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 4096 }
    })
  });
  const payload = await response.json();
  if (!response.ok) throw buildProviderError(providerConfig, payload, response.status);
  const text = ((((payload.candidates || [])[0] || {}).content || {}).parts || [])
    .map((part) => part.text || "")
    .join("\n")
    .trim();
  return parseJsonText(text);
}

async function runNvidiaJson(providerConfig, systemPrompt, userContent) {
  const responseEndpoint = normalizeBaseUrl(providerConfig.endpoint, "/responses");
  const headers = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${providerConfig.apiKey}`
  };

  let response = await fetch(responseEndpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: providerConfig.model,
      input: `${systemPrompt}\n\n${userContent}`,
      max_output_tokens: 4096,
      top_p: 1,
      temperature: 0.2,
      stream: false
    })
  });
  let payload = await response.json().catch(() => ({}));
  if (response.ok) {
    const responseText = extractOpenAIText(payload);
    if (response.ok && responseText) {
      return parseJsonText(responseText);
    }
  }

  const fallbackEndpoint = normalizeBaseUrl(providerConfig.endpoint, "/chat/completions");
  response = await fetch(fallbackEndpoint, {
    method: "POST",
    headers: {
      ...headers,
      "Accept": "application/json"
    },
    body: JSON.stringify({
      model: providerConfig.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent }
      ],
      temperature: 0.2,
      top_p: 1,
      frequency_penalty: 0,
      presence_penalty: 0,
      max_tokens: 4096,
      stream: false,
      reasoning_effort: "medium"
    })
  });
  payload = await response.json();
  if (!response.ok) throw buildProviderError(providerConfig, payload, response.status);
  const text = (((payload.choices || [])[0] || {}).message || {}).content || "";
  return parseJsonText(text);
}

function normalizeBaseUrl(endpoint, suffix) {
  const trimmed = String(endpoint || "").replace(/\/+$/, "");
  if (trimmed.endsWith(suffix.replace(/^\//, "")) || trimmed.endsWith(suffix)) {
    return trimmed;
  }
  return `${trimmed}${suffix}`;
}

function normalizeMessageEndpoint(endpoint, defaultPath) {
  const trimmed = String(endpoint || "").trim();
  if (trimmed.endsWith("/messages")) return trimmed;
  if (/\/v1$/.test(trimmed)) return `${trimmed}/messages`;
  if (/^https?:\/\//.test(trimmed)) return trimmed;
  return `https://api.anthropic.com${defaultPath}`;
}

function buildGeminiEndpoint(providerConfig) {
  if (providerConfig.endpoint.includes(":generateContent")) {
    return providerConfig.endpoint.includes("?key=")
      ? providerConfig.endpoint
      : `${providerConfig.endpoint}?key=${encodeURIComponent(providerConfig.apiKey)}`;
  }
  const base = providerConfig.endpoint.replace(/\/+$/, "");
  return `${base}/${providerConfig.model}:generateContent?key=${encodeURIComponent(providerConfig.apiKey)}`;
}

function extractOpenAIText(payload) {
  if (typeof payload.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }
  if (!Array.isArray(payload.output)) return "";
  return payload.output
    .flatMap((item) => item.type === "message" && Array.isArray(item.content) ? item.content : [])
    .filter((item) => item.type === "output_text" && item.text)
    .map((item) => item.text)
    .join("\n")
    .trim();
}

function assertValidationText(text, providerLabel) {
  if (!String(text || "").trim()) {
    throw new Error(`${providerLabel} returned no usable validation output for the configured model.`);
  }
}

function hasSuccessfulNvidiaValidationPayload(payload) {
  if (!payload || typeof payload !== "object") return false;
  if (typeof payload.id === "string" && payload.id.trim()) return true;
  if (typeof payload.object === "string" && payload.object.trim()) return true;
  if (Array.isArray(payload.output) && payload.output.length > 0) return true;
  if (Array.isArray(payload.choices) && payload.choices.length > 0) return true;
  return false;
}

function hasSuccessfulOpenAIValidationPayload(payload) {
  if (!payload || typeof payload !== "object") return false;
  if (typeof payload.id === "string" && payload.id.trim()) return true;
  if (typeof payload.object === "string" && payload.object.trim()) return true;
  if (Array.isArray(payload.output) && payload.output.length > 0) return true;
  return false;
}

function extractChatCompletionText(payload) {
  return String(((((payload || {}).choices || [])[0] || {}).message || {}).content || "").trim();
}

function parseJsonText(text) {
  if (!text) throw new Error("Provider returned no text output.");
  const candidates = buildJsonParseCandidates(text);
  let lastError = null;
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch (error) {
      lastError = error;
    }
  }
  if (looksLikeTruncatedJson(text)) {
    throw new Error("Provider returned truncated JSON output. Try the request again or use a model with a larger output window.");
  }
  throw new Error(`Provider returned malformed JSON output. ${lastError ? lastError.message : ""}`.trim());
}

function buildJsonParseCandidates(text) {
  const cleaned = String(text || "").replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  const extracted = extractJsonObjectString(cleaned);
  const candidates = [text, cleaned];
  if (extracted && extracted !== cleaned) candidates.push(extracted);
  const newlineSafe = replaceRawNewlinesInsideStrings(extracted || cleaned);
  if (newlineSafe && !candidates.includes(newlineSafe)) candidates.push(newlineSafe);
  const trailingCommaSafe = removeTrailingCommas(newlineSafe || extracted || cleaned);
  if (trailingCommaSafe && !candidates.includes(trailingCommaSafe)) candidates.push(trailingCommaSafe);
  return candidates.filter((candidate) => typeof candidate === "string" && candidate.trim());
}

function extractJsonObjectString(text) {
  const source = String(text || "");
  const start = source.indexOf("{");
  const end = source.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return source.trim();
  return source.slice(start, end + 1).trim();
}

function replaceRawNewlinesInsideStrings(text) {
  const source = String(text || "");
  let output = "";
  let inString = false;
  let escapeNext = false;
  for (const char of source) {
    if (escapeNext) {
      output += char;
      escapeNext = false;
      continue;
    }
    if (char === "\\") {
      output += char;
      escapeNext = true;
      continue;
    }
    if (char === "\"") {
      output += char;
      inString = !inString;
      continue;
    }
    if (inString && (char === "\n" || char === "\r")) {
      output += "\\n";
      continue;
    }
    output += char;
  }
  return output;
}

function removeTrailingCommas(text) {
  return String(text || "").replace(/,\s*([}\]])/g, "$1");
}

function looksLikeTruncatedJson(text) {
  const source = String(text || "").trim();
  if (!source) return false;
  const openBraces = (source.match(/\{/g) || []).length;
  const closeBraces = (source.match(/\}/g) || []).length;
  const openBrackets = (source.match(/\[/g) || []).length;
  const closeBrackets = (source.match(/\]/g) || []).length;
  if (openBraces !== closeBraces || openBrackets !== closeBrackets) return true;
  if (/[{[,]\s*"[^"]*$/.test(source)) return true;
  if (/:\s*"[^"]*$/.test(source)) return true;
  return false;
}

function extractProviderErrorMessage(payload, status) {
  if (payload && payload.error && (payload.error.message || payload.error.status)) {
    return payload.error.message || payload.error.status;
  }
  if (payload && payload.candidates && payload.promptFeedback) {
    return JSON.stringify(payload.promptFeedback);
  }
  return `Provider request failed with status ${status}.`;
}

function buildProviderError(providerConfig, payload, status) {
  const rawMessage = extractProviderErrorMessage(payload, status);
  const normalized = normalizeProviderError(providerConfig, status, rawMessage);
  const error = new Error(normalized.message);
  Object.assign(error, normalized, { rawMessage, status });
  return error;
}

function normalizeProviderError(providerConfig, status, rawMessage) {
  const providerLabel = PROVIDER_PRESETS[providerConfig.provider]?.label || "Provider";
  const raw = String(rawMessage || "").trim();
  const lower = raw.toLowerCase();
  const retryAfterSeconds = extractRetryAfterSeconds(raw);

  if (providerConfig.provider === "openai") {
    if (status === 401 || /invalid api key|incorrect api key|authentication|unauthorized|api key not valid/i.test(raw)) {
      return {
        kind: "auth",
        provider: providerConfig.provider,
        message: `${providerLabel} could not verify this API key. Use an OpenAI Platform API key and try again.`,
        retryAfterSeconds
      };
    }

    if (status === 403 || /model.*access|does not have access|project.*not allowed|organization.*not allowed|permission denied|insufficient permissions/i.test(lower)) {
      return {
        kind: "model_access",
        provider: providerConfig.provider,
        message: `${providerLabel} accepted the key, but this account or project may not have access to the selected model. Try a model your account can use.`,
        retryAfterSeconds
      };
    }

    if (status === 429 || /quota exceeded|rate limit|billing|insufficient quota|usage limit/i.test(lower)) {
      return {
        kind: "quota",
        provider: providerConfig.provider,
        message: `${providerLabel} quota or billing limits were reached. Check usage or billing, then try again.`,
        retryAfterSeconds
      };
    }

    if (status === 404 || /not found|unknown model|does not exist|model .*not found/i.test(lower)) {
      return {
        kind: "not_found",
        provider: providerConfig.provider,
        message: `${providerLabel} could not find the configured model or endpoint. Check the model name and endpoint.`,
        retryAfterSeconds
      };
    }

    if (status === 400 || /bad request|unsupported|invalid value|invalid request|request too large|malformed/i.test(lower)) {
      return {
        kind: "bad_request",
        provider: providerConfig.provider,
        message: `${providerLabel} rejected this request for the selected model. Check the model, endpoint, or request format and try again.`,
        retryAfterSeconds
      };
    }
  }

  if (status === 401 || status === 403 || /invalid api key|unauthorized|permission denied|api key not valid|authentication/i.test(raw)) {
    return {
      kind: "auth",
      provider: providerConfig.provider,
      message: `${providerLabel} rejected the saved credentials. Update the API key and try again.`,
      retryAfterSeconds
    };
  }

  if (status === 404 || /not found|model .*not found|unsupported for generatecontent|unknown model|does not exist/i.test(raw)) {
    return {
      kind: "not_found",
      provider: providerConfig.provider,
      message: `${providerLabel} could not find the configured model or endpoint. Check the model name and endpoint.`,
      retryAfterSeconds
    };
  }

  if (status === 429 || /quota exceeded|rate limit|too many requests|resource exhausted|retry in [\d.]+s|free_tier_requests/i.test(lower)) {
    return {
      kind: "quota",
      provider: providerConfig.provider,
      message: `${providerLabel} quota exceeded. Monitoring may be incomplete until your quota resets.`,
      retryAfterSeconds
    };
  }

  if (status === 400 || /invalid argument|bad request|malformed|unsupported|request too large|prompt blocked|malformed json/i.test(lower)) {
    return {
      kind: "bad_request",
      provider: providerConfig.provider,
      message: `${providerLabel} rejected the request for the configured model. Check the model, endpoint, or request size and try again.`,
      retryAfterSeconds
    };
  }

  return {
    kind: "provider_unavailable",
    provider: providerConfig.provider,
    message: `${providerLabel} is temporarily unavailable. Try again in a moment.`,
    retryAfterSeconds
  };
}

function normalizeOperationalError(error, context = {}) {
  if (error && typeof error === "object" && error.kind && error.message) {
    return error;
  }
  const providerConfig = context.providerConfig || { provider: "unknown" };
  const rawMessage = String(error?.rawMessage || error?.message || "Operation failed.").trim();
  if (/duckduckgo search failed|tavily search failed|search failed/i.test(rawMessage.toLowerCase())) {
    return {
      kind: "search_unavailable",
      provider: "search",
      message: "Live web search is temporarily unavailable for this agent. Results may be incomplete.",
      rawMessage
    };
  }
  if (/provider returned truncated json output|provider returned malformed json output|provider returned no text output/i.test(rawMessage.toLowerCase())) {
    return {
      kind: "provider_unavailable",
      provider: providerConfig.provider,
      message: `${PROVIDER_PRESETS[providerConfig.provider]?.label || "Provider"} returned an incomplete response. Try the monitoring run again.`,
      rawMessage
    };
  }
  return {
    kind: error?.kind || "provider_unavailable",
    provider: error?.provider || providerConfig.provider,
    message: error?.message || rawMessage || "Operation failed.",
    rawMessage: error?.rawMessage || rawMessage,
    retryAfterSeconds: error?.retryAfterSeconds
  };
}

function extractRetryAfterSeconds(rawMessage) {
  const match = String(rawMessage || "").match(/retry in ([\d.]+)s/i);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? Math.max(1, Math.round(value)) : null;
}

function serializePulseBoardError(error) {
  if (!error) return { kind: "unknown", provider: "unknown", message: "Operation failed." };
  return {
    kind: error.kind || "unknown",
    provider: error.provider || "unknown",
    message: error.message || "Operation failed.",
    ...(Number.isFinite(error.retryAfterSeconds) ? { retryAfterSeconds: error.retryAfterSeconds } : {})
  };
}

function logNormalizedError(error, scope) {
  const rawDetail = error?.rawMessage ? ` raw="${error.rawMessage}"` : "";
  console.warn(`[PulseBoard][${scope}] ${error?.provider || "unknown"} ${error?.kind || "unknown"}: ${error?.message || "Unknown error."}${rawDetail}`);
}

function buildMonitoringDegradedWarning(byAgent, successCount) {
  const failures = Object.values(byAgent || {}).filter((entry) => entry && entry.error);
  if (!failures.length || successCount < 3) return null;
  const quotaFailures = failures.filter((entry) => entry.kind === "quota").length;
  const searchFailures = failures.filter((entry) => entry.kind === "search_unavailable").length;
  if (quotaFailures > 0) {
    return {
      kind: "quota",
      provider: failures.find((entry) => entry.kind === "quota")?.provider || "unknown",
      message: "Some monitoring agents hit provider limits, so this brief may be missing a few live signals."
    };
  }
  if (searchFailures > 0) {
    return {
      kind: "search_unavailable",
      provider: "search",
      message: "Some live search lookups failed, so this brief may be based on partial evidence."
    };
  }
  return null;
}

function buildInsufficientEvidenceError(byAgent, successCount) {
  const failures = Object.values(byAgent || {}).filter((entry) => entry && entry.error);
  const quotaFailure = failures.find((entry) => entry.kind === "quota");
  if (quotaFailure) {
    return {
      kind: "quota",
      provider: quotaFailure.provider,
      message: "PulseBoard gathered too little evidence because several agents hit provider limits. Try again after your quota resets."
    };
  }
  const searchFailure = failures.find((entry) => entry.kind === "search_unavailable");
  if (searchFailure) {
    return {
      kind: "search_unavailable",
      provider: "search",
      message: "PulseBoard could not gather enough live search evidence to finish this monitoring run."
    };
  }
  return {
    kind: "insufficient_evidence",
    provider: "pulseboard",
    message: successCount > 0
      ? "PulseBoard gathered too little usable evidence to synthesize a reliable brief."
      : "PulseBoard could not gather usable monitoring evidence for this run."
  };
}

function stripHtml(value) {
  return decodeHtml(String(value || "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

module.exports = {
  server,
  handlePulseBoardRequest,
  runPulseBoardSession,
  runScenarioFollowup,
  analyzeCsvSession,
  compareCsvSession,
  crossReferenceSession,
  normalizeConnection,
  validateConnection
};
