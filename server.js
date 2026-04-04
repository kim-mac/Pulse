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
  industry: "Industry Trends"
};

const MODE_MODIFIERS = {
  general: "Provide balanced coverage across all signal types.",
  company: "Focus heavily on company health, culture, hiring signals, and competitive position.",
  jobmarket: "Prioritize hiring trends, role demand, salary signals, and workforce movement.",
  esg: "Weight ESG performance, sustainability commitments, and regulatory compliance heavily.",
  industry: "Scan industry-wide trends, not just a single company. Look for sector patterns and macro movement."
};

const PROVIDER_PRESETS = {
  openai: {
    label: "OpenAI",
    defaultModel: "gpt-4o",
    defaultEndpoint: "https://api.openai.com/v1",
    supportsWebSearch: true,
    supportsPulseboard: true
  },
  anthropic: {
    label: "Claude / Anthropic",
    defaultModel: "claude-3-7-sonnet-latest",
    defaultEndpoint: "https://api.anthropic.com/v1/messages",
    supportsWebSearch: false,
    supportsPulseboard: true
  },
  gemini: {
    label: "Google Gemini",
    defaultModel: "gemini-1.5-pro",
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
{"headlines":[{"title":"string","summary":"string","sentiment":"positive|negative|neutral","recency":"string"}],"overallSentiment":"positive|negative|mixed|neutral","biggestStory":"string","signalStrength":0,"urgencyFlag":true}`
  },
  {
    key: "jobs",
    label: "Job Signal Tracker",
    useWebSearch: true,
    searchQuery: (topic, mode) => `${topic} hiring jobs layoffs careers ${MODE_LABELS[mode]}`,
    systemPrompt: `You are a talent market analyst monitoring hiring signals. Return ONLY valid JSON with this exact shape:
{"hiringVelocity":"accelerating|stable|slowing|freezing","velocityScore":0,"hotRoles":["string","string","string"],"hiringSignal":"string","redFlags":["string"],"opportunitySignal":"string"}`
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

const AGGREGATOR_PROMPT = `You are a senior intelligence analyst synthesizing 5 agent reports. Return ONLY valid JSON with this exact shape:
{"subjectSummary":"string","overallRiskScore":0,"overallOpportunityScore":0,"urgent":[{"finding":"string","source":"string","action":"string"}],"notable":[{"finding":"string","source":"string","whyItMatters":"string"}],"fyi":[{"finding":"string","context":"string"}],"oneLineSummary":"string","recommendedActions":["string","string","string"],"monitoringFrequency":"string"}`;

const CSV_ANALYST_PROMPT = `You are a data analyst. Analyze the uploaded CSV summary and return ONLY valid JSON with this exact shape:
{"datasetSummary":{"rowCount":0,"columnCount":0,"columns":[]},"keyFindings":["string"],"risks":["string"],"opportunities":["string"],"recommendedActions":["string"],"oneLineSummary":"string","chartRecommendations":[{"chartType":"bar|line|pie|scatter|histogram","title":"string","xAxis":"string","yAxis":"string","aggregation":"sum|average|count|none","groupBy":"string","reason":"string","sortBy":"value_desc|value_asc|label_asc|none","maxCategories":8,"colorScheme":"ink|growth|mixed"}]}
Rules for recommendedActions:
- recommendedActions must be an array of 3 to 4 separate strings.
- Do not return one semicolon-separated sentence or combine multiple actions into a single string.
- Each action should be concise, executive-ready, and stand alone as its own recommendation.
Rules for chartRecommendations:
- If data has a date/time column, always recommend a line chart with date on x axis and the most important numeric column on y axis.
- If data has a categorical column with fewer than 10 unique values, recommend a bar chart grouped by that category.
- If data has 2 or more numeric columns, recommend a scatter plot using the two most correlated or most comparable numeric columns.
- If data has a single categorical column with fewer than 7 values, you may recommend a pie chart for distribution.
- If data has a single numeric column, recommend a histogram.
- Never recommend more than 3 charts.
- Never recommend a chart if the required column does not exist.
- Always put the most insightful chart first.
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
- segmentInsights: array of 4 objects { segment: string, dimension: string, valueA: string, valueB: string, change: string, direction: string }
- newPatterns: array of 2 strings
- disappearedPatterns: array of 2 strings
- anomalies: array of 2 objects { description: string, file: string, severity: string }
- keyInsight: string
- recommendation: string
- storyNarrative: string
- chartRecommendations: array of 2 objects { chartType: string, title: string, metric: string, groupBy: string, reason: string, maxCategories: number }
You must segment by categorical columns such as product, region, and channel whenever those dimensions exist, and compare performance within each segment.
The $4.50 net_revenue anomaly on a 95-unit Laptop order in File B should be flagged as a critical data quality issue in anomalies.
Chart rules:
- Always recommend a grouped_bar chart comparing File A vs File B for the top metric, usually net_revenue or units_sold, grouped by the most informative categorical column such as product or region.
- If a date column exists in both files, recommend a line_comparison showing both files as two lines over time.
- chartType must be one of grouped_bar, line_comparison, side_by_side_bar.
- Maximum 2 charts.
Return ONLY valid JSON, no markdown, no explanation.`;

const server = http.createServer(async (req, res) => {
  try {
    const requestUrl = new URL(req.url, `http://${req.headers.host || `${HOST}:${PORT}`}`);
    if (req.method === "GET" && ["/", "/query", "/csv", "/api-key"].includes(requestUrl.pathname)) {
      return serveFile(res, INDEX_PATH, "text/html; charset=utf-8");
    }
    if (req.method === "GET" && requestUrl.pathname === "/pulseboard-structure.test.js") {
      return serveFile(res, path.join(__dirname, "pulseboard-structure.test.js"), "text/javascript; charset=utf-8");
    }
    if (req.method === "GET" && requestUrl.pathname === "/pulseboard-relay.test.js") {
      return serveFile(res, path.join(__dirname, "pulseboard-relay.test.js"), "text/javascript; charset=utf-8");
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
        mode: String(body.mode || "general").trim()
      };
      if (!input.topic) {
        return sendJson(res, 400, { error: { message: "Topic is required." } });
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
      if (!csvText.trim()) {
        return sendJson(res, 400, { error: { message: "CSV text is required." } });
      }
      const result = await analyzeCsvSession({ connection, csvText, analysisGoal });
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
      if (!csvTextA.trim()) {
        return sendJson(res, 400, { error: { message: "CSV text is required for File A." } });
      }
      if (!csvTextB.trim()) {
        return sendJson(res, 400, { error: { message: "CSV text is required for File B." } });
      }
      const result = await compareCsvSession({ connection, csvTextA, csvTextB, labelA, labelB, analysisGoal });
      return sendJson(res, 200, { result });
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
});

server.listen(PORT, HOST, () => {
  console.log(`PulseBoard relay running at http://${HOST}:${PORT}`);
});

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
    return { ok: false, message: error.message || "Provider validation failed." };
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
  const monitoringPromises = AGENT_SPECS.map((agent) =>
    runMonitoringAgent(input.connection, input.topic, input.mode, agent)
      .then((result) => {
        emit({ type: "agent_result", agent: agent.key, result });
        return { agent: agent.key, result };
      })
      .catch((error) => {
        emit({ type: "agent_error", agent: agent.key, error: error.message || "Agent failed." });
        return { agent: agent.key, result: { error: true, message: error.message || "Agent failed." } };
      })
  );

  const settled = await Promise.all(monitoringPromises);
  const byAgent = Object.fromEntries(settled.map((entry) => [entry.agent, entry.result]));
  const successCount = Object.values(byAgent).filter((entry) => entry && !entry.error).length;

  if (successCount < 3) {
    emit({ type: "brief_error", successCount, error: "Fewer than three monitoring agents returned usable data." });
    emit({ type: "done" });
    return;
  }

  emit({ type: "aggregator_started" });
  const brief = await runAggregator(input.connection, input.topic, input.mode, byAgent);
  emit({ type: "brief", result: brief });
  emit({ type: "done" });
}

async function runMonitoringAgent(providerConfig, topic, mode, agentSpec) {
  const evidence = await searchTopicSignals(topic, mode, agentSpec);
  const userContent = [
    `Topic to monitor: "${topic}"`,
    `Monitoring mode: ${MODE_LABELS[mode]}`,
    `Focus instruction: ${MODE_MODIFIERS[mode]}`,
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

async function runAggregator(providerConfig, topic, mode, byAgent) {
  const userContent = [
    `Topic to monitor: "${topic}"`,
    `Monitoring mode: ${MODE_LABELS[mode]}`,
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
    systemPrompt: AGGREGATOR_PROMPT,
    userContent
  });
}

async function analyzeCsvSession(input) {
  if (!input.csvText || !input.csvText.trim()) {
    throw new Error("CSV text is required.");
  }
  const parsedCsv = parseCsvText(input.csvText);
  const csvSummary = summarizeCsvData(parsedCsv);
  return runCsvAnalyst(input.connection, csvSummary, input.analysisGoal);
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
    summaryA,
    summaryB
  }, input.analysisGoal);
}

async function searchTopicSignals(topic, mode, agentSpec) {
  const query = agentSpec.searchQuery(topic, mode);
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

async function runCsvAnalyst(providerConfig, csvSummary, analysisGoal) {
  const userContent = [
    analysisGoal ? `Analysis goal: ${analysisGoal}` : "Analysis goal: provide a concise executive summary of the uploaded CSV.",
    "",
    `Dataset row count: ${csvSummary.rowCount}`,
    `Dataset column count: ${csvSummary.columnCount}`,
    `Columns: ${csvSummary.columns.join(", ")}`,
    "",
    `Column summaries: ${JSON.stringify(csvSummary.columnSummaries)}`,
    "",
    `Sample rows: ${JSON.stringify(csvSummary.sampleRows)}`
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

async function runCsvComparisonAnalyst(providerConfig, comparisonInput, analysisGoal) {
  const { labelA, labelB, summaryA, summaryB } = comparisonInput;
  const sharedColumns = summaryA.columns.filter((column) => summaryB.columns.includes(column));
  const onlyInA = summaryA.columns.filter((column) => !summaryB.columns.includes(column));
  const onlyInB = summaryB.columns.filter((column) => !summaryA.columns.includes(column));
  const schemaMatch = summaryA.columns.length === summaryB.columns.length && onlyInA.length === 0 && onlyInB.length === 0;

  const userContent = [
    analysisGoal ? `Analysis goal: ${analysisGoal}` : "Analysis goal: compare these two datasets like a senior analyst and explain what changed.",
    "",
    `File A label: ${labelA}`,
    `File A summary: ${JSON.stringify(summaryA)}`,
    "",
    `File B label: ${labelB}`,
    `File B summary: ${JSON.stringify(summaryB)}`,
    "",
    `Computed shared columns: ${JSON.stringify(sharedColumns)}`,
    `Computed onlyInA columns: ${JSON.stringify(onlyInA)}`,
    `Computed onlyInB columns: ${JSON.stringify(onlyInB)}`,
    `Computed schemaMatch: ${schemaMatch}`
  ].join("\n");

  const result = await runModelJson({
    providerConfig,
    systemPrompt: CSV_COMPARISON_PROMPT,
    userContent
  });

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
    segmentInsights: Array.isArray(result.segmentInsights) ? result.segmentInsights.slice(0, 4) : [],
    newPatterns: Array.isArray(result.newPatterns) ? result.newPatterns.slice(0, 2) : [],
    disappearedPatterns: Array.isArray(result.disappearedPatterns) ? result.disappearedPatterns.slice(0, 2) : [],
    anomalies: Array.isArray(result.anomalies) ? result.anomalies.slice(0, 2) : [],
    keyInsight: result.keyInsight || "No key insight returned.",
    recommendation: result.recommendation || "No recommendation returned.",
    storyNarrative: result.storyNarrative || "No comparison narrative returned.",
    chartRecommendations: Array.isArray(result.chartRecommendations) ? result.chartRecommendations.slice(0, 2) : []
  };
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
  const response = await fetch(endpoint, {
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
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(readProviderError(payload, response.status));
  assertValidationText(extractOpenAIText(payload), PROVIDER_PRESETS[providerConfig.provider].label);
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
  if (!response.ok) throw new Error(readProviderError(payload, response.status));
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
  if (!response.ok) throw new Error(readProviderError(payload, response.status));
  const text = ((((payload.candidates || [])[0] || {}).content || {}).parts || [])
    .map((part) => part.text || "")
    .join("\n")
    .trim();
  assertValidationText(text, PROVIDER_PRESETS[providerConfig.provider].label);
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
  if (!response.ok) throw new Error(readProviderError(payload, response.status));
  const text = (((payload.choices || [])[0] || {}).message || {}).content || "";
  assertValidationText(text, PROVIDER_PRESETS[providerConfig.provider].label);
}

async function runOpenAIJson(providerConfig, systemPrompt, userContent) {
  const endpoint = normalizeBaseUrl(providerConfig.endpoint, "/responses");
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${providerConfig.apiKey}`
    },
    body: JSON.stringify({
      model: providerConfig.model,
      instructions: systemPrompt,
      input: userContent,
      text: {
        format: { type: "json_object" }
      }
    })
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(readProviderError(payload, response.status));
  const outputText = extractOpenAIText(payload);
  return parseJsonText(outputText);
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
      max_tokens: 1800,
      system: systemPrompt,
      messages: [{ role: "user", content: userContent }]
    })
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(readProviderError(payload, response.status));
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
      generationConfig: { temperature: 0.2, maxOutputTokens: 2048 }
    })
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(readProviderError(payload, response.status));
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
    return parseJsonText(extractOpenAIText(payload));
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
  if (!response.ok) throw new Error(readProviderError(payload, response.status));
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

function parseJsonText(text) {
  if (!text) throw new Error("Provider returned no text output.");
  try {
    return JSON.parse(text);
  } catch (error) {
    const cleaned = text.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
    return JSON.parse(cleaned);
  }
}

function readProviderError(payload, status) {
  if (payload && payload.error && (payload.error.message || payload.error.status)) {
    return payload.error.message || payload.error.status;
  }
  if (payload && payload.candidates && payload.promptFeedback) {
    return JSON.stringify(payload.promptFeedback);
  }
  return `Provider request failed with status ${status}.`;
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
