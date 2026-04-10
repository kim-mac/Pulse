(function attachCsvSchema(globalScope) {
  const root = globalScope.PulseBoardCsv = globalScope.PulseBoardCsv || {};

  function parseNumericValue(value) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    const normalized = String(value ?? "").replace(/[$,%\s]/g, "").replace(/,/g, "");
    const number = Number(normalized);
    return Number.isFinite(number) ? number : NaN;
  }

  function parseDateValue(value) {
    const text = String(value ?? "").trim();
    if (!text) return null;
    if (/^\d{4}-\d{2}$/.test(text)) {
      const time = Date.parse(`${text}-01T00:00:00Z`);
      return Number.isFinite(time) ? time : null;
    }
    const time = Date.parse(text);
    return Number.isFinite(time) ? time : null;
  }

  function isMissing(value) {
    if (value === null) return true;
    if (value === undefined) return true;
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed === "") return true;
      if (trimmed.toLowerCase() === "null") return true;
      if (trimmed.toLowerCase() === "undefined") return true;
      if (trimmed.toLowerCase() === "n/a") return true;
      if (trimmed.toLowerCase() === "na") return true;
      if (trimmed === "-") return true;
      if (trimmed === "#n/a") return true;
      if (trimmed === "#null") return true;
      if (trimmed === "none") return true;
    }
    return false;
  }

  function isActuallyNumeric(col, rows) {
    const sample = (rows || [])
      .map((row) => row[col])
      .filter((value) =>
        value !== null &&
        value !== undefined &&
        String(value).trim() !== ""
      )
      .slice(0, 20);
    if (sample.length === 0) return false;
    const numericCount = sample
      .filter((value) => Number.isFinite(parseFloat(value)))
      .length;
    return (numericCount / sample.length) >= 0.8;
  }

  function inferColumnSchema(col, rows) {
    const values = rows
      .map((row) => row[col])
      .filter((value) => !isMissing(value));

    const totalRows = rows.length;
    const nonMissingCount = values.length;
    const missingCount = totalRows - nonMissingCount;
    const missingPct = totalRows ? Math.round((missingCount / totalRows) * 100) : 100;

    if (nonMissingCount === 0) {
      return {
        column: col,
        type: "empty",
        typeLabel: "Empty",
        missingCount,
        missingPct: 100,
        stats: null,
        samples: [],
        mixed: false
      };
    }

    const datePatterns = [
      /^\d{4}-\d{2}-\d{2}$/,
      /^\d{4}-\d{2}-\d{2}T/,
      /^\d{2}\/\d{2}\/\d{4}$/,
      /^\d{2}-\d{2}-\d{4}$/,
      /^\d{4}\/\d{2}\/\d{2}$/
    ];
    const dateSample = values.slice(0, 20);
    const dateMatchCount = dateSample.filter((value) =>
      datePatterns.some((pattern) => pattern.test(String(value).trim()))
    ).length;

    if (dateSample.length && (dateMatchCount / dateSample.length) >= 0.8) {
      const parsed = values
        .map((value) => new Date(value))
        .filter((date) => !Number.isNaN(date.getTime()))
        .sort((a, b) => a - b);

      return {
        column: col,
        type: "date",
        typeLabel: "Date",
        missingCount,
        missingPct,
        stats: {
          earliest: parsed[0]?.toISOString().split("T")[0] || null,
          latest: parsed[parsed.length - 1]?.toISOString().split("T")[0] || null,
          uniqueCount: new Set(values).size
        },
        samples: [],
        mixed: dateMatchCount < dateSample.length
      };
    }

    const numericSample = values.slice(0, 20);
    const numericCount = numericSample.filter((value) => Number.isFinite(parseFloat(value))).length;

    if (numericSample.length && (numericCount / numericSample.length) >= 0.8) {
      const nums = values
        .map((value) => parseFloat(value))
        .filter((value) => Number.isFinite(value))
        .sort((a, b) => a - b);

      const mean = nums.reduce((sum, value) => sum + value, 0) / nums.length;
      const median = nums.length % 2 === 0
        ? (nums[(nums.length / 2) - 1] + nums[nums.length / 2]) / 2
        : nums[Math.floor(nums.length / 2)];
      const uniqueCount = new Set(nums).size;
      const isIdLike = uniqueCount === nums.length && nums.every((value) => Number.isInteger(value));
      const isPctLike = nums.every((value) => value >= 0 && value <= 100)
        && /pct|percent|score|rating|satisfaction|rate/.test(col.toLowerCase());

      return {
        column: col,
        type: isIdLike ? "id_numeric" : "numeric",
        typeLabel: isPctLike ? "Score" : "Numeric",
        missingCount,
        missingPct,
        stats: {
          min: nums[0],
          max: nums[nums.length - 1],
          mean: Math.round(mean * 100) / 100,
          median: Math.round(median * 100) / 100,
          uniqueCount,
          isCurrency: /price|revenue|amount|cost|total|salary|wage/.test(col.toLowerCase())
        },
        samples: [],
        mixed: numericCount < numericSample.length
      };
    }

    const uniqueVals = new Set(values);
    const uniqueRatio = uniqueVals.size / values.length;
    const avgLen = values.reduce((sum, value) => sum + String(value).length, 0) / values.length;
    const idPattern = /^[A-Z]{1,5}[-_]?\d+$/i;
    const looksLikeId = values.slice(0, 10)
      .filter((value) => idPattern.test(String(value).trim())).length >= 7;

    if (looksLikeId || (uniqueRatio > 0.9 && avgLen < 20)) {
      return {
        column: col,
        type: "identifier",
        typeLabel: "ID",
        missingCount,
        missingPct,
        stats: {
          uniqueCount: uniqueVals.size,
          format: `${String(values[0]).substring(0, 12)}...`
        },
        samples: [],
        mixed: false
      };
    }

    const valueCounts = new Map();
    values.forEach((value) => valueCounts.set(value, (valueCounts.get(value) || 0) + 1));
    const sortedByFreq = [...valueCounts.entries()]
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count);

    return {
      column: col,
      type: "categorical",
      typeLabel: "Category",
      missingCount,
      missingPct,
      stats: {
        uniqueCount: uniqueVals.size,
        topValues: sortedByFreq.slice(0, 4),
        isHighCardinality: uniqueVals.size > 20
      },
      samples: sortedByFreq.slice(0, 3).map((item) => item.value),
      mixed: false
    };
  }

  function inferFullSchema(headers, rows) {
    return headers.map((col) => inferColumnSchema(col, rows));
  }

  function buildSchemaSummary(schemaInference) {
    return schemaInference.map((col) => {
      let summary = `${col.column} (${col.typeLabel})`;
      if (col.missingCount > 0) {
        summary += ` - ${col.missingCount} missing`;
      }
      if ((col.type === "numeric" || col.type === "id_numeric") && col.stats) {
        summary += ` - range: ${col.stats.min} to ${col.stats.max}, mean: ${col.stats.mean}`;
      }
      if (col.type === "categorical" && col.stats) {
        summary += ` - ${col.stats.uniqueCount} unique values`;
      }
      if (col.type === "date" && col.stats) {
        summary += ` - ${col.stats.earliest} to ${col.stats.latest}`;
      }
      if (col.mixed) {
        summary += " - Mixed values detected";
      }
      return summary;
    }).join("\n");
  }

  function isActuallyDateLike(col, rows) {
    const sample = (rows || [])
      .map((row) => row[col])
      .filter((value) =>
        value !== null &&
        value !== undefined &&
        String(value).trim() !== ""
      )
      .slice(0, 20);
    if (sample.length === 0) return false;
    const dateLikeCount = sample.filter((value) => {
      const text = String(value).trim();
      return (
        /^\d{4}-\d{2}-\d{2}(?:[T\s]\d{2}:\d{2}(?::\d{2})?(?:Z)?)?$/.test(text) ||
        /^\d{4}-\d{2}$/.test(text) ||
        /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(text) ||
        /^\d{1,2}\.\d{1,2}\.\d{4}$/.test(text)
      );
    }).length;
    return (dateLikeCount / sample.length) >= 0.8;
  }

  function detectDateFormat(value) {
    const text = String(value ?? "").trim();
    if (!text) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return "yyyy-mm-dd";
    if (/^\d{4}-\d{2}$/.test(text)) return "yyyy-mm";
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(text)) {
      const [first, second] = text.split("/").map(Number);
      return first > 12 ? "dd/mm/yyyy" : second > 12 ? "mm/dd/yyyy" : "slash-date";
    }
    if (/^\d{1,2}\.\d{1,2}\.\d{4}$/.test(text)) return "dd.mm.yyyy";
    if (Number.isFinite(Date.parse(text))) return "textual-date";
    return null;
  }

  root.schema = {
    parseNumericValue,
    parseDateValue,
    isMissing,
    isActuallyNumeric,
    inferColumnSchema,
    inferFullSchema,
    buildSchemaSummary,
    isActuallyDateLike,
    detectDateFormat
  };
}(window));
