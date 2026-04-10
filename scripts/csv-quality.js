(function attachCsvQuality(globalScope) {
  const root = globalScope.PulseBoardCsv = globalScope.PulseBoardCsv || {};
  const schemaApi = root.schema || {};
  const {
    parseNumericValue,
    parseDateValue,
    isMissing,
    isActuallyNumeric,
    isActuallyDateLike,
    detectDateFormat
  } = schemaApi;

  function computeDataQualityReport(parsedCsv) {
    const headers = Array.isArray(parsedCsv?.headers) ? parsedCsv.headers : [];
    const records = Array.isArray(parsedCsv?.records) ? parsedCsv.records : [];
    const rowCount = records.length;
    const columnCount = headers.length;
    if (!rowCount || !columnCount) {
      return buildEmptyQualityReport(rowCount, columnCount);
    }
    const sampledRecords = getQualitySample(records);
    const sampleNote = records.length > 5000 ? "Quality checked on 1,000 row sample" : "";
    const completeness = computeCompleteness(records, headers);
    const inferredColumns = inferColumnTypes(headers, sampledRecords);
    const consistency = columnCount <= 1 ? 100 : computeConsistencyScore(headers, sampledRecords, inferredColumns);
    const uniqueRowCount = new Set(records.map((row) => JSON.stringify(row))).size;
    const uniqueness = rowCount <= 1 ? 100 : clampPercent((uniqueRowCount / rowCount) * 100);
    const validityData = computeValidityScore(headers, sampledRecords, inferredColumns);
    const validity = validityData.score;
    const overallScore = Math.round((completeness.score * 0.40) + (consistency * 0.30) + (uniqueness * 0.20) + (validity * 0.10));
    const rating = qualityRatingForScore(overallScore);
    const flags = [];
    if (completeness.missingCount > 0) flags.push(`[${completeness.missingCount}] missing values across [${completeness.affectedColumnCount}] columns`);
    if (uniqueness < 100) flags.push(`[${Math.max(1, rowCount - uniqueRowCount)}] duplicate rows detected`);
    if (validity < 95) flags.push(`[${Math.max(1, validityData.invalidCount)}] invalid values detected`);
    return {
      rowCount,
      columnCount,
      overallScore,
      label: rating.label,
      color: rating.color,
      completeness: Math.round(completeness.score),
      consistency: Math.round(consistency),
      uniqueness: Math.round(uniqueness),
      validity: Math.round(validity),
      flags,
      sampleNote,
      sampled: records.length > 5000,
      issueCount: flags.length,
      inferredColumns
    };
  }

  function computeCompleteness(rows, headers) {
    if (!rows || rows.length === 0) return { score: 100, missingCount: 0, affectedColumns: [], affectedColumnCount: 0 };
    let missingCount = 0;
    let totalCount = 0;
    const missingByColumn = {};

    headers.forEach((col) => { missingByColumn[col] = 0; });

    rows.forEach((row) => {
      headers.forEach((col) => {
        totalCount += 1;
        const value = row[col];
        if (isMissing(value)) {
          missingCount += 1;
          missingByColumn[col] += 1;
        }
      });
    });

    const affectedColumns = Object.entries(missingByColumn)
      .filter(([, count]) => count > 0)
      .map(([col]) => col);

    return {
      score: Math.round(((totalCount - missingCount) / totalCount) * 100),
      missingCount,
      affectedColumns,
      affectedColumnCount: affectedColumns.length
    };
  }

  function buildEmptyQualityReport(rowCount, columnCount) {
    const rating = qualityRatingForScore(0);
    return {
      rowCount,
      columnCount,
      overallScore: 0,
      label: rating.label,
      color: rating.color,
      completeness: 0,
      consistency: 0,
      uniqueness: 0,
      validity: 0,
      flags: ["[0] missing values across [0] columns", "[0] invalid values detected"],
      sampleNote: "",
      sampled: false,
      issueCount: 2,
      inferredColumns: {}
    };
  }

  function getQualitySample(records) {
    if (!Array.isArray(records) || records.length <= 5000) return records;
    const step = Math.max(1, Math.floor(records.length / 1000));
    const sampled = [];
    for (let index = 0; index < records.length && sampled.length < 1000; index += step) {
      sampled.push(records[index]);
    }
    return sampled.slice(0, 1000);
  }

  function inferColumnTypes(headers, records) {
    const output = {};
    headers.forEach((header) => {
      const values = records.map((record) => record[header]).filter((value) => !isMissing(value));
      if (!values.length) {
        output[header] = { type: "categorical" };
        return;
      }
      const numericCount = values.map((value) => parseNumericValue(value)).filter((value) => Number.isFinite(value)).length;
      if (numericCount >= Math.max(1, Math.floor(values.length * 0.8))) {
        output[header] = { type: "numeric" };
        return;
      }
      const formats = values.map(detectDateFormat).filter(Boolean);
      if (formats.length >= Math.max(1, Math.floor(values.length * 0.7))) {
        output[header] = { type: "date", dominantFormat: mostCommonSimple(formats) };
        return;
      }
      output[header] = { type: "categorical" };
    });
    return output;
  }

  function computeConsistencyScore(headers, records, inferredColumns) {
    const perColumn = headers.map((header) => {
      const kind = inferredColumns[header]?.type || "categorical";
      if (kind === "categorical") return 100;
      if (kind === "numeric") {
        let validCount = 0;
        let nonMissingCount = 0;
        for (const value of records.map((record) => record[header])) {
          if (isMissing(value)) continue;
          nonMissingCount++;
          if (Number.isFinite(parseNumericValue(value))) validCount++;
        }
        return nonMissingCount === 0 ? 100 : clampPercent((validCount / nonMissingCount) * 100);
      }
      const dominantFormat = inferredColumns[header]?.dominantFormat;
      if (!dominantFormat) return 100;
      let validCount = 0;
      let nonMissingCount = 0;
      for (const value of records.map((record) => record[header])) {
        if (isMissing(value)) continue;
        nonMissingCount++;
        if (detectDateFormat(value) === dominantFormat) validCount++;
      }
      return nonMissingCount === 0 ? 100 : clampPercent((validCount / nonMissingCount) * 100);
    });
    return perColumn.reduce((sum, value) => sum + value, 0) / perColumn.length;
  }

  function computeValidityScore(headers, records, inferredColumns) {
    const totalCells = Math.max(1, headers.length * Math.max(records.length, 1));
    let invalidCount = 0;
    const positiveOnlyCols = headers.filter((col) => {
      const hasKeyword = ["price", "revenue", "amount", "cost", "total"]
        .some((keyword) => col.toLowerCase().includes(keyword));
      if (!hasKeyword) return false;
      return isActuallyNumeric(col, records);
    });
    headers.forEach((header) => {
      const kind = inferredColumns[header]?.type || "categorical";
      const values = records.map((record) => record[header]).filter((value) => !isMissing(value));
      if (!values.length) return;
      if (kind === "date") {
        if (!isActuallyDateLike(header, records)) return;
        values.forEach((value) => {
          if (isMissing(value)) return;
          const timestamp = parseDateValue(value);
          if (!timestamp) return;
          const year = new Date(timestamp).getUTCFullYear();
          if (year < 1900 || year > 2100) invalidCount += 1;
        });
        return;
      }
      if (kind !== "numeric") return;
      values.forEach((rawValue) => {
        if (isMissing(rawValue)) return;
        const numVal = parseFloat(rawValue);
        if (Number.isNaN(numVal) || !Number.isFinite(numVal)) return;
        if (positiveOnlyCols.includes(header) && numVal < 0) invalidCount += 1;
      });
    });
    return {
      invalidCount,
      score: clampPercent((1 - (invalidCount / totalCells)) * 100)
    };
  }

  function mostCommonSimple(values) {
    const counts = new Map();
    values.forEach((value) => counts.set(value, (counts.get(value) || 0) + 1));
    let winner = values[0] || null;
    let best = 0;
    counts.forEach((count, value) => {
      if (count > best) {
        winner = value;
        best = count;
      }
    });
    return winner;
  }

  function clampPercent(value) {
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.min(100, value));
  }

  function qualityRatingForScore(score) {
    if (score >= 90) return { label: "Excellent", color: "#3b6d11" };
    if (score >= 75) return { label: "Good", color: "#5a8a2e" };
    if (score >= 60) return { label: "Fair", color: "#b7770d" };
    if (score >= 40) return { label: "Poor", color: "#c0392b" };
    return { label: "Critical", color: "#8b0000" };
  }

  root.quality = {
    computeDataQualityReport,
    computeCompleteness,
    buildEmptyQualityReport,
    getQualitySample,
    inferColumnTypes,
    computeConsistencyScore,
    computeValidityScore,
    mostCommonSimple,
    clampPercent,
    qualityRatingForScore
  };
}(window));
