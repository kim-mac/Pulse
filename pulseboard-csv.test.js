const fs = require("fs");
const assert = require("assert");

const html = fs.readFileSync("C:/Users/kim16/Videos/Pulseboard/index.html", "utf8");
const server = fs.existsSync("C:/Users/kim16/Videos/Pulseboard/server.js")
  ? fs.readFileSync("C:/Users/kim16/Videos/Pulseboard/server.js", "utf8")
  : "";

function expectIn(text, pattern, description) {
  assert.match(text, pattern, description);
}

expectIn(html, /Analyze CSV/, "expected CSV Analyst entry action in the frontend");
expectIn(html, /id="csvPage"/, "expected dedicated CSV analysis page");
expectIn(html, /id="csvForm"/, "expected CSV upload form");
expectIn(html, /type="file"[^>]*accept="\.csv"/, "expected CSV file input");
expectIn(html, /Single File Analysis/i, "expected single-file CSV mode toggle");
expectIn(html, /Compare Two Files/i, "expected compare-two-files CSV mode toggle");
expectIn(html, /id="csvModeSingle"/, "expected single-file mode control");
expectIn(html, /id="csvModeCompare"/, "expected compare mode control");
expectIn(html, /id="compareFileAInput"/, "expected File A upload input");
expectIn(html, /id="compareFileBInput"/, "expected File B upload input");
expectIn(html, /id="compareLabelAInput"/, "expected File A label input");
expectIn(html, /id="compareLabelBInput"/, "expected File B label input");
expectIn(html, /function runCsvComparisonViaRelay\(/, "expected frontend CSV comparison relay helper");
expectIn(html, /function renderCsvComparisonResult\(/, "expected comparison result renderer");
expectIn(html, /segmentInsights/, "expected segment-level comparison rendering support");
expectIn(html, /chart\.umd\.min\.js/i, "expected Chart.js CDN loader");
expectIn(html, /Auto-Generated Charts/i, "expected auto-generated charts section");
expectIn(html, /function renderCharts\(/, "expected chart rendering engine");
expectIn(html, /function formatAxisValue\(/, "expected chart axis value formatter");
expectIn(html, /chartInstances/, "expected chart instance tracking for rerenders");
expectIn(html, /function renderChartSkeletons\(/, "expected chart skeleton renderer");
expectIn(html, /grouped_bar|line_comparison|side_by_side_bar/i, "expected comparison chart support");
expectIn(html, /id="downloadCsvPdfButton"/, "expected CSV PDF download action");
expectIn(html, /id="downloadCsvComparisonPdfButton"/, "expected comparison PDF download action");
expectIn(html, /function downloadCsvResultPdf\(/, "expected CSV PDF download handler");
expectIn(html, /id="useSampleCsvButton"/, "expected sample CSV demo action");
expectIn(html, /SAMPLE_CSV_TEXT/, "expected built-in sample CSV data for demo use");
expectIn(html, /csv-metric-grid/, "expected executive CSV metric grid styling");
expectIn(html, /csv-insight-grid/, "expected structured CSV findings layout");
expectIn(html, /function runCsvAnalysisViaRelay\(/, "expected frontend CSV relay execution helper");
expectIn(html, /function applySampleCsv\(/, "expected sample CSV loader helper");
expectIn(html, /function renderCsvInsightList\(/, "expected reusable CSV insight renderer");

expectIn(server, /\/api\/pulseboard\/analyze-csv/, "expected CSV relay endpoint");
expectIn(server, /\/api\/pulseboard\/compare-csv/, "expected CSV comparison relay endpoint");
expectIn(server, /function analyzeCsvSession\(/, "expected CSV analysis relay function");
expectIn(server, /function compareCsvSession\(/, "expected CSV comparison relay function");
expectIn(server, /function parseCsvText\(/, "expected CSV parser");
expectIn(server, /function summarizeCsvData\(/, "expected CSV summarizer");
expectIn(server, /function runCsvAnalyst\(/, "expected CSV analyst model runner");
expectIn(server, /function runCsvComparisonAnalyst\(/, "expected CSV comparison agent runner");
expectIn(server, /chartRecommendations/i, "expected chart recommendation fields in CSV agent prompts");
expectIn(server, /grouped_bar|line_comparison|side_by_side_bar/i, "expected comparison chart recommendation prompt support");
expectIn(server, /segmentInsights: array of 4 objects/i, "expected segmentInsights in comparison agent prompt");
expectIn(server, /declineColumns should include specific products or categories/i, "expected segment-level decline guidance in comparison prompt");
expectIn(server, /\$4\.50 net_revenue anomaly.*critical data quality issue/i, "expected explicit laptop anomaly instruction in comparison prompt");

console.log("PulseBoard CSV assertions passed.");
