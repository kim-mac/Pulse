(function attachCsvIngestion(globalScope) {
  const root = globalScope.PulseBoardCsv = globalScope.PulseBoardCsv || {};

  async function validateAndReadCsvFile(file, options = {}) {
    const maxUploadBytes = Number(options.maxUploadBytes || 0);
    const allowedMimeTypes = Array.isArray(options.allowedMimeTypes) ? options.allowedMimeTypes : [];
    if (!file) {
      return { ok: false, error: "Choose a CSV file before starting analysis." };
    }
    const fileName = String(file.name || "");
    const hasCsvExtension = /\.csv$/i.test(fileName);
    const hasKnownMime = !file.type || allowedMimeTypes.includes(file.type);
    if (!hasCsvExtension || !hasKnownMime) {
      return { ok: false, error: "Unsupported file type. Upload a .csv file to continue." };
    }
    if (maxUploadBytes && Number(file.size || 0) > maxUploadBytes) {
      return { ok: false, error: "CSV file too large. The single-file analyst supports uploads up to 10 MB." };
    }

    let buffer;
    try {
      buffer = await file.arrayBuffer();
    } catch (error) {
      return { ok: false, error: "The selected file could not be read. Try exporting the CSV again and re-uploading it." };
    }

    const bytes = new Uint8Array(buffer);
    const encoding = detectCsvEncoding(bytes);
    let text = "";
    try {
      text = new TextDecoder(encoding.decoder).decode(buffer);
    } catch (error) {
      return { ok: false, error: "This CSV appears to use an unsupported encoding. Save it as UTF-8 and try again." };
    }

    const replacementCount = (text.match(/\uFFFD/g) || []).length;
    if (replacementCount > 8 || (text.length && replacementCount / text.length > 0.01)) {
      return {
        ok: false,
        error: "Likely encoding problem detected while reading this CSV. Save it as UTF-8 and upload it again."
      };
    }

    const warnings = [];
    if (replacementCount > 0) {
      warnings.push("Minor encoding cleanup was applied while reading the file.");
    }

    return {
      ok: true,
      text,
      warnings,
      encoding: encoding.label
    };
  }

  function detectCsvEncoding(bytes) {
    if (bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
      return { decoder: "utf-8", label: "UTF-8 BOM" };
    }
    if (bytes[0] === 0xFF && bytes[1] === 0xFE) {
      return { decoder: "utf-16le", label: "UTF-16 LE" };
    }
    if (bytes[0] === 0xFE && bytes[1] === 0xFF) {
      return { decoder: "utf-16be", label: "UTF-16 BE" };
    }
    return { decoder: "utf-8", label: "UTF-8" };
  }

  function parseCsvText(csvText) {
    const normalized = String(csvText || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const lines = normalized
      .split("\n")
      .map((line, index) => ({ line, rowNumber: index + 1 }))
      .filter((entry) => entry.line.trim().length > 0);
    if (lines.length < 2) {
      throw new Error("CSV must include a header row and at least one data row.");
    }

    const headerResult = parseCsvLine(lines[0].line);
    if (headerResult.error) {
      throw new Error("CSV header row could not be parsed. Fix the file formatting and try again.");
    }
    const headers = headerResult.values.map((header, index) => header || `column_${index + 1}`);
    const records = [];
    const warnings = [];
    const skippedRowNumbers = [];
    const recoveredRowNumbers = [];
    let malformedRowCount = 0;

    lines.slice(1).forEach((entry) => {
      const rowResult = parseCsvLine(entry.line);
      if (rowResult.error) {
        malformedRowCount += 1;
        skippedRowNumbers.push(entry.rowNumber);
        return;
      }
      const row = rowResult.values.slice();
      if (row.length < headers.length) {
        while (row.length < headers.length) row.push("");
        recoveredRowNumbers.push(entry.rowNumber);
      } else if (row.length > headers.length) {
        row.length = headers.length;
        recoveredRowNumbers.push(entry.rowNumber);
      }
      const record = {};
      headers.forEach((header, index) => {
        record[header] = row[index] ?? "";
      });
      records.push(record);
    });

    if (!records.length) {
      throw new Error("No usable data rows were found after malformed rows were skipped.");
    }
    if (malformedRowCount > 0) {
      warnings.push(`${malformedRowCount} malformed rows were skipped during upload. Analysis used the remaining ${records.length} rows.`);
    }
    if (recoveredRowNumbers.length > 0) {
      warnings.push(`${recoveredRowNumbers.length} rows were normalized because their column counts did not match the header.`);
    }
    return { headers, records, warnings, malformedRowCount, skippedRowNumbers, recoveredRowNumbers };
  }

  function parseCsvTextForQuality(csvText) {
    if (!String(csvText || "").trim()) return { headers: [], records: [], warnings: [], malformedRowCount: 0, skippedRowNumbers: [], recoveredRowNumbers: [] };
    try {
      return parseCsvText(csvText);
    } catch (error) {
      return { headers: [], records: [], warnings: [error.message || "CSV parsing failed."], malformedRowCount: 0, skippedRowNumbers: [], recoveredRowNumbers: [] };
    }
  }

  function parseCsvLine(line) {
    const values = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      const next = line[i + 1];
      if (char === "\"" && inQuotes && next === "\"") {
        current += "\"";
        i += 1;
        continue;
      }
      if (char === "\"") {
        inQuotes = !inQuotes;
        continue;
      }
      if (char === "," && !inQuotes) {
        values.push(current.trim());
        current = "";
        continue;
      }
      current += char;
    }
    if (inQuotes) {
      return { values: [], error: "Unterminated quoted field." };
    }
    values.push(current.trim());
    return { values, error: null };
  }

  function serializeParsedCsv(parsedCsv) {
    const headers = Array.isArray(parsedCsv?.headers) ? parsedCsv.headers : [];
    const records = Array.isArray(parsedCsv?.records) ? parsedCsv.records : [];
    const encodeCell = (value) => {
      const text = String(value ?? "");
      if (/[",\n]/.test(text)) {
        return `"${text.replace(/"/g, "\"\"")}"`;
      }
      return text;
    };
    return [
      headers.map(encodeCell).join(","),
      ...records.map((record) => headers.map((header) => encodeCell(record[header])).join(","))
    ].join("\n");
  }

  function cloneParsedCsv(parsedCsv) {
    return {
      headers: Array.isArray(parsedCsv?.headers) ? [...parsedCsv.headers] : [],
      records: Array.isArray(parsedCsv?.records) ? parsedCsv.records.map((record) => ({ ...record })) : [],
      warnings: Array.isArray(parsedCsv?.warnings) ? [...parsedCsv.warnings] : [],
      malformedRowCount: Number(parsedCsv?.malformedRowCount || 0),
      skippedRowNumbers: Array.isArray(parsedCsv?.skippedRowNumbers) ? [...parsedCsv.skippedRowNumbers] : [],
      recoveredRowNumbers: Array.isArray(parsedCsv?.recoveredRowNumbers) ? [...parsedCsv.recoveredRowNumbers] : []
    };
  }

  root.ingestion = {
    validateAndReadCsvFile,
    detectCsvEncoding,
    parseCsvText,
    parseCsvTextForQuality,
    parseCsvLine,
    serializeParsedCsv,
    cloneParsedCsv
  };
}(window));
