sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "sap/m/Dialog",
    "sap/m/Button",
    "sap/m/VBox",
    "sap/m/HBox",
    "sap/m/Text",
    "sap/m/Title",
    "sap/m/ObjectStatus",
    "gstr/testgstrecon/model/ReconciliationEngine",
    "gstr/testgstrecon/model/FileParser"
], function (
    Controller,
    Filter,
    FilterOperator,
    MessageToast,
    MessageBox,
    Dialog,
    Button,
    VBox,
    HBox,
    Text,
    Title,
    ObjectStatus,
    ReconciliationEngine,
    FileParser
) {
    "use strict";

    return Controller.extend("gstr.testgstrecon.controller.Home", {

        // ================= INIT =================
        onInit: function () {
            this.oModel = this.getOwnerComponent().getModel("appModel");
        },

        // ================= RESULT RESET =================
        _resetResult: function () {
            this.oModel.setProperty("/result", []);
            this.oModel.setProperty("/summary", {
                total: 0, matched: 0, missing: 0, mismatch: 0
            });
            this.oModel.setProperty("/chart", []);
            this.oModel.setProperty("/insights", []);
        },

        // ================= FILE UPLOAD =================
        onSapBrowse: function () {
            var oUploader = this.byId("sapUploader");
            var $input = oUploader.$().find("input[type='file']");
            if ($input.length) {
                $input[0].click();
                return;
            }
            if (oUploader.openFileDialog) {
                oUploader.openFileDialog();
            }
        },

        onGstBrowse: function () {
            var oUploader = this.byId("gstUploader");
            var $input = oUploader.$().find("input[type='file']");
            if ($input.length) {
                $input[0].click();
                return;
            }
            if (oUploader.openFileDialog) {
                oUploader.openFileDialog();
            }
        },

        onSapSelected: function (oEvent) {
            this._handleFileSelected(oEvent, "sap");
        },

        onGstSelected: function (oEvent) {
            this._handleFileSelected(oEvent, "gst");
        },

        _handleFileSelected: function (oEvent, type) {
            var files = oEvent.getParameter("files") || [];
            var file = files[0];
            if (!file) {
                return;
            }

            this.oModel.setProperty("/" + type + "Data", []);
            this.oModel.setProperty("/upload/" + type + "Raw", []);
            this.oModel.setProperty("/upload/" + type + "Columns", []);
            this.oModel.setProperty("/mapping/" + type, {
                gstin: "", invoice: "", date: "", taxable: "", gst: ""
            });
            this._resetResult();

            if (type === "sap") {
                this.byId("sapFileName").setValue(file.name);
            } else {
                this.byId("gstFileName").setValue(file.name);
            }

            FileParser.parseFile(file, type, this.oModel);
        },

        // ================= RECON =================
        onRunReconciliation: function () {

            var aSap = this._applyMapping("sap");
            if (aSap === null) {
                return;
            }

            var aGst = this._applyMapping("gst");
            if (aGst === null) {
                return;
            }

            if (!aSap || !aSap.length || !aGst || !aGst.length) {
                MessageBox.error("Upload both SAP and GST files before reconciliation");
                return;
            }

            var oResult = ReconciliationEngine.run(aSap, aGst);

            this.oModel.setProperty("/result", oResult.data);
            this.oModel.setProperty("/summary", oResult.summary);

            this._buildChart(oResult.summary);
            this._generateInsights(oResult.data);

            this._applyTableFilters();

            MessageToast.show("Reconciliation completed");
        },

        // ================= MAPPING =================
        _normalizeText: function (value) {
            return String(value || "").trim();
        },

        _normalizeGstin: function (value) {
            return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "").trim();
        },

        _normalizeInvoice: function (value) {
            return String(value || "").trim().toUpperCase().replace(/[^A-Z0-9\-\/]+/g, "").replace(/\s+/g, " ").trim();
        },

        _normalizeDate: function (value) {
            return this._formatDate(value);
        },

        _normalizeHeaderKey: function (key) {
            return String(key || "").toLowerCase().replace(/[^a-z0-9]/g, "").trim();
        },

        _getFieldValue: function (row, fieldName, fallbackKeys) {
            if (fieldName && row[fieldName] !== undefined && row[fieldName] !== null && row[fieldName] !== "") {
                return row[fieldName];
            }

            if (!fallbackKeys || !fallbackKeys.length) {
                return "";
            }

            for (var i = 0; i < fallbackKeys.length; i++) {
                var key = fallbackKeys[i];
                if (row[key] !== undefined && row[key] !== null && row[key] !== "") {
                    return row[key];
                }
            }

            var normalizedMap = Object.keys(row).reduce(function (map, key) {
                map[this._normalizeHeaderKey(key)] = key;
                return map;
            }.bind(this), {});

            for (var j = 0; j < fallbackKeys.length; j++) {
                var fallback = String(fallbackKeys[j] || "").toLowerCase().replace(/[^a-z0-9]/g, "").trim();
                if (!fallback) {
                    continue;
                }

                for (var normalizedKey in normalizedMap) {
                    if (normalizedKey.indexOf(fallback) > -1 || fallback.indexOf(normalizedKey) > -1) {
                        var actualKey = normalizedMap[normalizedKey];
                        var candidate = row[actualKey];
                        if (candidate !== undefined && candidate !== null && candidate !== "") {
                            return candidate;
                        }
                    }
                }
            }

            return "";
        },

        _applyMapping: function (type) {

            var raw = this.oModel.getProperty("/" + type + "Data") || [];
            var mapping = this.oModel.getProperty("/mapping/" + type) || {};

            if (!raw.length) {
                return [];
            }

            if (this._isCanonicalData(raw)) {
                return raw.map(function (row) {
                    return {
                        gstin: this._normalizeGstin(row.gstin),
                        invoice: this._normalizeInvoice(row.invoice),
                        date: this._normalizeDate(row.date),
                        taxable: this._toNumber(row.taxable),
                        gst: this._toNumber(row.gst)
                    };
                }.bind(this));
            }

            if (!this._hasRequiredMapping(mapping)) {
                var guessed = this._guessMapping(raw[0]);
                if (this._hasRequiredMapping(guessed)) {
                    mapping = guessed;
                } else {
                    MessageBox.error("Auto-detect mapping failed. Please verify the SAP/GST file headers.");
                    return null;
                }
            }

            return raw.map(function (row) {
                var gstAmount = 0;
                if (mapping.gst) {
                    gstAmount = this._toNumber(this._getFieldValue(row, mapping.gst, ["gst", "GST", "IGST", "CGST", "SGST"]));
                } else if (Array.isArray(mapping.gstComponents) && mapping.gstComponents.length) {
                    gstAmount = mapping.gstComponents.reduce(function (sum, key) {
                        return sum + this._toNumber(this._getFieldValue(row, key, [key]));
                    }.bind(this), 0);
                }

                var taxableAmount = 0;
                if (mapping.taxable) {
                    taxableAmount = this._toNumber(this._getFieldValue(row, mapping.taxable, ["taxable", "Taxable", "amount", "value", "txval"]));
                } else if (Array.isArray(mapping.taxableComponents) && mapping.taxableComponents.length) {
                    taxableAmount = mapping.taxableComponents.reduce(function (sum, key) {
                        return sum + this._toNumber(this._getFieldValue(row, key, [key]));
                    }.bind(this), 0);
                }

                return {
                    gstin: this._normalizeGstin(this._getFieldValue(row, mapping.gstin, ["gstin", "ctin", "suppliergst", "gstno", "gstnumber"])),
                    invoice: this._normalizeInvoice(this._getFieldValue(row, mapping.invoice, ["invoice", "inv", "bill", "doc", "number"])),
                    date: this._normalizeDate(this._getFieldValue(row, mapping.date, ["date", "invdate", "postingdate", "idt", "Document Date"])),
                    taxable: taxableAmount,
                    gst: gstAmount
                };
            }.bind(this));
        },

        _isCanonicalData: function (rows) {
            var first = rows[0] || {};

            return Object.prototype.hasOwnProperty.call(first, "gstin") &&
                Object.prototype.hasOwnProperty.call(first, "invoice") &&
                Object.prototype.hasOwnProperty.call(first, "date") &&
                Object.prototype.hasOwnProperty.call(first, "taxable") &&
                Object.prototype.hasOwnProperty.call(first, "gst");
        },

        _hasRequiredMapping: function (mapping) {
            var hasGst = !!mapping.gst || (Array.isArray(mapping.gstComponents) && mapping.gstComponents.length);
            var hasTaxable = !!mapping.taxable || (Array.isArray(mapping.taxableComponents) && mapping.taxableComponents.length);
            return !!(mapping.gstin && mapping.invoice && mapping.date && hasTaxable && hasGst);
        },

        _guessMapping: function (row) {
            var normalizedMap = Object.keys(row).reduce(function (map, key) {
                map[this._normalizeHeaderKey(key)] = key;
                return map;
            }.bind(this), {});

            var findKey = function (keywords) {
                for (var i = 0; i < keywords.length; i++) {
                    for (var normKey in normalizedMap) {
                        if (normKey.indexOf(keywords[i]) > -1) {
                            return normalizedMap[normKey];
                        }
                    }
                }
                return "";
            };

            return {
                gstin: findKey(["suppliergst", "suppliergstin", "ctin", "gstin", "gstno", "gstnumber", "gstn", "gstid", "companygst", "companygstin", "vendorgst", "customergst"]),
                invoice: findKey(["invoice", "inv", "bill", "doc", "invoiceno", "invoice_no", "invoice number", "documentno", "documentnumber", "billno", "invno", "invoiceid"]),
                date: findKey(["date", "invdate", "postingdate", "idt", "documentdate", "issuedate", "billdate", "invoice date", "dateofinvoice", "invdt"]),
                taxable: findKey(["taxable", "value", "amount", "txval", "taxablevalue", "taxableamt", "taxableamount", "netvalue", "netamount", "assessablevalue"]),
                gst: findKey(["gstamount", "taxamount", "igst", "cgst", "sgst", "totalgst", "gstamt", "amountgst", "igstamt", "cgstamt", "sgstamt"]),
                gstComponents: [],
                taxableComponents: []
            };
        },

        _toNumber: function (value) {
            var number = parseFloat(String(value || "").replace(/,/g, ""));
            return isNaN(number) ? 0 : number;
        },

        _formatDate: function (value) {
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
        },

        // ================= FILTER =================
        onSearch: function () {
            this._applyTableFilters();
        },

        onStatusFilterChange: function () {
            this._applyTableFilters();
        },

        _applyTableFilters: function () {

            var oTable = this.byId("resultTable");
            var oBinding = oTable.getBinding("items");

            if (!oBinding) return;

            var aFilters = [];
            var sQuery = this.byId("searchField").getValue();
            var sStatus = this.byId("statusSelect").getSelectedKey();

            if (sQuery) {
                aFilters.push(new Filter({
                    filters: [
                        new Filter("gstin", FilterOperator.Contains, sQuery),
                        new Filter("invoice", FilterOperator.Contains, sQuery),
                        new Filter("date", FilterOperator.Contains, sQuery)
                    ],
                    and: false
                }));
            }

            if (sStatus !== "ALL") {
                aFilters.push(new Filter("status", FilterOperator.EQ, sStatus));
            }

            oBinding.filter(aFilters);
        },

        // ================= KPI =================
        onKpiPress: function (oEvent) {

            var status = oEvent.getSource().data("status");

            var binding = this.byId("resultTable").getBinding("items");

            if (!binding) return;

            if (status === "TOTAL") {
                binding.filter([]);
            } else {
                binding.filter([new Filter("status", FilterOperator.EQ, status)]);
            }
        },

        // ================= CHART =================
        _buildChart: function (summary) {
            this.oModel.setProperty("/chart", [
                { status: "Matched", count: summary.matched },
                { status: "Missing", count: summary.missing },
                { status: "Mismatch", count: summary.mismatch }
            ]);
        },

        // ================= INSIGHTS =================
        _generateInsights: function (data) {
            var mismatches = data.filter(d => d.status === "Mismatch");

            mismatches.sort((a, b) => Math.abs(b.gstDiff) - Math.abs(a.gstDiff));

            this.oModel.setProperty("/insights", mismatches.slice(0, 5));
        },

        // ================= DRILLDOWN =================
        onRowPress: function (oEvent) {

            var d = oEvent.getSource().getBindingContext("appModel").getObject();

            if (this._detailDialog) {
                this._detailDialog.destroy();
            }

            this._detailDialog = new Dialog({
                title: "Invoice Analysis",
                contentWidth: "700px",
                content: [
                    new VBox({
                        items: [
                            new Title({ text: "Basic Info" }),
                            new Text({ text: "GSTIN: " + d.gstin }),
                            new Text({ text: "Invoice: " + d.invoice }),
                            new Text({ text: "Date: " + d.date }),

                            new Title({ text: "SAP vs GST" }),
                            new Text({ text: "SAP Taxable: ₹" + d.sapTaxable }),
                            new Text({ text: "GST Taxable: ₹" + d.gstTaxable }),
                            new Text({ text: "SAP GST: ₹" + d.sapGst }),
                            new Text({ text: "GST GST: ₹" + d.gstGst }),
                            new Text({ text: "Taxable difference: ₹" + d.taxableDiff.toFixed(2) }),
                            new Text({ text: "GST difference: ₹" + d.gstDiff.toFixed(2) }),
                            new Text({ text: "Result: " + d.status }),
                            new Text({ text: "Detail: " + d.details }),

                            new Title({ text: "What mapping fields do" }),
                            new Text({ text: "SAP mapping fields tell the app which columns in your SAP Excel file correspond to GSTIN, invoice number, date, taxable amount and GST amount." }),
                            new Text({ text: "GST mapping fields align the GSTR-2B JSON fields to the same comparison keys so the engine can match records precisely." })
                        ]
                    })
                ],
                endButton: new Button({
                    text: "Close",
                    press: function () {
                        this._detailDialog.close();
                    }.bind(this)
                })
            });

            this._detailDialog.open();
        },

        // ================= EXPORT =================
        onExportAll: function () {
            var data = this.oModel.getProperty("/result") || [];
            this._exportCsv(data, "GST_Reconciliation.csv");
        },

        _exportCsv: function (rows, name) {

            if (!rows.length) {
                MessageToast.show("No data");
                return;
            }

            var csv = "GSTIN,Invoice,Date,SAP,GST,Status\n";

            rows.forEach(function (r) {
                csv += `${r.gstin},${r.invoice},${r.date},${r.sapTaxable},${r.gstTaxable},${r.status}\n`;
            });

            var blob = new Blob([csv]);
            var url = URL.createObjectURL(blob);

            var a = document.createElement("a");
            a.href = url;
            a.download = name;
            a.click();

            URL.revokeObjectURL(url);
        }

    });
});
