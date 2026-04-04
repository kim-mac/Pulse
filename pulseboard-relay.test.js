const fs = require("fs");
const assert = require("assert");

const html = fs.readFileSync("C:/Users/kim16/Videos/Pulseboard/index.html", "utf8");
const server = fs.existsSync("C:/Users/kim16/Videos/Pulseboard/server.js")
  ? fs.readFileSync("C:/Users/kim16/Videos/Pulseboard/server.js", "utf8")
  : "";

function expectIn(text, pattern, description) {
  assert.match(text, pattern, description);
}

expectIn(server, /createServer|http\.createServer/, "expected a Node HTTP relay server");
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
expectIn(server, /function runValidationProbe\(/, "expected provider validation probe dispatcher");
expectIn(server, /function runOpenAIValidationProbe\(/, "expected OpenAI validation probe");
expectIn(server, /function runAnthropicValidationProbe\(/, "expected Anthropic validation probe");
expectIn(server, /function runGeminiValidationProbe\(/, "expected Gemini validation probe");
expectIn(server, /function runNvidiaValidationProbe\(/, "expected NVIDIA validation probe");
expectIn(server, /validated using the configured model/i, "expected provider-specific validation success messaging");
expectIn(server, /returned no usable validation output/i, "expected validation to check for any usable provider output instead of an exact token");
expectIn(server, /function hasSuccessfulNvidiaValidationPayload\(/, "expected NVIDIA-specific validation payload fallback");

expectIn(html, /runPulseBoardViaRelay\(/, "expected frontend relay execution helper");
expectIn(html, /fetch\(["'`]\/api\/pulseboard\/run["'`]/, "expected frontend to call relay run endpoint");
expectIn(html, /fetch\(["'`]\/api\/pulseboard\/validate-connection["'`]/, "expected frontend to call relay validation endpoint");
expectIn(html, /supportsWebSearch[\s\S]{0,120}true[\s\S]{0,120}false/, "expected provider metadata to remain present");

console.log("PulseBoard relay assertions passed.");
