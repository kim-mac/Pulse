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
    if (req.method === "POST" && requestUrl.pathname === "/api/pulseboard/validate-connection") {
      const body = await readJson(req);
      const connection = normalizeConnection(body.connection);
      const validation = await validateConnection(connection);
      return sendJson(res, validation.ok ? 200 : 400, validation);
    }
    if (req.method === "POST" && requestUrl.pathname === "/api/pulseboard/run") {
      const body = await readJson(req);
      const connection = normalizeConnection(body.connection);
      const input = {
        connection,
        topic: String(body.topic || "").trim(),
        mode: String(body.mode || "general").trim(),
        role: String(body.role || "").trim()
      };
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
      await runPulseBoardSession(input, (event) => {
        res.write(`${JSON.stringify(event)}\n`);
      });
      res.end();
      return;
    }
    if (req.method === "POST" && requestUrl.pathname === "/api/pulseboard/analyze-csv") {
      const body = await readJson(req);
      const connection = normalizeConnection(body.connection);
      const csvText = String(body.csvText || "");
      const analysisGoal = String(body.analysisGoal || "").trim();
      const qualityReport = body.qualityReport && typeof body.qualityReport === "object" ? body.qualityReport : null;
      const schemaSummary = String(body.schemaSummary || "").trim();
      const correlationSummary = String(body.correlationSummary || "").trim();
      const segmentSummary = String(body.segmentSummary || "").trim();
      const cleaningSummary = body.cleaningSummary && typeof body.cleaningSummary === "object" ? body.cleaningSummary : null;
      const transformationLogSummary = Array.isArray(body.transformationLogSummary) ? body.transformationLogSummary : [];
      if (!csvText.trim()) {
        return sendJson(res, 400, { error: { message: "CSV text is required." } });
      }
      const result = await analyzeCsvSession({ connection, csvText, analysisGoal, qualityReport, schemaSummary, correlationSummary, segmentSummary, cleaningSummary, transformationLogSummary });
      return sendJson(res, 200, { result });
    }
    if (req.method === "POST" && requestUrl.pathname === "/api/pulseboard/compare-csv") {
      const body = await readJson(req);
      const connection = normalizeConnection(body.connection);
      const csvTextA = String(body.csvTextA || "");
      const csvTextB = String(body.csvTextB || "");
      const labelA = String(body.labelA || "File A").trim() || "File A";
      const labelB = String(body.labelB || "File B").trim() || "File B";
      const analysisGoal = String(body.analysisGoal || "").trim();
      const qualityReportA = body.qualityReportA && typeof body.qualityReportA === "object" ? body.qualityReportA : null;
      const qualityReportB = body.qualityReportB && typeof body.qualityReportB === "object" ? body.qualityReportB : null;
      if (!csvTextA.trim()) {
        return sendJson(res, 400, { error: { message: "CSV text is required for File A." } });
      }
      if (!csvTextB.trim()) {
        return sendJson(res, 400, { error: { message: "CSV text is required for File B." } });
      }
      const result = await compareCsvSession({ connection, csvTextA, csvTextB, labelA, labelB, analysisGoal, qualityReportA, qualityReportB });
      return sendJson(res, 200, { result });
    }
    if (req.method === "POST" && requestUrl.pathname === "/api/pulseboard/cross-reference") {
      const body = await readJson(req);
      const connection = normalizeConnection(body.connection);
      const topic = String(body.topic || "").trim();
      const csvContext = String(body.csvContext || "").trim();
      const csvResults = body.csvResults && typeof body.csvResults === "object" ? body.csvResults : {};
      if (!topic) {
        return sendJson(res, 400, { error: { message: "Cross-reference topic is required." } });
      }
      res.writeHead(200, {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "Access-Control-Allow-Origin": "*"
      });
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

async function validateConnection(connection) {
  if (!connection.apiKey) {
    return { ok: false, message: "API key is required." };
  }
  if (!/^https?:\/\//i.test(connection.endpoint)) {
    return { ok: false, message: "Endpoint must start with http:// or https://." };
  }

  try {
    await runValidationProbe(connection);
    return {
      ok: true,
      message: `${PROVIDER_PRESETS[connection.provider].label} validated using the configured model ${connection.model}.`
    };
  } catch (error) {
    const normalizedError = normalizeOperationalError(error, {
      providerConfig: connection,
      phase: "validation"
    });
    logNormalizedError(normalizedError, "validation");
    return {
      ok: false,
      message: normalizedError.message || "Provider validation failed.",
      error: serializePulseBoardError(normalizedError)
    };
  }
}

async function runValidationProbe(providerConfig) {
  switch (providerConfig.provider) {
    case "openai":
      return runOpenAIValidationProbe(providerConfig);
    case "anthropic":
      return runAnthropicValidationProbe(providerConfig);
    case "gemini":
      return runGeminiValidationProbe(providerConfig);
    case "nvidia":
      return runNvidiaValidationProbe(providerConfig);
    default:
      throw new Error("Unsupported provider.");
  }
}

async function runPulseBoardSession(input, emit) {
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
    emit({ type: "done" });
    return;
  }

  emit({ type: "aggregator_started" });
  try {
    const brief = await runAggregator(input.connection, input.topic, input.mode, byAgent, input.role);
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
  emit({ type: "done" });
}

function getMonitoringAgentSpecs(mode) {
  return mode === "interviewprep" ? INTERVIEW_PREP_AGENT_SPECS : AGENT_SPECS;
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
    evidence
  ].join("\n");

  return runModelJson({
    providerConfig,
    systemPrompt: agentSpec.systemPrompt,
    userContent
  });
}

async function runAggregator(providerConfig, topic, mode, byAgent, role = "") {
  const userContent = [
    `Topic to monitor: "${topic}"`,
    `Monitoring mode: ${MODE_LABELS[mode]}`,
    role ? `Target role: "${role}"` : "",
    `Focus instruction: ${MODE_MODIFIERS[mode]}`,
    "",
    `News: ${JSON.stringify(byAgent.news)}`,
    `Jobs: ${JSON.stringify(byAgent.jobs)}`,
    `Sentiment: ${JSON.stringify(byAgent.sentiment)}`,
    `Regulatory: ${JSON.stringify(byAgent.regulatory)}`,
    `Competitor: ${JSON.stringify(byAgent.competitor)}`
  ].join("\n");

  return runModelJson({
    providerConfig,
    systemPrompt: mode === "interviewprep" ? INTERVIEW_PREP_AGGREGATOR_PROMPT : AGGREGATOR_PROMPT,
    userContent
  });
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
  emit({ type: "done" });
}

async function searchTopicSignals(topic, mode, agentSpec, role = "") {
  const query = agentSpec.searchQuery(topic, mode, role);
  if (process.env.TAVILY_API_KEY) {
    try {
      return await searchWithTavily(query);
    } catch (error) {
      console.warn("Tavily search failed, falling back to DuckDuckGo:", error.message);
    }
  }
  return searchWithDuckDuckGo(query);
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
  return results.slice(0, 5).map((item, index) => {
    return `${index + 1}. ${item.title || "Untitled"}\nURL: ${item.url || ""}\nSummary: ${item.content || ""}`;
  }).join("\n\n");
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
  return results.map((item, index) => {
    return `${index + 1}. ${item.title}\nURL: ${item.url}\nSummary: ${item.snippet}`;
  }).join("\n\n");
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
  switch (providerConfig.provider) {
    case "openai":
      return runOpenAIJson(providerConfig, systemPrompt, userContent);
    case "anthropic":
      return runAnthropicJson(providerConfig, systemPrompt, userContent);
    case "gemini":
      return runGeminiJson(providerConfig, systemPrompt, userContent);
    case "nvidia":
      return runNvidiaJson(providerConfig, systemPrompt, userContent);
    default:
      throw new Error("Unsupported provider.");
  }
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
  analyzeCsvSession,
  compareCsvSession,
  crossReferenceSession,
  normalizeConnection,
  validateConnection
};
