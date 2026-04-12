const fs = require("fs");
const assert = require("assert");

const html = fs.readFileSync("C:/Users/kim16/Videos/Pulseboard/index.html", "utf8");
const server = fs.existsSync("C:/Users/kim16/Videos/Pulseboard/server.js")
  ? fs.readFileSync("C:/Users/kim16/Videos/Pulseboard/server.js", "utf8")
  : "";
const vercelConfig = fs.existsSync("C:/Users/kim16/Videos/Pulseboard/vercel.json")
  ? fs.readFileSync("C:/Users/kim16/Videos/Pulseboard/vercel.json", "utf8")
  : "";

function expectIn(text, pattern, description) {
  assert.match(text, pattern, description);
}

expectIn(server, /createServer|http\.createServer/, "expected a Node HTTP relay server");
expectIn(server, /requestUrl\.pathname\.startsWith\("\/scripts\/"\).*endsWith\("\.js"\)/s, "expected relay to serve extracted frontend script files");
expectIn(server, /\/api\/pulseboard\/run/, "expected relay run endpoint");
expectIn(server, /\/api\/pulseboard\/validate-connection/, "expected relay validation endpoint");
expectIn(server, /function runPulseBoardSession\(/, "expected runPulseBoardSession in relay");
expectIn(server, /function searchTopicSignals\(/, "expected shared search pipeline in relay");
expectIn(server, /function runMonitoringAgent\(/, "expected per-agent runner in relay");
expectIn(server, /function runAggregator\(/, "expected aggregator runner in relay");
expectIn(server, /function runOpenAIJson\(/, "expected OpenAI adapter");
expectIn(server, /function runAnthropicJson\(/, "expected Anthropic adapter");
expectIn(server, /function runGeminiJson\(/, "expected Gemini adapter");
expectIn(server, /function runNvidiaJson\(/, "expected NVIDIA adapter");
expectIn(server, /const responseText = extractOpenAIText\(payload\)/, "expected NVIDIA responses path to inspect extracted text before parsing");
expectIn(server, /if \(response\.ok && responseText\)/, "expected NVIDIA adapter to fall back when responses payload has no text");
expectIn(server, /function runValidationProbe\(/, "expected provider validation probe dispatcher");
expectIn(server, /function runOpenAIValidationProbe\(/, "expected OpenAI validation probe");
expectIn(server, /function runAnthropicValidationProbe\(/, "expected Anthropic validation probe");
expectIn(server, /function runGeminiValidationProbe\(/, "expected Gemini validation probe");
expectIn(server, /function runNvidiaValidationProbe\(/, "expected NVIDIA validation probe");
expectIn(server, /validated using the configured model/i, "expected provider-specific validation success messaging");
expectIn(server, /returned no usable validation output/i, "expected validation to check for any usable provider output instead of an exact token");
expectIn(server, /function hasSuccessfulNvidiaValidationPayload\(/, "expected NVIDIA-specific validation payload fallback");
expectIn(server, /function findAnomalyCandidates\(/, "expected anomaly candidate computation in relay");
expectIn(server, /function isTransactionalDataset\(/, "expected transactional dataset guard for revenue-per-unit anomalies");
expectIn(server, /function deduplicateCandidatesByRow\(/, "expected candidate deduplication in relay");
expectIn(server, /function formatCandidatesForAgent\(/, "expected anomaly candidate formatter in relay");
expectIn(server, /File A anomaly candidates:|Pre-computed anomaly candidates:/, "expected anomaly candidate text appended to model input");
expectIn(server, /if \(zScore > 4\)/, "expected raised anomaly threshold in relay");
expectIn(server, /Revenue per unit.*less than 1% of average/i, "expected business-logic revenue anomaly detection");
expectIn(server, /refund|refunded|return|returned|cancel|cancelled|canceled/i, "expected refund\/return skip logic for revenue-per-unit anomalies");
expectIn(server, /function buildCompactComparisonSummary\(/, "expected compact comparison summary helper for retry");
expectIn(server, /Return very concise JSON/i, "expected compact retry instruction for truncated comparison responses");
expectIn(server, /Provider returned truncated JSON output\./, "expected truncated JSON detection to support retry logic");
expectIn(server, /const MODE_LABELS = \{[\s\S]*interviewprep:\s*"Interview Prep"/, "expected interview prep mode label in relay");
expectIn(server, /const MODE_MODIFIERS = \{[\s\S]*interviewprep:/, "expected interview prep mode modifier in relay");
expectIn(server, /careersPage.*jobLinks/s, "expected jobs agent prompt to request careers and job posting links");
expectIn(server, /official company careers\/jobs page|up to 3 direct live job-posting links/i, "expected jobs prompt guidance for optional hiring links");
expectIn(server, /signalStrength must be an integer from 0 to 100/i, "expected news prompt to require a real signal-strength score");
expectIn(server, /role:\s*String\(body\.role \|\| ""\)\.trim\(\)/, "expected run endpoint to parse optional interview role");
expectIn(server, /if \(input\.mode === "interviewprep" && !input\.role\)/, "expected interview prep mode to require a role");
expectIn(server, /function getMonitoringAgentSpecs\(mode\)\s*\{[\s\S]*INTERVIEW_PREP_AGENT_SPECS[\s\S]*AGENT_SPECS/, "expected relay to switch agent specs by mode");
expectIn(server, /INTERVIEW_PREP_AGENT_SPECS/, "expected dedicated interview prep agent specs");
expectIn(server, /INTERVIEW_PREP_AGGREGATOR_PROMPT/, "expected dedicated interview prep synthesis prompt");
expectIn(server, /reportedRoundCount.*confidenceLabel.*roadmapSummary.*prepPlan.*keyWarnings.*sourceNotes/s, "expected interview prep synthesis contract");
expectIn(server, /Target role: "\$\{options\.role\}"/, "expected per-agent user content to include target role context");
expectIn(server, /Target role: "\$\{role\}"/, "expected aggregator user content to include target role context");
expectIn(server, /agentSpec\.searchQuery\(topic, mode, role\)/, "expected role-aware search queries for interview prep");
expectIn(server, /async function handlePulseBoardRequest\(/, "expected shared relay request handler for local server and Vercel routes");
expectIn(server, /if \(require\.main === module\)/, "expected local server startup to be gated for module reuse");
expectIn(server, /module\.exports = \{[\s\S]*handlePulseBoardRequest/, "expected relay exports for Vercel API wrappers");

expectIn(html, /runPulseBoardViaRelay\(/, "expected frontend relay execution helper");
expectIn(html, /fetch\(["'`]\/api\/pulseboard\/run["'`]/, "expected frontend to call relay run endpoint");
expectIn(html, /fetch\(["'`]\/api\/pulseboard\/validate-connection["'`]/, "expected frontend to call relay validation endpoint");
expectIn(html, /supportsWebSearch[\s\S]{0,120}true[\s\S]{0,120}false/, "expected provider metadata to remain present");
expectIn(html, /body:\s*JSON\.stringify\(\{\s*connection,\s*topic,\s*mode,\s*role\s*\}\)/, "expected frontend to send role with monitoring runs");
expectIn(vercelConfig, /"source": "\/query", "destination": "\/index\.html"/, "expected Vercel rewrite for query route");
expectIn(vercelConfig, /"source": "\/csv", "destination": "\/index\.html"/, "expected Vercel rewrite for csv route");
expectIn(vercelConfig, /"source": "\/api-key", "destination": "\/index\.html"/, "expected Vercel rewrite for api-key route");
assert.ok(fs.existsSync("C:/Users/kim16/Videos/Pulseboard/api/pulseboard/run.js"), "expected Vercel API route for monitoring runs");
assert.ok(fs.existsSync("C:/Users/kim16/Videos/Pulseboard/api/pulseboard/validate-connection.js"), "expected Vercel API route for provider validation");
assert.ok(fs.existsSync("C:/Users/kim16/Videos/Pulseboard/api/pulseboard/analyze-csv.js"), "expected Vercel API route for CSV analysis");
assert.ok(fs.existsSync("C:/Users/kim16/Videos/Pulseboard/api/pulseboard/compare-csv.js"), "expected Vercel API route for CSV comparison");
assert.ok(fs.existsSync("C:/Users/kim16/Videos/Pulseboard/api/pulseboard/cross-reference.js"), "expected Vercel API route for cross-reference");

console.log("PulseBoard relay assertions passed.");
