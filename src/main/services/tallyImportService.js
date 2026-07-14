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

  function tallyTagValue(xmlText, tagName) {
    const match = new RegExp(`<${escapeRegex(tagName)}\\b[^>]*>([\\s\\S]*?)<\\/${escapeRegex(tagName)}>`, "i").exec(xmlText || "");
    return cleanTallyText(match?.[1] || "");
  }

  function tallyNestedTagValue(xmlText, listTag, childTag) {
    const match = new RegExp(`<${escapeRegex(listTag)}\\b[^>]*>([\\s\\S]*?)<\\/${escapeRegex(listTag)}>`, "i").exec(xmlText || "");
    return match ? tallyTagValue(match[1], childTag) : "";
  }

  function tallyRepeatedTagValues(xmlText, tagName) {
    const pattern = new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "gi");
    return [...String(xmlText || "").matchAll(pattern)].map((match) => cleanTallyText(match[1])).filter(Boolean);
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

  function namedTallyBlocks(xmlText, tagName) {
    const pattern = new RegExp(`<${tagName}\\b([^>]*)>([\\s\\S]*?)<\\/${tagName}>`, "gi");
    const blocks = [];
    let match;
    while ((match = pattern.exec(xmlText)) !== null) {
      const attributes = match[1] || "";
      const body = match[2] || "";
      const name = cleanTallyText(tallyAttribute(attributes, "NAME"));
      blocks.push({ name, attributes, body });
    }
    return blocks;
  }

  function uniqueNamedTallyBlocks(xmlText, tagName) {
    const seen = new Set();
    return namedTallyBlocks(xmlText, tagName).filter((block) => {
      const key = normalizeDuplicateKey(block.name);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function tallyGstRate(xmlText) {
    const pattern = /<RATEDETAILS\.LIST\b[^>]*>([\s\S]*?)<\/RATEDETAILS\.LIST>/gi;
    let igst = null;
    let cgst = null;
    let sgst = null;
    let match;
    while ((match = pattern.exec(xmlText || "")) !== null) {
      const body = match[1] || "";
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
      duplicate_match: findMasterImportDuplicate(db, "warehouses", payload, companyId),
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
    const duplicate = findMasterImportDuplicate(db, "items", payload, firstCompanyId(db));
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
    const duplicate = payload ? findMasterImportDuplicate(db, classification.master, payload, firstCompanyId(db)) : null;
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

  function parseTallyStockItemsXml(xmlText, fileName = "") {
    const sourceCompany = tallyTagValue(xmlText, "SVCURRENTCOMPANY") || tallyTagValue(xmlText, "COMPANYNAME") || "";
    const units = uniqueNamedTallyBlocks(xmlText, "UNIT").map((block) => ({
      name: block.name,
      formal_name: tallyTagValue(block.body, "ORIGINALNAME") || block.name,
      uqc: tallyTagValue(block.body, "GSTREPUQC") || ""
    }));
    const godowns = uniqueNamedTallyBlocks(xmlText, "GODOWN").map((block) => ({
      name: block.name,
      parent: tallyTagValue(block.body, "PARENT") || "",
      address: tallyTagValue(block.body, "ADDRESS") || ""
    }));
    const stockGroups = uniqueNamedTallyBlocks(xmlText, "STOCKGROUP").map((block) => ({ name: block.name }));
    const stockItemBlocks = namedTallyBlocks(xmlText, "STOCKITEM");
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
    const xmlText = readXmlText(filePath);
    return parseTallyStockItemsXml(xmlText, path.basename(filePath));
  }

  function previewTallyMasterMigration(db, files = [], context = {}) {
    enforcePermission(db, "import", { ...context, module: "tally_migration_assistant", table_name: "imports" });
    const sourceFiles = Array.isArray(files) ? files.filter((file) => file?.filePath) : [];
    if (!sourceFiles.length) throw new Error("Select at least one Tally export file for migration preview");

    const aggregate = {
      companies: [], ledgers: [], ledgerGroups: [], units: [],
      stockGroups: [], godowns: [], stockItems: [],
      referenceFiles: [], errors: [], fileSummaries: []
    };

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
          namedTallyBlocks(xmlText, "COMPANY").forEach((block) => {
            const name = block.name || tallyTagValue(block.body, "NAME") || tallyTagValue(block.body, "COMPANYNAME");
            if (name) aggregate.companies.push(tallyCompanyCandidate(db, name, fileName, block.body));
          });
          uniqueNamedTallyBlocks(xmlText, "GROUP").forEach((block) => aggregate.ledgerGroups.push({ name: block.name, parent: tallyTagValue(block.body, "PARENT") || "", source_file: fileName }));
          uniqueNamedTallyBlocks(xmlText, "UNIT").forEach((block) => aggregate.units.push({
            name: block.name, formal_name: tallyTagValue(block.body, "ORIGINALNAME") || block.name,
            uqc: tallyTagValue(block.body, "GSTREPUQC") || "", source_file: fileName
          }));
          uniqueNamedTallyBlocks(xmlText, "GODOWN").forEach((block) => aggregate.godowns.push(tallyGodownCandidate(db, block, fileName)));
          uniqueNamedTallyBlocks(xmlText, "STOCKGROUP").forEach((block) => aggregate.stockGroups.push({ name: block.name, parent: tallyTagValue(block.body, "PARENT") || "", source_file: fileName }));
          namedTallyBlocks(xmlText, "LEDGER").forEach((block, index) => aggregate.ledgers.push(tallyLedgerCandidate(db, block, index, fileName)));
          const stockPreview = parseTallyStockItemsXml(xmlText, fileName);
          stockPreview.items.forEach((item) => aggregate.stockItems.push(tallyStockItemCandidate(db, item, fileName)));
          aggregate.fileSummaries.push({ file_name: fileName, file_type: file.type || "Tally XML", row_count: stockPreview.items.length + aggregate.ledgers.filter((row) => row.source_file === fileName).length, status: "Previewed" });
        } else if ([".csv", ".xlsx", ".xls"].includes(extension)) {
          const rows = parseImportFile(filePath);
          aggregate.referenceFiles.push({ file_name: fileName, file_type: file.type || extension.slice(1).toUpperCase(), rows: rows.slice(0, 50), row_count: rows.length, reference_only: true });
          aggregate.fileSummaries.push({ file_name: fileName, file_type: file.type || "Reference", row_count: rows.length, status: "Reference only" });
        } else {
          throw new Error("Unsupported file type");
        }
      } catch (error) {
        aggregate.errors.push({ file_name: fileName, error: error.message || "Unable to parse file" });
        aggregate.fileSummaries.push({ file_name: fileName, file_type: file.type || extension, row_count: 0, status: "Failed" });
      }
    });

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
