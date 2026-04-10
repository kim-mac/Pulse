(function attachCsvLogging(globalScope) {
  const root = globalScope.PulseBoardCsv = globalScope.PulseBoardCsv || {};

  function createCsvPipelineLogger(options = {}) {
    const maxEntries = Number.isFinite(options.maxEntries) ? options.maxEntries : 200;
    const sink = Array.isArray(options.initialEntries) ? options.initialEntries.slice(0, maxEntries) : [];

    function log(stage, event, details = {}) {
      const entry = {
        timestamp: new Date().toISOString(),
        stage: String(stage || "general"),
        event: String(event || "info"),
        details: sanitizeDetails(details)
      };
      sink.push(entry);
      if (sink.length > maxEntries) sink.splice(0, sink.length - maxEntries);
      try {
        console.info("[PulseBoard CSV]", entry.stage, entry.event, entry.details);
      } catch (error) {
        // no-op: logging should never affect app behavior
      }
      return entry;
    }

    function getEntries() {
      return sink.slice();
    }

    function clear() {
      sink.length = 0;
    }

    function summarize() {
      return sink.reduce((acc, entry) => {
        const key = `${entry.stage}:${entry.event}`;
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {});
    }

    return { log, getEntries, clear, summarize };
  }

  function sanitizeDetails(input) {
    if (!input || typeof input !== "object") return {};
    const output = {};
    Object.entries(input).forEach(([key, value]) => {
      if (value === undefined) return;
      if (typeof value === "string" && value.length > 240) {
        output[key] = `${value.slice(0, 237)}...`;
        return;
      }
      if (Array.isArray(value)) {
        output[key] = value.slice(0, 12);
        return;
      }
      output[key] = value;
    });
    return output;
  }

  root.logging = {
    createCsvPipelineLogger,
    sanitizeDetails
  };
}(window));
