const fs = require("fs");
const assert = require("assert");

const html = fs.readFileSync("C:/Users/kim16/Videos/Pulseboard/index.html", "utf8");

function expect(pattern, description) {
  assert.match(html, pattern, description);
}

expect(/id="apiKeyPage"/, "expected a dedicated API key page");
expect(/id="connectionForm"/, "expected a dedicated connection form");
expect(/id="providerSelect"/, "expected a provider select field");
expect(/id="homePage"/, "expected a dedicated home page section");
expect(/id="homeExplanation"/, "expected a dedicated home explanation section");
expect(/5 agents fire simultaneously/i, "expected home explainer content below the hero");
expect(/Built for use cases at/i, "expected sponsor chip row on the home page");
expect(/function syncHomeExplanationState\(/, "expected a home explanation collapse helper");
expect(/transition:\s*max-height\s+0\.35s\s+ease/i, "expected smooth home explanation collapse transition");
expect(/id="queryPage"/, "expected a dedicated query page section");
expect(/id="csvPage"/, "expected a dedicated csv page section");
expect(/<option value="interviewprep">Interview Prep<\/option>/, "expected interview prep mode in the query mode dropdown");
expect(/id="interviewRoleGroup"/, "expected an interview role input group");
expect(/id="roleInput"/, "expected a dedicated role input for interview prep");
expect(/scripts\/csv-schema\.js/, "expected the page to load extracted csv schema helpers");
expect(/scripts\/csv-analytics\.js/, "expected the page to load extracted csv analytics helpers");
expect(/scripts\/csv-logging\.js/, "expected the page to load extracted csv logging helpers");
expect(/function getRouteFromLocation\(/, "expected a route parser");
expect(/function navigateTo\(/, "expected a navigation helper");
expect(/function applyRouteState\(/, "expected a route-driven visibility handler");
expect(/function saveConnectionFromForm\(/, "expected a saveConnectionFromForm function");
expect(/function normalizeMetricValue\(/, "expected metric normalization helper for model-returned scores");
expect(/function renderMetricDirectionHint\(/, "expected metric direction hint renderer");
expect(/function runProviderRequest\(/, "expected a provider-agnostic request dispatcher");
expect(/function buildProviderRequest\(/, "expected provider request builders");
expect(/function parseProviderResponse\(/, "expected provider response parsers");
expect(/provider:\s*"openai"\s*\|\s*"anthropic"\s*\|\s*"gemini"\s*\|\s*"nvidia"/, "expected normalized provider shape documentation");
expect(/higher is better/i, "expected positive metric direction guidance in the UI");
expect(/lower is better/i, "expected negative metric direction guidance in the UI");
expect(/"\//, "expected root route handling in the UI");
expect(/["']\/query["']/, "expected query route handling in the UI");
expect(/["']\/csv["']/, "expected csv route handling in the UI");
expect(/["']\/api-key["']/, "expected api-key route handling in the UI");
expect(/\.agent-card\s*\{[\s\S]*display:\s*flex[\s\S]*flex-direction:\s*column/i, "expected agent cards to use consistent internal column layout");
expect(/\.mini-panel\s*\{[\s\S]*min-height:\s*\d+px/i, "expected mini panels to enforce consistent tile height");
expect(/\.section-intro\s*\{[\s\S]*display:\s*flex/i, "expected shared section intro alignment helper");
expect(/function renderJobsMarkup\(/, "expected jobs card renderer");
expect(/Career Links/i, "expected jobs card to support careers and posting links");
expect(/function normalizeJobLink\(/, "expected jobs link normalizer");
expect(/function resolveNewsSignalStrength\(/, "expected news signal-strength fallback helper");
expect(/function syncQueryModeUi\(/, "expected query mode UI sync helper");
expect(/function getActiveAgentConfigs\(/, "expected mode-aware agent card configuration");
expect(/function renderInterviewPrepBrief\(/, "expected a dedicated interview prep brief renderer");
expect(/function renderInterviewPrepNewsMarkup\(/, "expected interview prep agent card renderers");
expect(/Interview Prep Brief/i, "expected interview prep brief heading copy");

console.log("PulseBoard structure assertions passed.");
