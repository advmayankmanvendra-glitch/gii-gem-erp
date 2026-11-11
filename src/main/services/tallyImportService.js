import fs from "node:fs";
import path from "node:path";

export function createTallyImportService(deps) {
  const {
    enforcePermission, normalizeDuplicateKey, findMasterImportDuplicate,
    parseImportFile, columnExists
  } = deps;

  function cleanTallyText(value) {
    return String(value || "")
      .replace(/&#4;/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/\s+/g, " ")
      .trim();
  }

  function escapeRegex(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function parseTallyNumber(value) {
    const cleaned = String(value || "").replace(/,/g, "").replace(/[^\d.-]/g, "");
    if (!cleaned) return NaN;
    return Number(cleaned);
  }

  function formatTallyRate(value) {
    return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
  }

  function tallyAttribute(attributeText, attributeName) {
    const match = new RegExp(`${attributeName}="([^"]*)"`, "i").exec(attributeText || "");
    return cleanTallyText(match?.[1] || "");
  }

  // Finds <TAG ...>body</TAG> blocks, case-insensitive, in one pass over the text. A lazy
  // regex for the same thing restarts at every opening tag and scans to the end of the file
  // when no closing tag follows, which takes minutes on a crafted export. Here, once no
  // closing tag (or no ">") is left, no later opening tag can match either, so the search stops.
  function tallyTagBlocks(xmlText, tagName, limit = Infinity) {
    const text = String(xmlText || "");
    const openTag = new RegExp(`<${escapeRegex(tagName)}(?![\\w])`, "gi");
    const closeTag = new RegExp(`<\\/${escapeRegex(tagName)}>`, "gi");
    const blocks = [];
    let open;
    while (blocks.length < limit && (open = openTag.exec(text)) !== null) {
      const tagEnd = text.indexOf(">", open.index + open[0].length);
      if (tagEnd === -1) break;
      closeTag.lastIndex = tagEnd + 1;
      const close = closeTag.exec(text);
      if (!close) break;
      blocks.push({ attributes: text.slice(open.index + open[0].length, tagEnd), body: text.slice(tagEnd + 1, close.index) });
      openTag.lastIndex = close.index + close[0].length;
    }
    return blocks;
  }

  function tallyTagValue(xmlText, tagName) {
    return cleanTallyText(tallyTagBlocks(xmlText, tagName, 1)[0]?.body || "");
  }

  function tallyNestedTagValue(xmlText, listTag, childTag) {
    const block = tallyTagBlocks(xmlText, listTag, 1)[0];
    return block ? tallyTagValue(block.body, childTag) : "";
  }

  function tallyRepeatedTagValues(xmlText, tagName) {
    return tallyTagBlocks(xmlText, tagName).map((block) => cleanTallyText(block.body)).filter(Boolean);
  }

  function tallyAddress(xmlText) {
    return tallyRepeatedTagValues(xmlText, "ADDRESS").join(", ");
  }

  function uniqueBy(rows, keyFn) {
    const seen = new Set();
    return rows.filter((row) => {
      const key = keyFn(row);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function firstCompanyId(db) {
    return db.prepare("SELECT id FROM companies ORDER BY id LIMIT 1").get()?.id || 0;
  }

  function namedTallyBlocks(xmlText, tagName, limit = Infinity) {
    return tallyTagBlocks(xmlText, tagName, limit).map(({ attributes, body }) => ({ name: cleanTallyText(tallyAttribute(attributes, "NAME")), attributes, body }));
  }

  function uniqueByName(blocks) {
    const seen = new Set();
    return blocks.filter((block) => {
      const key = normalizeDuplicateKey(block.name);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function uniqueNamedTallyBlocks(xmlText, tagName) {
    return uniqueByName(namedTallyBlocks(xmlText, tagName));
  }

  // One count of masters for a preview, shared by every master kind. Reading stops as soon
  // as the count passes the limit, so a huge file of any kind is never copied in full.
  function tallyMasterBudget(limit, refusal) {
    let read = 0;
    const budget = {
      take(xmlText, tagName, unique = false) {
        const blocks = namedTallyBlocks(xmlText, tagName, limit - read + 1);
        read += blocks.length;
        if (read > limit) throw refusal();
        return unique ? uniqueByName(blocks) : blocks;
      },
      count(xmlText, tagName) {
        read += tallyTagBlocks(xmlText, tagName, limit - read + 1).length;
        if (read > limit) throw refusal();
      }
    };
    return budget;
  }

  function tallyPreviewTooLarge(message) {
    const error = new Error(message);
    error.code = "TALLY_PREVIEW_TOO_LARGE";
    return error;
  }

  function tallyGstRate(xmlText) {
    let igst = null;
    let cgst = null;
    let sgst = null;
    for (const { body } of tallyTagBlocks(xmlText, "RATEDETAILS.LIST")) {
      const dutyHead = tallyTagValue(body, "GSTRATEDUTYHEAD").toLowerCase();
      const rateValue = parseTallyNumber(tallyTagValue(body, "GSTRATE"));
      if (!Number.isFinite(rateValue)) continue;
      if (dutyHead.includes("integrated") || dutyHead === "igst") igst = rateValue;
      if (dutyHead.includes("central") || dutyHead === "cgst") cgst = rateValue;
      if (dutyHead.includes("state") || dutyHead === "sgst") sgst = rateValue;
    }
    if (Number.isFinite(igst)) return formatTallyRate(igst);
    if (Number.isFinite(cgst) || Number.isFinite(sgst)) return formatTallyRate((cgst || 0) + (sgst || 0));
    return "";
  }

  function readXmlText(filePath) {
    const buffer = fs.readFileSync(filePath);
    if (buffer[0] === 0xff && buffer[1] === 0xfe) return buffer.toString("utf16le").replace(/^\uFEFF/, "");
    if (buffer[0] === 0xfe && buffer[1] === 0xff) {
      const swapped = Buffer.alloc(buffer.length - 2);
      for (let index = 2; index < buffer.length; index += 2) {
        swapped[index - 2] = buffer[index + 1] || 0;
        swapped[index - 1] = buffer[index];
      }
      return swapped.toString("utf16le").replace(/^\uFEFF/, "");
    }
    return buffer.toString("utf8").replace(/^\uFEFF/, "");
  }

  function companyMatches(db, companyName, gstin, pan) {
    const params = [];
    const clauses = [];
    const notDeleted = columnExists(db, "companies", "is_deleted") ? "COALESCE(is_deleted, 0) = 0 AND " : "";
    if (String(companyName || "").trim()) {
      clauses.push("LOWER(company_name) = LOWER(?)");
      params.push(String(companyName).trim());
    }
    if (String(gstin || "").trim()) {
      clauses.push("gstin = ?");
      params.push(String(gstin).trim());
    }
    if (String(pan || "").trim()) {
      clauses.push("pan = ?");
      params.push(String(pan).trim());
    }
    if (!clauses.length) return [];
    return db.prepare(`SELECT id, company_name, gstin, pan FROM companies WHERE ${notDeleted}(${clauses.join(" OR ")}) ORDER BY id LIMIT 5`).all(...params);
  }

  function classifyTallyLedger(group, ledgerName = "") {
    const text = `${group} ${ledgerName}`.toLowerCase();
    if (text.includes("sundry creditor")) return { label: "Supplier / Vendor", master: "suppliers" };
    if (text.includes("sundry debtor")) return { label: "Government Department / Customer", master: "government_departments" };
    if (text.includes("bank account") || text.includes("bank od") || text.includes("bank occ")) return { label: "Bank Account", master: "banks" };
    if (text.includes("cash-in-hand") || text === "cash") return { label: "Cash Account", master: null };
    if (text.includes("direct expense") || text.includes("indirect expense") || text.includes("expense")) return { label: "Expense Head", master: "expense_heads" };
    if (text.includes("duties") || text.includes("tax")) return { label: "GST/TDS Ledger Reference", master: null };
    if (text.includes("sales account")) return { label: "Sales Ledger Reference", master: null };
    if (text.includes("purchase account")) return { label: "Purchase Ledger Reference", master: null };
    return { label: "Ledger Account Reference", master: null };
  }

  function ledgerImportPayload(master, source) {
    if (master === "suppliers") {
      return {
        supplier_name: source.ledgerName,
        supplier_type: "Tally Creditor",
        supplier_code: "",
        date_of_activation: "",
        supplier_account_name: source.ledgerName,
        supplier_account_number: source.accountNumber,
        supplier_bank_name: source.bankName,
        supplier_bank_ifsc_code: source.ifsc,
        supplier_branch: "",
        supplier_contact: source.contact,
        remarks: "Imported from Tally master migration",
        gstin: source.gstin,
        contact_details: [source.contact, source.address].filter(Boolean).join("; "),
        bank_details: [
          source.accountNumber ? `Account Number: ${source.accountNumber}` : "",
          source.bankName ? `Bank: ${source.bankName}` : "",
          source.ifsc ? `IFSC: ${source.ifsc}` : ""
        ].filter(Boolean).join("; "),
        status: "active"
      };
    }
    if (master === "government_departments") {
      return {
        department_name: source.ledgerName,
        contact_person: source.contact,
        contact_number: "",
        address: source.address,
        status: "active"
      };
    }
    if (master === "banks") {
      return {
        bank_account_name: source.ledgerName,
        bank_name: source.bankName || source.ledgerName,
        account_number: source.accountNumber,
        ifsc: source.ifsc,
        opening_balance: 0,
        status: "active"
      };
    }
    if (master === "expense_heads") {
      return {
        expense_head_name: source.ledgerName,
        default_calculation_method: "fixed",
        default_percentage: 0,
        category: "Imported from Tally",
        status: "active"
      };
    }
    return null;
  }

  function tallyCompanyCandidate(db, companyName, sourceFile, xmlBody = "") {
    const gstin = tallyTagValue(xmlBody, "GSTIN") || tallyTagValue(xmlBody, "PARTYGSTIN") || "";
    const pan = tallyTagValue(xmlBody, "INCOMETAXNUMBER") || tallyTagValue(xmlBody, "PANNO") || "";
    return {
      tally_company_name: cleanTallyText(companyName),
      gstin,
      pan,
      address: tallyAddress(xmlBody),
      source_file: sourceFile,
      existing_matches: companyMatches(db, companyName, gstin, pan),
      import_payload: {
        company_name: cleanTallyText(companyName),
        gstin,
        pan,
        address: tallyAddress(xmlBody),
        bank_name: "",
        account_number: "",
        ifsc: "",
        status: "active"
      }
    };
  }

  function tallyGodownCandidate(db, block, sourceFile) {
    const companyId = firstCompanyId(db);
    const payload = {
      company_id: companyId,
      warehouse_name: block.name,
      location: tallyTagValue(block.body, "ADDRESS") || block.name,
      warehouse_type: "Imported from Tally Godown",
      responsible_person: "",
      status: "active"
    };
    return {
      tally_godown_name: block.name,
      parent: tallyTagValue(block.body, "PARENT") || "",
      address: tallyAddress(block.body) || tallyTagValue(block.body, "ADDRESS") || "",
      suggested_master: "warehouses",
      source_file: sourceFile,
      duplicate_match: findMasterImportDuplicate(db, "warehouses", payload, companyId, previewDuplicateCache),
      import_payload: payload
    };
  }

  function tallyStockItemCandidate(db, item, sourceFile) {
    const payload = {
      item_name: item.item_name,
      brand: "",
      model: "",
      hsn_code: item.hsn_code || "",
      gst_rate: item.gst_rate || "",
      unit: item.unit || "",
      category: item.category || "Imported from Tally",
      inventory_enabled: "1",
      opening_stock: "",
      opening_rate: "",
      opening_value: "",
      valuation_method: item.valuation_method || "Weighted Average",
      status: "active"
    };
    const warnings = [...(item.warnings || [])];
    if (!payload.gst_rate) warnings.push("GST requires row-wise review before import");
    const failed = !payload.item_name || !payload.unit || item.import_status === "failed";
    const duplicate = findMasterImportDuplicate(db, "items", payload, firstCompanyId(db), previewDuplicateCache);
    return {
      ...item,
      source_file: sourceFile,
      suggested_master: "items",
      duplicate_match: duplicate,
      gst_review_status: payload.gst_rate ? "Ready" : "Needs Review",
      validation_status: failed ? "Failed" : duplicate || !payload.gst_rate || !payload.hsn_code ? "Needs Review" : "Ready",
      warnings,
      import_payload: payload
    };
  }

  function tallyLedgerCandidate(db, block, index, sourceFile) {
    const ledgerName = block.name;
    const group = tallyTagValue(block.body, "PARENT") || "";
    const classification = classifyTallyLedger(group, ledgerName);
    const gstin = tallyTagValue(block.body, "PARTYGSTIN") || tallyTagValue(block.body, "GSTIN") || "";
    const pan = tallyTagValue(block.body, "INCOMETAXNUMBER") || tallyTagValue(block.body, "PANNO") || "";
    const accountNumber = tallyTagValue(block.body, "BANKACCOUNTNUMBER") || tallyTagValue(block.body, "ACCOUNTNUMBER") || "";
    const ifsc = tallyTagValue(block.body, "IFSCODE") || tallyTagValue(block.body, "IFSCCODE") || "";
    const bankName = tallyTagValue(block.body, "BANKNAME") || tallyTagValue(block.body, "BANKDETAILS") || "";
    const contact = tallyTagValue(block.body, "LEDGERCONTACT") || tallyTagValue(block.body, "CONTACTPERSON") || tallyTagValue(block.body, "MOBILENO") || "";
    const openingBalance = tallyTagValue(block.body, "OPENINGBALANCE") || "";
    const address = tallyAddress(block.body);
    const payload = ledgerImportPayload(classification.master, {
      ledgerName, gstin, pan, address, contact, accountNumber, ifsc, bankName
    });
    const duplicate = payload ? findMasterImportDuplicate(db, classification.master, payload, firstCompanyId(db), previewDuplicateCache) : null;
    const warnings = [];
    if (!ledgerName) warnings.push("Missing ledger name");
    if (!classification.master) warnings.push("Ledger group needs manual mapping");
    if (openingBalance) warnings.push("Opening balance is reference-only in Stage 1");
    if (duplicate) warnings.push("Possible existing master match found");
    return {
      row_number: index + 1,
      tally_ledger_name: ledgerName,
      tally_group: group,
      suggested_gii_type: classification.label,
      suggested_master: classification.master || "manual_review",
      gstin, pan, contact_details: contact, address,
      bank_name: bankName, account_number: accountNumber, ifsc,
      opening_balance_reference: openingBalance,
      source_file: sourceFile,
      duplicate_match: duplicate,
      action: duplicate ? "Map Existing" : classification.master ? "Import" : "Needs Review",
      validation_status: !ledgerName ? "Failed" : duplicate || !classification.master ? "Needs Review" : "Ready",
      warnings, import_payload: payload
    };
  }

  function parseTallyStockItemsXml(xmlText, fileName = "", budget = null) {
    const sourceCompany = tallyTagValue(xmlText, "SVCURRENTCOMPANY") || tallyTagValue(xmlText, "COMPANYNAME") || "";
    const read = (tagName, unique) => (budget ? budget.take(xmlText, tagName, unique) : unique ? uniqueNamedTallyBlocks(xmlText, tagName) : namedTallyBlocks(xmlText, tagName));
    const units = read("UNIT", true).map((block) => ({
      name: block.name,
      formal_name: tallyTagValue(block.body, "ORIGINALNAME") || block.name,
      uqc: tallyTagValue(block.body, "GSTREPUQC") || ""
    }));
    const godowns = read("GODOWN", true).map((block) => ({
      name: block.name,
      parent: tallyTagValue(block.body, "PARENT") || "",
      address: tallyTagValue(block.body, "ADDRESS") || ""
    }));
    const stockGroups = read("STOCKGROUP", true).map((block) => ({ name: block.name }));
    const stockItemBlocks = read("STOCKITEM", false);
    const nameCounts = stockItemBlocks.reduce((counts, block) => {
      const key = normalizeDuplicateKey(block.name);
      counts.set(key, (counts.get(key) || 0) + 1);
      return counts;
    }, new Map());
    const validationErrors = [];
    const items = stockItemBlocks.map((block, index) => {
      const itemName = block.name;
      const unit = tallyTagValue(block.body, "BASEUNITS") || tallyTagValue(block.body, "ADDITIONALUNITS") || "";
      const category = tallyTagValue(block.body, "PARENT") || "";
      const hsnCode = tallyNestedTagValue(block.body, "HSNDETAILS.LIST", "HSNCODE") || tallyTagValue(block.body, "HSNCODE") || "";
      const gstRate = tallyGstRate(block.body);
      const openingQuantity = tallyTagValue(block.body, "OPENINGBALANCE") || "";
      const openingValue = tallyTagValue(block.body, "OPENINGVALUE") || "";
      const warehouse = tallyNestedTagValue(block.body, "BATCHALLOCATIONS.LIST", "GODOWNNAME") || "";
      const deleted = /^yes$/i.test(tallyAttribute(block.attributes, "RESERVEDNAME")) || /ACTION="Delete"/i.test(block.attributes);
      const duplicateInXml = nameCounts.get(normalizeDuplicateKey(itemName)) > 1;
      const warnings = [];
      if (!unit) warnings.push("Missing base unit");
      if (!hsnCode) warnings.push("Missing HSN/SAC code");
      if (gstRate === "") warnings.push("GST rate is blank or inherited in Tally");
      if (openingQuantity || openingValue) warnings.push("Opening stock/value found and kept for review; it will not post stock ledger entries");
      if (duplicateInXml) warnings.push("Duplicate stock item name exists inside this XML");
      const status = deleted ? "skipped" : duplicateInXml ? "duplicate" : !itemName || !unit ? "failed" : "ready";
      if (status === "failed") {
        validationErrors.push({ row: index + 1, status: "Failed", errors: warnings.filter((warning) => /Missing base unit|Missing item/i.test(warning)).length ? warnings : ["Missing item name or unit"] });
      } else if (status === "duplicate") {
        validationErrors.push({ row: index + 1, status: "Duplicate", errors: ["Duplicate stock item name exists inside this XML"] });
      } else if (warnings.length) {
        validationErrors.push({ row: index + 1, status: "Warning", errors: warnings });
      }
      return {
        row_number: index + 1, tally_item_name: itemName, item_name: itemName,
        unit, category, hsn_code: hsnCode, gst_rate: gstRate,
        gst_source: gstRate === "" ? "blank_or_inherited" : "explicit",
        costing_method: tallyTagValue(block.body, "COSTINGMETHOD") || "",
        valuation_method: tallyTagValue(block.body, "VALUATIONMETHOD") || "",
        opening_stock_qty: openingQuantity, opening_stock_value: openingValue,
        warehouse, deleted, duplicate_in_xml: duplicateInXml,
        import_status: status, warnings
      };
    });
    const activeItems = items.filter((item) => !item.deleted);
    const readyItems = activeItems.filter((item) => item.import_status === "ready");
    const failedItems = activeItems.filter((item) => item.import_status === "failed");
    const duplicateItems = activeItems.filter((item) => item.import_status === "duplicate");
    return {
      fileName, sourceCompany,
      totals: {
        units: units.length, stockGroups: stockGroups.length,
        godowns: godowns.length, stockItems: items.length,
        activeStockItems: activeItems.length,
        withHsn: activeItems.filter((item) => item.hsn_code).length,
        missingHsn: activeItems.filter((item) => !item.hsn_code).length,
        explicitGst: activeItems.filter((item) => item.gst_rate !== "").length,
        inheritedGst: activeItems.filter((item) => item.gst_rate === "").length,
        openingQtyRows: activeItems.filter((item) => item.opening_stock_qty).length,
        openingValueRows: activeItems.filter((item) => item.opening_stock_value).length,
        deletedRows: items.filter((item) => item.deleted).length
      },
      units, godowns, stockGroups, items,
      validation: {
        totalRows: activeItems.length, successfulRows: readyItems.length,
        failedRows: failedItems.length, skippedDuplicates: duplicateItems.length,
        warningRows: validationErrors.filter((item) => item.status === "Warning").length,
        errors: validationErrors
      }
    };
  }

  function previewTallyStockXml(filePath) {
    const extension = path.extname(filePath || "").toLowerCase();
    if (extension !== ".xml") throw new Error("Only Tally XML files are supported in this assistant");
    if (!fs.existsSync(filePath)) throw new Error("Tally XML file was not found");
    // The file is parsed in full on the app's main thread; the same limit as the migration preview.
    const bytes = fs.statSync(filePath).size;
    if (bytes > MAX_TALLY_PREVIEW_BYTES) {
      throw new Error(`Preview refused: ${path.basename(filePath)} is ${(bytes / 1024 / 1024).toFixed(1)} MB; one preview reads at most ${MAX_TALLY_PREVIEW_BYTES / 1024 / 1024} MB. In Tally, export the stock items in parts (for example by stock group) and preview each part.`);
    }
    const xmlText = readXmlText(filePath);
    // The same master budget as the migration preview, across units, godowns, stock groups and items.
    const budget = tallyMasterBudget(MAX_TALLY_PREVIEW_MASTERS, () => tallyPreviewTooLarge(`Preview refused: ${path.basename(filePath)} holds more than ${MAX_TALLY_PREVIEW_MASTERS.toLocaleString("en-IN")} masters (units, godowns, stock groups and stock items), more than one preview can show. In Tally, export the stock items in parts (for example by stock group) and preview each part.`));
    return parseTallyStockItemsXml(xmlText, path.basename(filePath), budget);
  }

  // Set for the length of one migration preview only (it reads, never writes), so the
  // duplicate check reads each master table once instead of once per ledger.
  let previewDuplicateCache = null;
  // Masters in one preview; each becomes a row in the reply the screen receives.
  const MAX_TALLY_PREVIEW_MASTERS = 100000;
  const MAX_TALLY_PREVIEW_SPREADSHEETS = 5;

  const MAX_TALLY_PREVIEW_FILES = 20;
  const MAX_TALLY_PREVIEW_BYTES = 50 * 1024 * 1024;

  function previewTallyMasterMigration(db, files = [], context = {}) {
    enforcePermission(db, "import", { ...context, module: "tally_migration_assistant", table_name: "imports" });
    // Each file is read and parsed in full, so the same file picked twice is read once and
    // one preview takes at most MAX_TALLY_PREVIEW_FILES files.
    const seen = new Set();
    const sourceFiles = (Array.isArray(files) ? files : []).filter((file) => {
      if (!file?.filePath) return false;
      const key = path.resolve(String(file.filePath));
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    if (!sourceFiles.length) throw new Error("Select at least one Tally export file for migration preview");
    if (sourceFiles.length > MAX_TALLY_PREVIEW_FILES) {
      throw new Error(`Preview refused: ${sourceFiles.length} files were selected; one preview reads at most ${MAX_TALLY_PREVIEW_FILES}. Preview them in smaller batches.`);
    }
    // Each file is parsed in full on the app's main thread, so the whole preview shares one
    // size budget of 50 MB.
    const totalBytes = sourceFiles.reduce((sum, file) => {
      try { return sum + fs.statSync(file.filePath).size; } catch { return sum; }
    }, 0);
    const largest = sourceFiles.map((file) => {
      try { return { name: path.basename(file.filePath), bytes: fs.statSync(file.filePath).size }; } catch { return { name: "", bytes: 0 }; }
    }).sort((a, b) => b.bytes - a.bytes)[0];
    if (largest && largest.bytes > MAX_TALLY_PREVIEW_BYTES) {
      throw new Error(`Preview refused: ${largest.name} is ${(largest.bytes / 1024 / 1024).toFixed(1)} MB; one preview reads at most ${MAX_TALLY_PREVIEW_BYTES / 1024 / 1024} MB. In Tally, export the masters in parts (for example ledgers and stock items separately) and preview each part.`);
    }
    if (totalBytes > MAX_TALLY_PREVIEW_BYTES) {
      throw new Error(`Preview refused: the selected files total ${(totalBytes / 1024 / 1024).toFixed(1)} MB; one preview reads at most ${MAX_TALLY_PREVIEW_BYTES / 1024 / 1024} MB. Preview them in smaller batches.`);
    }

    const aggregate = {
      companies: [], ledgers: [], ledgerGroups: [], units: [],
      stockGroups: [], godowns: [], stockItems: [],
      referenceFiles: [], errors: [], fileSummaries: []
    };

    const masterBudget = tallyMasterBudget(MAX_TALLY_PREVIEW_MASTERS, () => tallyPreviewTooLarge(`Preview refused: the selected files hold more than ${MAX_TALLY_PREVIEW_MASTERS.toLocaleString("en-IN")} masters (companies, groups, units, godowns, stock groups, ledgers and stock items), more than one preview can show. In Tally, export the masters in parts (for example ledgers and stock items separately) and preview each part.`));
    let spreadsheetsRead = 0;
    previewDuplicateCache = new Map();
    try {
    sourceFiles.forEach((file) => {
      const filePath = file.filePath;
      const fileName = path.basename(filePath || "");
      const extension = path.extname(fileName).toLowerCase();
      try {
        if (!fs.existsSync(filePath)) throw new Error("File not found");
        if (extension === ".xml") {
          const xmlText = readXmlText(filePath);
          const sourceCompany = tallyTagValue(xmlText, "SVCURRENTCOMPANY") || tallyTagValue(xmlText, "COMPANYNAME") || "";
          if (sourceCompany) aggregate.companies.push(tallyCompanyCandidate(db, sourceCompany, fileName));
          const take = (tagName, unique) => masterBudget.take(xmlText, tagName, unique);
          take("COMPANY").forEach((block) => {
            const name = block.name || tallyTagValue(block.body, "NAME") || tallyTagValue(block.body, "COMPANYNAME");
            if (name) aggregate.companies.push(tallyCompanyCandidate(db, name, fileName, block.body));
          });
          take("GROUP", true).forEach((block) => aggregate.ledgerGroups.push({ name: block.name, parent: tallyTagValue(block.body, "PARENT") || "", source_file: fileName }));
          take("UNIT", true).forEach((block) => aggregate.units.push({
            name: block.name, formal_name: tallyTagValue(block.body, "ORIGINALNAME") || block.name,
            uqc: tallyTagValue(block.body, "GSTREPUQC") || "", source_file: fileName
          }));
          take("GODOWN", true).forEach((block) => aggregate.godowns.push(tallyGodownCandidate(db, block, fileName)));
          take("STOCKGROUP", true).forEach((block) => aggregate.stockGroups.push({ name: block.name, parent: tallyTagValue(block.body, "PARENT") || "", source_file: fileName }));
          const ledgerBlocks = take("LEDGER");
          masterBudget.count(xmlText, "STOCKITEM");
          ledgerBlocks.forEach((block, index) => aggregate.ledgers.push(tallyLedgerCandidate(db, block, index, fileName)));
          const stockPreview = parseTallyStockItemsXml(xmlText, fileName);
          stockPreview.items.forEach((item) => aggregate.stockItems.push(tallyStockItemCandidate(db, item, fileName)));
          aggregate.fileSummaries.push({ file_name: fileName, file_type: file.type || "Tally XML", row_count: stockPreview.items.length + aggregate.ledgers.filter((row) => row.source_file === fileName).length, status: "Previewed" });
        } else if ([".csv", ".xlsx", ".xls"].includes(extension)) {
          // Spreadsheets are reference only (the preview shows 50 rows of each), yet each is
          // parsed in full on the main thread; a few per preview is plenty.
          spreadsheetsRead += 1;
          if (spreadsheetsRead > MAX_TALLY_PREVIEW_SPREADSHEETS) {
            throw new Error(`Skipped: one preview reads at most ${MAX_TALLY_PREVIEW_SPREADSHEETS} spreadsheet reference files. Preview the rest in another batch.`);
          }
          const rows = parseImportFile(filePath);
          aggregate.referenceFiles.push({ file_name: fileName, file_type: file.type || extension.slice(1).toUpperCase(), rows: rows.slice(0, 50), row_count: rows.length, reference_only: true });
          aggregate.fileSummaries.push({ file_name: fileName, file_type: file.type || "Reference", row_count: rows.length, status: "Reference only" });
        } else {
          throw new Error("Unsupported file type");
        }
      } catch (error) {
        if (error?.code === "TALLY_PREVIEW_TOO_LARGE") throw error;
        aggregate.errors.push({ file_name: fileName, error: error.message || "Unable to parse file" });
        aggregate.fileSummaries.push({ file_name: fileName, file_type: file.type || extension, row_count: 0, status: "Failed" });
      }
    });
    } finally {
      previewDuplicateCache = null;
    }

    aggregate.companies = uniqueBy(aggregate.companies, (row) => normalizeDuplicateKey(row.tally_company_name));
    aggregate.ledgerGroups = uniqueBy(aggregate.ledgerGroups, (row) => normalizeDuplicateKey(row.name));
    aggregate.units = uniqueBy(aggregate.units, (row) => normalizeDuplicateKey(row.name));
    aggregate.stockGroups = uniqueBy(aggregate.stockGroups, (row) => normalizeDuplicateKey(row.name));
    aggregate.godowns = uniqueBy(aggregate.godowns, (row) => normalizeDuplicateKey(row.tally_godown_name));
    aggregate.ledgers = uniqueBy(aggregate.ledgers, (row) => normalizeDuplicateKey(row.tally_ledger_name));
    aggregate.stockItems = uniqueBy(aggregate.stockItems, (row) => normalizeDuplicateKey(row.item_name));

    const failedRows = aggregate.errors.length +
      aggregate.ledgers.filter((row) => row.validation_status === "Failed").length +
      aggregate.stockItems.filter((row) => row.validation_status === "Failed").length;
    const warningRows = aggregate.ledgers.filter((row) => row.validation_status === "Needs Review").length +
      aggregate.stockItems.filter((row) => row.validation_status === "Needs Review").length;
    const duplicateRows = aggregate.ledgers.filter((row) => row.duplicate_match).length +
      aggregate.stockItems.filter((row) => row.duplicate_match).length +
      aggregate.godowns.filter((row) => row.duplicate_match).length;

    return {
      source_system: "Tally Prime",
      stage: "Stage 1 - Master Migration",
      generated_at: new Date().toISOString(),
      ...aggregate,
      totals: {
        files: sourceFiles.length, companies: aggregate.companies.length,
        ledgerGroups: aggregate.ledgerGroups.length, ledgers: aggregate.ledgers.length,
        suppliers: aggregate.ledgers.filter((row) => row.suggested_master === "suppliers").length,
        departments: aggregate.ledgers.filter((row) => row.suggested_master === "government_departments").length,
        banks: aggregate.ledgers.filter((row) => row.suggested_master === "banks").length,
        expenseHeads: aggregate.ledgers.filter((row) => row.suggested_master === "expense_heads").length,
        units: aggregate.units.length, stockGroups: aggregate.stockGroups.length,
        warehouses: aggregate.godowns.length, items: aggregate.stockItems.length,
        itemMissingGst: aggregate.stockItems.filter((row) => !String(row.gst_rate || "").trim()).length,
        itemMissingHsn: aggregate.stockItems.filter((row) => !String(row.hsn_code || "").trim()).length,
        openingStockReferenceRows: aggregate.stockItems.filter((row) => row.opening_stock_qty || row.opening_stock_value).length,
        duplicateRows, warningRows, failedRows
      }
    };
  }

  return {
    cleanTallyText,
    previewTallyStockXml, previewTallyMasterMigration
  };
}
