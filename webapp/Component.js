sap.ui.define([
    "sap/ui/core/UIComponent",
    "sap/ui/model/json/JSONModel",
    "gstr/testgstrecon/model/models"
], function (UIComponent, JSONModel, models) {
    "use strict";

    return UIComponent.extend("gstr.testgstrecon.Component", {
        metadata: {
            manifest: "json",
            interfaces: [
                "sap.ui.core.IAsyncContentCreation"
            ]
        },

        init: function () {
            UIComponent.prototype.init.apply(this, arguments);

            this.setModel(models.createDeviceModel(), "device");

            var oAppModel = new JSONModel({

                sapData: [],
                gstData: [],

                result: [],

                summary: {
                    total: 0,
                    matched: 0,
                    missing: 0,
                    mismatch: 0
                },

                chart: [],
                insights: [],

                upload: {
                    sapRaw: [],
                    gstRaw: [],
                    sapColumns: [],
                    gstColumns: []
                },

                mapping: {
                    sap: {
                        gstin: "",
                        invoice: "",
                        date: "",
                        taxable: "",
                        gst: ""
                    },
                    gst: {
                        gstin: "",
                        invoice: "",
                        date: "",
                        taxable: "",
                        gst: ""
                    }
                }

            });

            this.setModel(oAppModel, "appModel");

            this.getRouter().initialize();
        }
    });
});