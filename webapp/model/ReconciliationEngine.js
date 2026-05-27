sap.ui.define([], function () {
    "use strict";

    function normalizeKeyPart(value) {
        return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "").trim();
    }

    function normalizeDate(value) {
        if (!value && value !== 0) {
            return "";
        }

        if (value instanceof Date && !isNaN(value)) {
            return value.toISOString().slice(0, 10);
        }

        if (typeof value === "number") {
            var date = new Date((value - 25569) * 86400 * 1000);
            if (!isNaN(date)) {
                return date.toISOString().slice(0, 10);
            }
        }

        var text = String(value).trim();
        if (!text) {
            return "";
        }

        text = text.replace(/\s+/g, " ").split(" ")[0];
        text = text.replace(/\./g, "-").replace(/\//g, "-");

        var numeric8 = /^\d{8}$/;
        if (numeric8.test(text)) {
            var year = text.slice(0, 4);
            var month = text.slice(4, 6);
            var day = text.slice(6, 8);
            if (+month >= 1 && +month <= 12 && +day >= 1 && +day <= 31) {
                return year + "-" + month + "-" + day;
            }
            year = text.slice(4, 8);
            month = text.slice(2, 4);
            day = text.slice(0, 2);
            return year + "-" + month + "-" + day;
        }

        var numeric6 = /^\d{6}$/;
        if (numeric6.test(text)) {
            return "20" + text.slice(0, 2) + "-" + text.slice(2, 4) + "-" + text.slice(4, 6);
        }

        if (text.indexOf("-") > -1) {
            var dashParts = text.split("-");
            if (dashParts.length === 3) {
                var a = parseInt(dashParts[0], 10);
                var b = parseInt(dashParts[1], 10);
                var c = parseInt(dashParts[2], 10);

                if (dashParts[0].length === 4) {
                    return dashParts[0] + "-" + dashParts[1].padStart(2, "0") + "-" + dashParts[2].padStart(2, "0");
                }
                if (dashParts[2].length === 4) {
                    if (a > 12) {
                        return dashParts[2] + "-" + dashParts[1].padStart(2, "0") + "-" + dashParts[0].padStart(2, "0");
                    }
                    if (b > 12) {
                        return dashParts[2] + "-" + dashParts[0].padStart(2, "0") + "-" + dashParts[1].padStart(2, "0");
                    }
                    return dashParts[2] + "-" + dashParts[1].padStart(2, "0") + "-" + dashParts[0].padStart(2, "0");
                }
            }
        }

        var parsed = Date.parse(text);
        if (!isNaN(parsed)) {
            return new Date(parsed).toISOString().slice(0, 10);
        }

        return text;
    }

    function getKey(r) {
        return `${normalizeKeyPart(r.gstin)}|${normalizeKeyPart(r.invoice)}|${normalizeDate(r.date)}`;
    }

    function getPeriod(date) {
        if (!date) return "Unknown";
        return date.substring(0, 7); // YYYY-MM
    }

    function chooseBestMatch(source, candidates) {
        if (!candidates || !candidates.length) {
            return null;
        }

        var best = candidates[0];
        var bestScore = Number.MAX_VALUE;

        candidates.forEach(function (candidate) {
            var taxableDiff = Math.abs(source.taxable - candidate.taxable);
            var gstDiff = Math.abs(source.gst - candidate.gst);
            var score = taxableDiff + gstDiff;

            if (score < bestScore) {
                bestScore = score;
                best = candidate;
            }
        });

        return best;
    }

    function run(sapData, gstData) {

        let gstMap = new Map();
        let invoiceMap = new Map();

        gstData.forEach(g => {
            gstMap.set(getKey(g), g);
            let invoiceKey = `${normalizeKeyPart(g.gstin)}|${normalizeKeyPart(g.invoice)}`;
            let list = invoiceMap.get(invoiceKey) || [];
            list.push(g);
            invoiceMap.set(invoiceKey, list);
        });

        let result = [];

        let summary = {
            total: 0,
            matched: 0,
            missing: 0,
            mismatch: 0
        };

        sapData.forEach(s => {

            let key = getKey(s);
            let g = gstMap.get(key);
            let matchedByInvoice = false;

            if (!g) {
                let invoiceKey = `${normalizeKeyPart(s.gstin)}|${normalizeKeyPart(s.invoice)}`;
                let candidates = invoiceMap.get(invoiceKey) || [];
                if (candidates.length) {
                    g = chooseBestMatch(s, candidates);
                    matchedByInvoice = true;
                }
            }

            let record = {
                gstin: s.gstin,
                invoice: s.invoice,
                date: s.date,
                period: getPeriod(s.date),

                sapTaxable: s.taxable,
                sapGst: s.gst,

                gstTaxable: g ? g.taxable : 0,
                gstGst: g ? g.gst : 0,

                taxableDiff: 0,
                gstDiff: 0,
                status: "",
                risk: "",
                details: ""
            };

            if (!g) {
                record.status = "Missing";
                record.risk = "High";
                record.details = `Missing GST invoice for GSTIN ${record.gstin} / invoice ${record.invoice}.`;
                summary.missing++;
            } else {
                record.taxableDiff = record.sapTaxable - record.gstTaxable;
                record.gstDiff = record.sapGst - record.gstGst;

                if (Math.abs(record.gstDiff) === 0 && Math.abs(record.taxableDiff) === 0) {
                    record.status = "Matched";
                    record.risk = "Low";
                    record.details = matchedByInvoice
                        ? `Exact amounts matched after date normalization for invoice ${record.invoice}.`
                        : "Amounts match exactly.";
                    summary.matched++;
                } else {
                    record.status = "Mismatch";
                    record.risk = Math.abs(record.gstDiff) <= 1 ? "Medium" : "High";
                    record.details = matchedByInvoice
                        ? `Matched by GSTIN+invoice with date variation. GST variance ₹${record.gstDiff.toFixed(2)}; Taxable variance ₹${record.taxableDiff.toFixed(2)}.`
                        : `GST variance ₹${record.gstDiff.toFixed(2)}; Taxable variance ₹${record.taxableDiff.toFixed(2)}.`;
                    summary.mismatch++;
                }
            }

            summary.total++;
            result.push(record);
        });

        return {
            data: result,
            summary: summary
        };
    }

    return {
        run: run
    };
});