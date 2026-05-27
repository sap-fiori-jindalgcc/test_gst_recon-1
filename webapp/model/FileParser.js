sap.ui.define([
    "sap/m/MessageToast"
], function (MessageToast) {
    "use strict";

    function normalizeHeader(text) {
        return text.toLowerCase().replace(/[^a-z0-9]/g, "").trim();
    }

    const FIELD_KEYWORDS = {
        gstin: ["suppliergst", "suppliergstin", "ctin", "gstin", "gstno", "gstnumber", "gstn", "gstid", "companygst", "companygstin", "vendorgst", "vendorgstin", "customergst", "customergstin"],
        invoice: ["invoice", "inv", "bill", "doc", "invoiceno", "invoice_no", "invoice number", "documentno", "documentnumber", "billno", "invno", "invoiceid"],
        date: ["date", "invdate", "postingdate", "idt", "documentdate", "issuedate", "billdate", "invoice date", "dateofinvoice", "invdt"],
        taxable: ["taxable", "value", "amount", "txval", "taxablevalue", "taxableamt", "taxableamount", "netvalue", "netamount", "assessablevalue"],
        gst: ["gstamount", "taxamount", "igst", "cgst", "sgst", "totalgst", "gstamt", "amountgst", "igstamt", "cgstamt", "sgstamt"]
    };

    function detectColumns(headers) {
        let mapping = {
            gstin: "",
            invoice: "",
            date: "",
            taxable: "",
            gst: "",
            gstComponents: [],
            taxableComponents: []
        };

        let gstinPriority = ["suppliergst", "suppliergstin", "ctin", "gstin", "gstno", "gstnumber", "gstn", "gstid", "companygst", "companygstin", "vendorgst", "vendorgstin", "customergst", "customergstin"];
        let currentGstinScore = Number.MAX_VALUE;

        headers.forEach(header => {
            let norm = normalizeHeader(header);

            if (/cgst|sgst|igst/.test(norm)) {
                mapping.gstComponents.push(header);
            }
            if (/taxable|netvalue|taxableamt|taxablevalue|amount|value/.test(norm) && !mapping.taxable) {
                mapping.taxableComponents.push(header);
            }

            Object.keys(FIELD_KEYWORDS).forEach(field => {
                FIELD_KEYWORDS[field].forEach(keyword => {
                    if (!norm.includes(keyword)) {
                        return;
                    }

                    if (field === "gstin") {
                        let score = gstinPriority.indexOf(keyword);
                        if (score === -1) {
                            score = gstinPriority.length;
                        }
                        if (score < currentGstinScore) {
                            mapping.gstin = header;
                            currentGstinScore = score;
                        }
                        return;
                    }

                    if (!mapping[field]) {
                        mapping[field] = header;
                    }
                });
            });
        });

        if (!mapping.gst && mapping.gstComponents.length === 1) {
            mapping.gst = mapping.gstComponents[0];
        }
        if (!mapping.taxable && mapping.taxableComponents.length === 1) {
            mapping.taxable = mapping.taxableComponents[0];
        }

        return mapping;
    }

    // ✅ DATE NORMALIZATION (CRITICAL FIX)
    function pad(value) {
        return String(value).padStart(2, "0");
    }

    function parseNumber(value) {
        let text = String(value || "").replace(/,/g, "").trim();
        let number = parseFloat(text);
        return isNaN(number) ? 0 : number;
    }

    function formatDate(d) {
        if (!d && d !== 0) {
            return "";
        }

        if (d instanceof Date && !isNaN(d)) {
            return d.toISOString().slice(0, 10);
        }

        if (typeof d === "number") {
            let date = new Date((d - 25569) * 86400 * 1000);
            if (!isNaN(date)) {
                return date.toISOString().slice(0, 10);
            }
        }

        let text = String(d).trim();
        if (!text) {
            return "";
        }

        text = text.replace(/\s+/g, " ").split(" ")[0];
        text = text.replace(/\./g, "-").replace(/\//g, "-");

        if (/^\d{8}$/.test(text)) {
            let year = text.slice(0, 4);
            let month = text.slice(4, 6);
            let day = text.slice(6, 8);
            if (+month >= 1 && +month <= 12 && +day >= 1 && +day <= 31) {
                return `${year}-${month}-${day}`;
            }
            year = text.slice(4, 8);
            month = text.slice(2, 4);
            day = text.slice(0, 2);
            return `${year}-${month}-${day}`;
        }

        if (/^\d{6}$/.test(text)) {
            return `20${text.slice(0, 2)}-${text.slice(2, 4)}-${text.slice(4, 6)}`;
        }

        let parts = text.split("-");
        if (parts.length === 3) {
            let a = +parts[0];
            let b = +parts[1];
            let c = +parts[2];

            if (parts[0].length === 4) {
                return `${parts[0]}-${pad(parts[1])}-${pad(parts[2])}`;
            }

            if (parts[2].length === 4) {
                if (a > 12) {
                    return `${parts[2]}-${pad(b)}-${pad(a)}`;
                }
                if (b > 12) {
                    return `${parts[2]}-${pad(a)}-${pad(b)}`;
                }
                return `${parts[2]}-${pad(b)}-${pad(a)}`;
            }
        }

        let parsed = Date.parse(text);
        if (!isNaN(parsed)) {
            return new Date(parsed).toISOString().slice(0, 10);
        }

        return text;
    }

    function excelToJson(file, callback) {
        let reader = new FileReader();

        reader.onload = function (e) {
            let data = new Uint8Array(e.target.result);
            let workbook = XLSX.read(data, { type: "array" });

            let allData = [];

            workbook.SheetNames.forEach(sheetName => {
                let sheet = workbook.Sheets[sheetName];
                let json = XLSX.utils.sheet_to_json(sheet, { defval: "" });
                allData = allData.concat(json);
            });

            callback(allData);
        };

        reader.readAsArrayBuffer(file);
    }

    function csvToJson(file, callback) {
        let reader = new FileReader();

        reader.onload = function (e) {
            let text = e.target.result;
            let lines = text.split("\n");

            let headers = lines[0].split(",");

            let data = lines.slice(1).map(line => {
                let values = line.split(",");
                let obj = {};

                headers.forEach((h, i) => {
                    obj[h.trim()] = values[i] ? values[i].trim() : "";
                });

                return obj;
            });

            callback(data);
        };

        reader.readAsText(file);
    }

    const GST_JSON_SUPPLIER_KEYS = ["b2b", "b2bur", "b2ba", "data", "suppliers", "invoices"];
    const GST_JSON_INVOICE_KEYS = ["inv", "inum", "invoice", "invoiceno", "inumber", "bill", "doc", "number"];
    const GST_JSON_GSTIN_KEYS = ["ctin", "gstin", "suppliergst", "gstno", "gstnumber"];
    const GST_JSON_DATE_KEYS = ["idt", "invdate", "postingdate", "date", "issuedate", "billdate", "docdate"];
    const GST_JSON_TAXABLE_KEYS = ["txval", "val", "amount", "taxablevalue", "taxableamt", "netvalue"];
    const GST_JSON_GST_KEYS = ["igst", "cgst", "sgst", "gstamount", "taxamount", "totalgst", "tax"];

    function findFirstKey(obj, keys) {
        if (!obj || typeof obj !== "object") {
            return null;
        }
        let lowerKeys = Object.keys(obj).reduce((map, key) => {
            map[key.toLowerCase()] = key;
            return map;
        }, {});

        for (let key of keys) {
            let lower = key.toLowerCase();
            if (lowerKeys[lower]) {
                return lowerKeys[lower];
            }
        }
        return null;
    }

    function readInvoiceObject(inv, gstinOverride) {
        let gstinKey = findFirstKey(inv, GST_JSON_GSTIN_KEYS) || "gstin";
        let invoiceKey = findFirstKey(inv, GST_JSON_INVOICE_KEYS) || "inum";
        let dateKey = findFirstKey(inv, GST_JSON_DATE_KEYS) || "idt";
        let taxableKey = findFirstKey(inv, GST_JSON_TAXABLE_KEYS) || "txval";
        let gstKey = findFirstKey(inv, GST_JSON_GST_KEYS) || null;

        let gstin = gstinOverride || inv[gstinKey] || "";
        let invoice = inv[invoiceKey] || inv["inum"] || inv["invoice"] || "";
        let taxable = parseNumber(inv[taxableKey] || inv["txval"] || inv["val"] || inv["amount"] || 0);

        let gst = 0;
        if (gstKey && inv[gstKey] !== undefined) {
            gst = parseNumber(inv[gstKey]);
        } else {
            gst = parseNumber(inv.igst) + parseNumber(inv.cgst) + parseNumber(inv.sgst);
        }

        return {
            gstin: gstin,
            invoice: invoice,
            date: formatDate(inv[dateKey] || inv["idt"] || inv["date"] || ""),
            taxable: taxable,
            gst: gst
        };
    }

    function flattenJsonArray(json) {
        if (!json || typeof json !== "object") {
            return [];
        }

        if (Array.isArray(json)) {
            return json;
        }

        let arrays = [];
        GST_JSON_SUPPLIER_KEYS.forEach(key => {
            let actualKey = findFirstKey(json, [key]);
            if (!actualKey) {
                return;
            }
            let value = json[actualKey];
            if (Array.isArray(value)) {
                arrays.push(value);
            } else if (value && typeof value === "object") {
                if (Array.isArray(value.inv) || Array.isArray(value.invoices)) {
                    return arrays.push([value]);
                }
            }
        });

        if (!arrays.length) {
            Object.keys(json).forEach(key => {
                if (Array.isArray(json[key])) {
                    arrays.push(json[key]);
                }
            });
        }

        if (arrays.length) {
            return arrays[0];
        }

        if (Array.isArray(json.inv) || Array.isArray(json.invoices) || Array.isArray(json.b2b)) {
            return [json];
        }

        if (json.inv && Array.isArray(json.inv)) {
            return [json];
        }

        return [];
    }

    function getInvoiceItems(item) {
        if (!item || typeof item !== "object") {
            return [];
        }

        if (Array.isArray(item.inv)) {
            return item.inv;
        }
        if (Array.isArray(item.invoices)) {
            return item.invoices;
        }
        if (item.inv && typeof item.inv === "object") {
            return [item.inv];
        }
        if (item.invoice && typeof item.invoice === "object") {
            return [item];
        }
        if (item.inum && typeof item.inum === "object") {
            return [item];
        }

        return [];
    }

    function parseGSTJson(json) {
        let result = [];
        if (!json) {
            return result;
        }

        let topArray = flattenJsonArray(json);

        topArray.forEach(item => {
            if (!item || typeof item !== "object") {
                return;
            }

            let supplierGstin = null;
            let supplierGstinKey = findFirstKey(item, GST_JSON_GSTIN_KEYS);
            if (supplierGstinKey) {
                supplierGstin = item[supplierGstinKey];
            }

            let invoices = getInvoiceItems(item);
            if (invoices.length) {
                let gstin = supplierGstin || item.ctin || item.gstin || item.suppliergst || item.gstno || item.gstnumber || "";
                invoices.forEach(inv => {
                    result.push(readInvoiceObject(inv, gstin));
                });
            } else if (item.inum || item.invoice || item.doc || item.number) {
                result.push(readInvoiceObject(item, supplierGstin));
            }
        });

        if (!result.length && Array.isArray(json)) {
            json.forEach(item => {
                if (item && typeof item === "object") {
                    result.push(readInvoiceObject(item));
                }
            });
        }

        return result.filter(r => r.gstin && r.invoice);
    }

    function parseFile(file, type, model) {
        let name = file.name.toLowerCase();

        if (name.endsWith(".json")) {
            let reader = new FileReader();

            reader.onload = function (e) {
                let json = JSON.parse(e.target.result);
                let data = parseGSTJson(json);

                model.setProperty("/" + type + "Data", data);
                model.setProperty("/upload/" + type + "Raw", data);
                model.setProperty("/upload/" + type + "Columns", []);
                model.setProperty("/mapping/" + type, {
                    gstin: "", invoice: "", date: "", taxable: "", gst: ""
                });
                if (!data.length) {
                    MessageToast.show("GST JSON parsed, but no invoice entries were detected. Check JSON structure and field names.");
                } else {
                    MessageToast.show("GST JSON parsed: " + data.length + " invoices detected.");
                }
            };

            reader.readAsText(file);
            return;
        }

        if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
            if (typeof XLSX === "undefined") {
                MessageToast.show("Excel parser not available. Check bootstrap script.");
                return;
            }
            excelToJson(file, raw => processRaw(raw, type, model));
            return;
        }

        if (name.endsWith(".csv")) {
            csvToJson(file, raw => processRaw(raw, type, model));
            return;
        }

        MessageToast.show("Unsupported format");
    }

    function processRaw(rawData, type, model) {
        if (!rawData.length) {
            MessageToast.show("Empty file");
            return;
        }

        let headers = Object.keys(rawData[0]);
        let mapping = detectColumns(headers);

        model.setProperty("/" + type + "Data", rawData);
        model.setProperty("/upload/" + type + "Raw", rawData);
        model.setProperty("/upload/" + type + "Columns", headers);
        model.setProperty("/mapping/" + type, mapping);

        MessageToast.show(type.toUpperCase() + " processed");
    }

    return {
        parseFile: parseFile
    };
});
