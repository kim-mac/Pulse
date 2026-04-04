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
expect(/id="queryPage"/, "expected a dedicated query page section");
expect(/id="csvPage"/, "expected a dedicated csv page section");
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

console.log("PulseBoard structure assertions passed.");
