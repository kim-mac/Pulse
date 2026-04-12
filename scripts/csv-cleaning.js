(function attachCsvCleaning(globalScope) {
  const root = globalScope.PulseBoardCsv = globalScope.PulseBoardCsv || {};
  const schemaApi = root.schema || {};
  const ingestionApi = root.ingestion || {};
  const {
    isMissing,
    inferFullSchema
  } = schemaApi;
  const {
    cloneParsedCsv
  } = ingestionApi;

  function createDefaultCleaningConfig() {
    return {
      mode: "raw",
      numericMissingStrategy: "leave",
      categoricalMissingStrategy: "leave",
      dropRowsWithMissing: false
    };
  }

  function applyDataCleaningPipeline(parsedCsv, config = createDefaultCleaningConfig(), options = {}) {
    const rawParsedCsv = cloneParsedCsv(parsedCsv);
    const normalizedConfig = {
      mode: config?.mode === "raw" ? "raw" : "clean",
      numericMissingStrategy: ["leave", "mean", "median", "zero"].includes(config?.numericMissingStrategy)
        ? config.numericMissingStrategy
        : "leave",
      categoricalMissingStrategy: config?.categoricalMissingStrategy === "mode" ? "mode" : "leave",
      dropRowsWithMissing: Boolean(config?.dropRowsWithMissing)
    };
    const cleanedCsv = cloneParsedCsv(parsedCsv);
    const log = [];
    const summaryState = {
      mode: normalizedConfig.mode,
      appliedCount: 0,
      suggestedCount: 0,
      byType: {
        numeric_standardization: 0,
        categorical_normalization: 0,
        missing_value_fill_mean: 0,
        missing_value_fill_median: 0,
        missing_value_fill_mode: 0,
        missing_value_fill_zero: 0,
        row_dropped_missing: 0
      },
      touchedColumns: new Set(),
      categoricalColumns: new Map(),
      numericColumns: new Map(),
      numericMissingColumns: new Map(),
      categoricalMissingColumns: new Map(),
      droppedRows: []
    };
    if (normalizedConfig.mode === "raw") {
      const rawSchema = inferFullSchema(rawParsedCsv.headers || [], rawParsedCsv.records || []);
      const summary = finalizeCleaningSummary(summaryState, []);
      return {
        config: normalizedConfig,
        rawParsedCsv,
        cleanedCsv: rawParsedCsv,
        cleanedSchema: rawSchema,
        log,
        suggestions: [],
        summary,
        logExpanded: Boolean(options.logExpanded)
      };
    }

    const rawSchema = inferFullSchema(rawParsedCsv.headers || [], rawParsedCsv.records || []);
    applyNumericStandardization(cleanedCsv, rawSchema, log, summaryState);
    applyCategoricalNormalization(cleanedCsv, rawSchema, log, summaryState);
    if (normalizedConfig.dropRowsWithMissing) {
      dropRowsWithMissingValues(cleanedCsv, log, summaryState);
    }

    let cleanedSchema = inferFullSchema(cleanedCsv.headers || [], cleanedCsv.records || []);
    applyMissingValueStrategies(cleanedCsv, cleanedSchema, normalizedConfig, log, summaryState);
    cleanedSchema = inferFullSchema(cleanedCsv.headers || [], cleanedCsv.records || []);
    const suggestions = [];

    const summary = finalizeCleaningSummary(summaryState, suggestions);
    return {
      config: normalizedConfig,
      rawParsedCsv,
      cleanedCsv,
      cleanedSchema,
      log,
      suggestions,
      summary,
      logExpanded: Boolean(options.logExpanded)
    };
  }

  function dropRowsWithMissingValues(parsedCsv, log, summaryState) {
    const nextRecords = [];
    (parsedCsv.records || []).forEach((row, rowIndex) => {
      const missingColumns = (parsedCsv.headers || []).filter((header) => isMissing(row?.[header]));
      if (!missingColumns.length) {
        nextRecords.push(row);
        return;
      }
      log.push({
        state: "applied",
        type: "row_dropped_missing",
        rowIndex,
        column: missingColumns[0] || "dataset",
        originalValue: `${missingColumns.length} missing value(s)`,
        cleanedValue: "row removed",
        detail: `Dropped row due to missing values in ${missingColumns.join(", ")}.`
      });
      summaryState.appliedCount += 1;
      summaryState.byType.row_dropped_missing += 1;
      summaryState.droppedRows.push({ rowIndex, missingColumns });
      missingColumns.forEach((column) => summaryState.touchedColumns.add(column));
    });
    parsedCsv.records = nextRecords;
  }

  function applyNumericStandardization(parsedCsv, schemaInference, log, summaryState) {
    const schemaMap = Object.fromEntries((schemaInference || []).map((column) => [column.column, column]));
    (parsedCsv.records || []).forEach((row, rowIndex) => {
      (parsedCsv.headers || []).forEach((header) => {
        const schema = schemaMap[header];
        if (!schema || schema.type !== "numeric") return;
        const rawValue = row[header];
        if (isMissing(rawValue)) return;
        const cleanedValue = standardizeNumericCell(rawValue);
        if (cleanedValue === null || cleanedValue === String(rawValue)) return;
        row[header] = cleanedValue;
        log.push({
          state: "applied",
          type: "numeric_standardization",
          rowIndex,
          column: header,
          originalValue: rawValue,
          cleanedValue,
          detail: `Standardized numeric format in ${header}.`
        });
        summaryState.appliedCount += 1;
        summaryState.byType.numeric_standardization += 1;
        summaryState.touchedColumns.add(header);
        summaryState.numericColumns.set(header, (summaryState.numericColumns.get(header) || 0) + 1);
      });
    });
  }

  function standardizeNumericCell(value) {
    const text = String(value ?? "");
    if (!text.trim()) return null;
    let normalized = text.trim().replace(/,/g, "").replace(/\$/g, "").replace(/%/g, "");
    if (/^\(.+\)$/.test(normalized)) {
      normalized = `-${normalized.slice(1, -1).trim()}`;
    }
    normalized = normalized.replace(/\s+/g, "");
    const parsed = Number(normalized);
    if (!Number.isFinite(parsed)) return null;
    if (String(text) === normalized) return null;
    if (Number.isInteger(parsed)) return String(parsed);
    return String(Number(parsed.toFixed(6)));
  }

  function applyCategoricalNormalization(parsedCsv, schemaInference, log, summaryState) {
    const categoricalColumns = (schemaInference || []).filter((column) => column.type === "categorical").map((column) => column.column);
    categoricalColumns.forEach((header) => {
      const canonicalGroups = new Map();
      (parsedCsv.records || []).forEach((row) => {
        const rawValue = row[header];
        if (isMissing(rawValue)) return;
        const variant = String(rawValue).trim().replace(/\s+/g, " ");
        const canonical = canonicalizeCategoryValue(variant);
        if (!canonical) return;
        if (!canonicalGroups.has(canonical)) canonicalGroups.set(canonical, new Map());
        const variants = canonicalGroups.get(canonical);
        variants.set(variant, (variants.get(variant) || 0) + 1);
      });

      const dominantByCanonical = new Map();
      canonicalGroups.forEach((variants, canonical) => {
        const ordered = [...variants.entries()].sort((left, right) => {
          if (right[1] !== left[1]) return right[1] - left[1];
          return left[0].localeCompare(right[0]);
        });
        dominantByCanonical.set(canonical, ordered[0]?.[0] || "");
      });

      (parsedCsv.records || []).forEach((row, rowIndex) => {
        const rawValue = row[header];
        if (isMissing(rawValue)) return;
        const trimmed = String(rawValue).trim().replace(/\s+/g, " ");
        const canonical = canonicalizeCategoryValue(trimmed);
        const dominant = dominantByCanonical.get(canonical);
        if (!dominant || dominant === trimmed) return;
        row[header] = dominant;
        log.push({
          state: "applied",
          type: "categorical_normalization",
          rowIndex,
          column: header,
          originalValue: rawValue,
          cleanedValue: dominant,
          detail: `Normalized categorical value in ${header}.`
        });
        summaryState.appliedCount += 1;
        summaryState.byType.categorical_normalization += 1;
        summaryState.touchedColumns.add(header);
        if (!summaryState.categoricalColumns.has(header)) {
          summaryState.categoricalColumns.set(header, { touchedRows: 0, variants: new Set(), normalizedForms: new Set() });
        }
        const bucket = summaryState.categoricalColumns.get(header);
        bucket.touchedRows += 1;
        bucket.variants.add(trimmed);
        bucket.normalizedForms.add(dominant);
      });
    });
  }

  function canonicalizeCategoryValue(value) {
    return String(value || "")
      .trim()
      .replace(/[-_/]+/g, " ")
      .replace(/\s+/g, " ")
      .toLowerCase();
  }

  function applyMissingValueStrategies(parsedCsv, schemaInference, config, log, summaryState) {
    const schemaMap = Object.fromEntries((schemaInference || []).map((column) => [column.column, column]));
    (parsedCsv.headers || []).forEach((header) => {
      const schema = schemaMap[header];
      if (!schema?.missingCount) return;
      if (schema.type === "numeric" && config.numericMissingStrategy !== "leave") {
        const numericFillValue = getNumericMissingFillValue(header, parsedCsv.records || [], config.numericMissingStrategy);
        if (numericFillValue === null) return;
        const cleanedValue = formatAppliedNumericValue(numericFillValue);
        (parsedCsv.records || []).forEach((row, rowIndex) => {
          if (!isMissing(row?.[header])) return;
          const originalValue = row[header];
          row[header] = cleanedValue;
          log.push({
            state: "applied",
            type: `missing_value_fill_${config.numericMissingStrategy}`,
            rowIndex,
            column: header,
            originalValue,
            cleanedValue,
            detail: `Filled missing numeric value in ${header} using ${config.numericMissingStrategy}.`
          });
          summaryState.appliedCount += 1;
          summaryState.byType[`missing_value_fill_${config.numericMissingStrategy}`] += 1;
          summaryState.touchedColumns.add(header);
          if (!summaryState.numericMissingColumns.has(header)) {
            summaryState.numericMissingColumns.set(header, { count: 0, strategy: config.numericMissingStrategy });
          }
          summaryState.numericMissingColumns.get(header).count += 1;
        });
        return;
      }
      if (schema.type === "categorical" && config.categoricalMissingStrategy === "mode") {
        const categoricalFillValue = getCategoricalModeValue(header, parsedCsv.records || []);
        if (categoricalFillValue === null) return;
        (parsedCsv.records || []).forEach((row, rowIndex) => {
          if (!isMissing(row?.[header])) return;
          const originalValue = row[header];
          row[header] = categoricalFillValue;
          log.push({
            state: "applied",
            type: "missing_value_fill_mode",
            rowIndex,
            column: header,
            originalValue,
            cleanedValue: categoricalFillValue,
            detail: `Filled missing categorical value in ${header} using mode.`
          });
          summaryState.appliedCount += 1;
          summaryState.byType.missing_value_fill_mode += 1;
          summaryState.touchedColumns.add(header);
          if (!summaryState.categoricalMissingColumns.has(header)) {
            summaryState.categoricalMissingColumns.set(header, { count: 0, strategy: "mode" });
          }
          summaryState.categoricalMissingColumns.get(header).count += 1;
        });
      }
    });
  }

  function getNumericMissingFillValue(column, rows, strategy) {
    const values = (rows || [])
      .map((row) => parseFloat(row?.[column]))
      .filter((value) => Number.isFinite(value));
    if (strategy === "zero") return 0;
    if (!values.length) return null;
    if (strategy === "mean") {
      return values.reduce((sum, value) => sum + value, 0) / values.length;
    }
    if (strategy === "median") {
      const sorted = [...values].sort((left, right) => left - right);
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 === 0
        ? (sorted[mid - 1] + sorted[mid]) / 2
        : sorted[mid];
    }
    return null;
  }

  function getCategoricalModeValue(column, rows) {
    const counts = new Map();
    (rows || []).forEach((row) => {
      const value = row?.[column];
      if (isMissing(value)) return;
      const key = String(value);
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    const ordered = [...counts.entries()].sort((left, right) => {
      if (right[1] !== left[1]) return right[1] - left[1];
      return left[0].localeCompare(right[0]);
    });
    return ordered[0]?.[0] ?? null;
  }

  function formatAppliedNumericValue(value) {
    if (!Number.isFinite(value)) return "";
    if (Number.isInteger(value)) return String(value);
    return String(Number(value.toFixed(6)));
  }

  function buildMissingValueSuggestions(parsedCsv, schemaInference, log, summaryState) {
    const suggestions = [];
    (schemaInference || []).forEach((column) => {
      if (!column?.missingCount) return;
      let suggestion = "leave as missing";
      if ((column.type === "numeric" || column.type === "id_numeric") && column.stats) {
        suggestion = `suggested fill: median (${formatSuggestionValue(column.stats.median)})`;
      } else if (column.type === "categorical" && column.stats) {
        const mode = column.stats.topValues?.[0]?.value;
        suggestion = mode ? `suggested fill: mode ("${mode}")` : "suggested fill: mode";
      } else if (column.type === "date") {
        suggestion = "suggested action: leave as missing";
      }
      const entry = {
        state: "suggested",
        type: "missing_value_preview",
        column: column.column,
        missingCount: column.missingCount,
        detail: `${column.column}: ${column.missingCount} missing -> ${suggestion}`
      };
      suggestions.push(entry);
      log.push(entry);
      summaryState.suggestedCount += 1;
      summaryState.byType.missing_value_preview += 1;
    });
    return suggestions;
  }

  function finalizeCleaningSummary(summaryState, suggestions) {
    const categoricalSummaries = [...summaryState.categoricalColumns.entries()].map(([column, detail]) => ({
      column,
      variantsMerged: detail.variants.size,
      normalizedForms: detail.normalizedForms.size,
      touchedRows: detail.touchedRows
    }));
    const numericSummaries = [...summaryState.numericColumns.entries()].map(([column, count]) => ({
      column,
      count
    }));
    const numericMissingSummaries = [...summaryState.numericMissingColumns.entries()].map(([column, detail]) => ({
      column,
      count: detail.count,
      strategy: detail.strategy
    }));
    const categoricalMissingSummaries = [...summaryState.categoricalMissingColumns.entries()].map(([column, detail]) => ({
      column,
      count: detail.count,
      strategy: detail.strategy
    }));
    return {
      mode: summaryState.mode || "clean",
      appliedCount: summaryState.appliedCount,
      suggestedCount: summaryState.suggestedCount,
      byType: summaryState.byType,
      transformedColumns: summaryState.touchedColumns.size,
      categoricalSummaries,
      numericSummaries,
      numericMissingSummaries,
      categoricalMissingSummaries,
      droppedRowCount: summaryState.droppedRows.length,
      missingFillCount: numericMissingSummaries.reduce((sum, item) => sum + item.count, 0) + categoricalMissingSummaries.reduce((sum, item) => sum + item.count, 0),
      suggestionCount: Array.isArray(suggestions) ? suggestions.length : 0
    };
  }

  function formatSuggestionValue(value) {
    if (!Number.isFinite(value)) return "n/a";
    if (Number.isInteger(value)) return String(value);
    return String(Number(value.toFixed(2)));
  }

  function buildTransformationLogSummary(logEntries) {
    if (!Array.isArray(logEntries) || !logEntries.length) return [];
    return logEntries.slice(0, 30).map((entry) => ({
      type: entry.type,
      state: entry.state,
      rowIndex: Number.isInteger(entry.rowIndex) ? entry.rowIndex : null,
      column: entry.column || null,
      originalValue: entry.originalValue ?? null,
      cleanedValue: entry.cleanedValue ?? null,
      detail: entry.detail || ""
    }));
  }

  root.cleaning = {
    createDefaultCleaningConfig,
    applyDataCleaningPipeline,
    dropRowsWithMissingValues,
    applyNumericStandardization,
    standardizeNumericCell,
    applyCategoricalNormalization,
    canonicalizeCategoryValue,
    applyMissingValueStrategies,
    getNumericMissingFillValue,
    getCategoricalModeValue,
    formatAppliedNumericValue,
    buildMissingValueSuggestions,
    finalizeCleaningSummary,
    formatSuggestionValue,
    buildTransformationLogSummary
  };
}(window));
