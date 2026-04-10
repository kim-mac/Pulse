(function attachCsvAnalytics(globalScope) {
  const root = globalScope.PulseBoardCsv = globalScope.PulseBoardCsv || {};
  const schemaApi = root.schema || {};
  const ingestionApi = root.ingestion || {};
  const {
    parseNumericValue,
    parseDateValue,
    isMissing
  } = schemaApi;
  const {
    cloneParsedCsv
  } = ingestionApi;

  function computeCorrelations(parsedCsv, schemaInference) {
    const records = Array.isArray(parsedCsv?.records) ? parsedCsv.records : [];
    const numericColumns = (Array.isArray(schemaInference) ? schemaInference : [])
      .filter((column) => column.type === "numeric" && column.stats?.uniqueCount > 1)
      .sort((left, right) => (right.stats?.uniqueCount || 0) - (left.stats?.uniqueCount || 0))
      .slice(0, 6);
    const correlations = [];
    for (let i = 0; i < numericColumns.length; i += 1) {
      for (let j = i + 1; j < numericColumns.length; j += 1) {
        const left = numericColumns[i].column;
        const right = numericColumns[j].column;
        const paired = records
          .map((row) => [parseNumericValue(row?.[left]), parseNumericValue(row?.[right])])
          .filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b));
        if (paired.length < 8) continue;
        const coefficient = computePearsonCorrelation(paired);
        if (!Number.isFinite(coefficient) || Math.abs(coefficient) < 0.35) continue;
        correlations.push({
          left,
          right,
          coefficient: Number(coefficient.toFixed(2)),
          sampleSize: paired.length,
          direction: coefficient >= 0 ? "positive" : "negative",
          strength: describeCorrelationStrength(coefficient)
        });
      }
    }
    return correlations
      .sort((a, b) => Math.abs(b.coefficient) - Math.abs(a.coefficient))
      .slice(0, 6);
  }

  function computePearsonCorrelation(pairs) {
    if (!Array.isArray(pairs) || pairs.length < 2) return NaN;
    const xs = pairs.map((pair) => pair[0]);
    const ys = pairs.map((pair) => pair[1]);
    const meanX = xs.reduce((sum, value) => sum + value, 0) / xs.length;
    const meanY = ys.reduce((sum, value) => sum + value, 0) / ys.length;
    let numerator = 0;
    let denomLeft = 0;
    let denomRight = 0;
    for (let index = 0; index < pairs.length; index += 1) {
      const deltaX = xs[index] - meanX;
      const deltaY = ys[index] - meanY;
      numerator += deltaX * deltaY;
      denomLeft += deltaX * deltaX;
      denomRight += deltaY * deltaY;
    }
    const denominator = Math.sqrt(denomLeft * denomRight);
    return denominator ? numerator / denominator : NaN;
  }

  function describeCorrelationStrength(value) {
    const abs = Math.abs(Number(value) || 0);
    if (abs >= 0.85) return "very strong";
    if (abs >= 0.65) return "strong";
    if (abs >= 0.5) return "moderate";
    return "light";
  }

  function computeSegmentSummaries(parsedCsv, schemaInference) {
    const records = Array.isArray(parsedCsv?.records) ? parsedCsv.records : [];
    if (!records.length) return [];
    const categoricalColumns = (Array.isArray(schemaInference) ? schemaInference : [])
      .filter((column) => column.type === "categorical" && column.stats && !column.stats.isHighCardinality && column.stats.uniqueCount >= 2 && column.stats.uniqueCount <= 12)
      .sort((left, right) => {
        const missingDelta = (left.missingPct || 0) - (right.missingPct || 0);
        if (missingDelta !== 0) return missingDelta;
        return (left.stats?.uniqueCount || 0) - (right.stats?.uniqueCount || 0);
      })
      .slice(0, 3);
    const metricColumns = chooseSegmentMetricColumns(schemaInference);
    return categoricalColumns.map((column) => {
      const grouped = new Map();
      records.forEach((row) => {
        const value = row?.[column.column];
        if (isMissing(value)) return;
        const key = String(value).trim();
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key).push(row);
      });
      const segments = [...grouped.entries()]
        .sort((left, right) => right[1].length - left[1].length)
        .slice(0, 4)
        .map(([label, rows]) => ({
          label,
          rowCount: rows.length,
          rowPct: Number(((rows.length / records.length) * 100).toFixed(1)),
          metrics: metricColumns.map((metric) => summarizeSegmentMetric(rows, metric)).filter(Boolean)
        }));
      return {
        dimension: column.column,
        uniqueCount: column.stats?.uniqueCount || segments.length,
        segments
      };
    }).filter((item) => item.segments.length);
  }

  function chooseSegmentMetricColumns(schemaInference) {
    const numericColumns = (Array.isArray(schemaInference) ? schemaInference : [])
      .filter((column) => column.type === "numeric");
    return numericColumns
      .sort((left, right) => scoreMetricColumn(right) - scoreMetricColumn(left))
      .slice(0, 2);
  }

  function scoreMetricColumn(column) {
    const name = String(column?.column || "").toLowerCase();
    let score = 0;
    if (/revenue|amount|sales|total|cost|price/.test(name)) score += 3;
    if (/units|quantity|volume|count/.test(name)) score += 2;
    score += (column?.stats?.uniqueCount || 0) > 10 ? 1 : 0;
    return score;
  }

  function summarizeSegmentMetric(rows, metricColumn) {
    const column = metricColumn?.column;
    if (!column) return null;
    const values = rows
      .map((row) => parseNumericValue(row?.[column]))
      .filter((value) => Number.isFinite(value));
    if (!values.length) return null;
    const isTotal = /revenue|amount|sales|total|cost/.test(column.toLowerCase());
    const value = isTotal
      ? values.reduce((sum, current) => sum + current, 0)
      : values.reduce((sum, current) => sum + current, 0) / values.length;
    return {
      column,
      aggregation: isTotal ? "total" : "average",
      value: Number(value.toFixed(2))
    };
  }

  function buildCorrelationSummary(correlations) {
    if (!Array.isArray(correlations) || !correlations.length) {
      return "No strong numeric correlations detected.";
    }
    return correlations
      .slice(0, 5)
      .map((item) => `${item.left} vs ${item.right}: ${item.direction} correlation ${item.coefficient} (${item.strength}, n=${item.sampleSize})`)
      .join("\n");
  }

  function buildSegmentSummaryText(segmentSummaries) {
    if (!Array.isArray(segmentSummaries) || !segmentSummaries.length) {
      return "No segmentation opportunities detected.";
    }
    return segmentSummaries
      .map((group) => {
        const topSegment = group.segments[0];
        const metricCopy = Array.isArray(topSegment?.metrics) && topSegment.metrics.length
          ? `; top metrics: ${topSegment.metrics.map((metric) => `${metric.aggregation} ${metric.column} ${metric.value}`).join(", ")}`
          : "";
        return `${group.dimension}: top segment ${topSegment?.label || "n/a"} with ${topSegment?.rowCount || 0} rows (${topSegment?.rowPct || 0}%)${metricCopy}`;
      })
      .join("\n");
  }

  function normalizeChartFilters(filters, filterOptions, defaultFactory) {
    const fallbackFactory = typeof defaultFactory === "function"
      ? defaultFactory
      : () => ({
        categoryColumn: "",
        categoryValue: "__all__",
        dateColumn: "",
        dateWindow: "__all__"
      });
    const next = { ...fallbackFactory(), ...(filters || {}) };
    const categoryColumnValid = filterOptions.categoryOptions.some((option) => option.column === next.categoryColumn);
    if (!categoryColumnValid) {
      next.categoryColumn = "";
      next.categoryValue = "__all__";
    }
    if (next.categoryColumn) {
      const categoryValues = filterOptions.categoryValues[next.categoryColumn] || [];
      if (next.categoryValue !== "__all__" && !categoryValues.some((value) => value === next.categoryValue)) {
        next.categoryValue = "__all__";
      }
    }
    const dateColumnValid = filterOptions.dateOptions.some((option) => option.column === next.dateColumn);
    if (!dateColumnValid) {
      next.dateColumn = "";
      next.dateWindow = "__all__";
    }
    if (next.dateColumn && next.dateWindow !== "__all__") {
      const dateWindows = filterOptions.dateWindows[next.dateColumn] || [];
      if (!dateWindows.some((windowOption) => windowOption.value === next.dateWindow)) {
        next.dateWindow = "__all__";
      }
    }
    return next;
  }

  function buildSingleChartFilterOptions(parsedCsv, schemaInference) {
    const rows = Array.isArray(parsedCsv?.records) ? parsedCsv.records : [];
    const categoryOptions = (Array.isArray(schemaInference) ? schemaInference : [])
      .filter((column) => column.type === "categorical" && column.stats && column.stats.uniqueCount >= 2 && column.stats.uniqueCount <= 12)
      .sort((left, right) => left.stats.uniqueCount - right.stats.uniqueCount)
      .slice(0, 4)
      .map((column) => ({ column: column.column, uniqueCount: column.stats.uniqueCount }));
    const categoryValues = {};
    categoryOptions.forEach((option) => {
      categoryValues[option.column] = Array.from(new Set(rows.map((row) => String(row?.[option.column] ?? "").trim()).filter(Boolean))).sort((left, right) => left.localeCompare(right)).slice(0, 12);
    });
    const dateOptions = (Array.isArray(schemaInference) ? schemaInference : [])
      .filter((column) => column.type === "date" && column.stats?.earliest && column.stats?.latest)
      .slice(0, 2)
      .map((column) => ({ column: column.column, earliest: column.stats.earliest, latest: column.stats.latest }));
    const dateWindows = {};
    dateOptions.forEach((option) => {
      const timestamps = rows.map((row) => parseDateValue(row?.[option.column])).filter((value) => Number.isFinite(value)).sort((left, right) => left - right);
      if (!timestamps.length) return;
      const midpoint = timestamps[Math.floor((timestamps.length - 1) / 2)];
      dateWindows[option.column] = [
        { value: "__all__", label: "All dates" },
        { value: "early", label: `${formatDateLabel(timestamps[0])} -> ${formatDateLabel(midpoint)}` },
        { value: "late", label: `${formatDateLabel(midpoint)} -> ${formatDateLabel(timestamps[timestamps.length - 1])}` }
      ];
    });
    return { categoryOptions, categoryValues, dateOptions, dateWindows };
  }

  function buildChartFilterValueOptions(filterOptions, filters, escapeHtml, truncateText) {
    if (!filters.categoryColumn) return "<option value=\"__all__\">All values</option>";
    const values = filterOptions.categoryValues[filters.categoryColumn] || [];
    return [
      "<option value=\"__all__\">All values</option>",
      ...values.map((value) => `<option value="${escapeHtml(value)}" ${filters.categoryValue === value ? "selected" : ""}>${escapeHtml(truncateText(value, 28))}</option>`)
    ].join("");
  }

  function buildChartDateWindowOptions(filterOptions, filters, escapeHtml) {
    if (!filters.dateColumn) return "<option value=\"__all__\">All dates</option>";
    const windows = filterOptions.dateWindows[filters.dateColumn] || [{ value: "__all__", label: "All dates" }];
    return windows.map((option) => `<option value="${escapeHtml(option.value)}" ${filters.dateWindow === option.value ? "selected" : ""}>${escapeHtml(option.label)}</option>`).join("");
  }

  function buildSingleChartFilterSummary(parsedCsv, filterOptions, filters) {
    const totalRows = Array.isArray(parsedCsv?.records) ? parsedCsv.records.length : 0;
    const filtered = applySingleChartFilters(parsedCsv, filters).records.length;
    if (!totalRows) return "No rows available for charting.";
    if (filtered === totalRows) return `Showing all ${totalRows.toLocaleString()} rows in the chart layer.`;
    return `Showing ${filtered.toLocaleString()} of ${totalRows.toLocaleString()} rows after chart filters.`;
  }

  function applySingleChartFilters(parsedCsv, filters) {
    const headers = Array.isArray(parsedCsv?.headers) ? parsedCsv.headers : [];
    const rows = Array.isArray(parsedCsv?.records) ? parsedCsv.records : [];
    const dateWindowBounds = resolveDateWindowBounds(rows, filters?.dateColumn, filters?.dateWindow);
    const filteredRows = rows.filter((row) => {
      if (filters?.categoryColumn && filters?.categoryValue && filters.categoryValue !== "__all__") {
        if (String(row?.[filters.categoryColumn] ?? "").trim() !== filters.categoryValue) return false;
      }
      if (filters?.dateColumn && dateWindowBounds) {
        const dateValue = parseDateValue(row?.[filters.dateColumn]);
        if (!Number.isFinite(dateValue)) return false;
        if (dateValue < dateWindowBounds.min || dateValue > dateWindowBounds.max) return false;
      }
      return true;
    });
    const cloned = cloneParsedCsv(parsedCsv);
    cloned.headers = [...headers];
    cloned.records = filteredRows.map((row) => ({ ...row }));
    return cloned;
  }

  function resolveDateWindowBounds(rows, dateColumn, dateWindow) {
    if (!dateColumn || !dateWindow || dateWindow === "__all__") return null;
    const timestamps = rows.map((row) => parseDateValue(row?.[dateColumn])).filter((value) => Number.isFinite(value)).sort((left, right) => left - right);
    if (!timestamps.length) return null;
    const midpoint = timestamps[Math.floor((timestamps.length - 1) / 2)];
    if (dateWindow === "early") return { min: timestamps[0], max: midpoint };
    if (dateWindow === "late") return { min: midpoint, max: timestamps[timestamps.length - 1] };
    return null;
  }

  function formatDateLabel(timestamp) {
    if (!Number.isFinite(timestamp)) return "";
    return new Date(timestamp).toISOString().slice(0, 10);
  }

  function severitySortRank(value) {
    const normalized = String(value || "low").toLowerCase();
    if (normalized === "critical") return 3;
    if (normalized === "warning" || normalized === "medium") return 2;
    return 1;
  }

  function normalizeAnomalySeverity(value) {
    const normalized = String(value || "low").toLowerCase();
    if (normalized === "critical") return "critical";
    if (normalized === "warning" || normalized === "medium") return "warning";
    return "low";
  }

  function enrichAnomalyWithRow(anomaly, rowsA, rowsB) {
    const fileNorm = String(anomaly.file || "A").toUpperCase().replace(/FILE\s*/i, "").trim();
    const sourceRows = fileNorm === "B" ? (rowsB || []) : (rowsA || []);
    const idx = anomaly.rowIndex;

    if (idx === undefined || idx === null || idx < 0 || idx >= sourceRows.length) {
      return {
        ...anomaly,
        normalizedSeverity: normalizeAnomalySeverity(anomaly?.severity),
        matchedRow: null,
        matchedRowIndex: -1,
        rowNumber: null,
        totalRows: sourceRows.length
      };
    }

    return {
      ...anomaly,
      normalizedSeverity: normalizeAnomalySeverity(anomaly?.severity),
      matchedRow: sourceRows[idx],
      matchedRowIndex: idx,
      rowNumber: idx + 1,
      totalRows: sourceRows.length
    };
  }

  function enrichAnomalies(anomalies, options = {}) {
    const list = Array.isArray(anomalies) ? anomalies : [];
    const rowsA = options.rowsA || [];
    const rowsB = options.rowsB || [];
    return list.map((item, index) => ({
      ...enrichAnomalyWithRow(item, rowsA, rowsB),
      id: `${options.mode || "single"}-anomaly-${index}`
    }));
  }

  function filterAnomalies(anomalies, filter) {
    if (filter === "fileA") return anomalies.filter((item) => item.file === "A");
    if (filter === "fileB") return anomalies.filter((item) => item.file === "B");
    if (filter === "critical") return anomalies.filter((item) => normalizeAnomalySeverity(item.severity) === "critical");
    return anomalies;
  }

  root.analytics = {
    computeCorrelations,
    computePearsonCorrelation,
    describeCorrelationStrength,
    computeSegmentSummaries,
    chooseSegmentMetricColumns,
    scoreMetricColumn,
    summarizeSegmentMetric,
    buildCorrelationSummary,
    buildSegmentSummaryText,
    normalizeChartFilters,
    buildSingleChartFilterOptions,
    buildChartFilterValueOptions,
    buildChartDateWindowOptions,
    buildSingleChartFilterSummary,
    applySingleChartFilters,
    formatDateLabel,
    severitySortRank,
    enrichAnomalyWithRow,
    enrichAnomalies,
    filterAnomalies
  };
}(window));
