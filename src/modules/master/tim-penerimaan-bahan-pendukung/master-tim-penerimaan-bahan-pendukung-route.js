// master-tim-penerimaan-bahan-pendukung-route.js
const express = require("express");
const router = express.Router();

const verifyToken = require("../../../core/middleware/verify-token");
const ctrl = require("./master-tim-penerimaan-bahan-pendukung-controller");

// List tim penerimaan bahan pendukung
// Query: ?q=nama&includeInactive=1&orderBy=NamaTim&orderDir=ASC
router.get("/tim-penerimaan-bahan-pendukung", verifyToken, ctrl.list);
router.get("/tim-penerimaan-bahan-pendukung/:idTim", verifyToken, ctrl.getById);
router.post("/tim-penerimaan-bahan-pendukung", verifyToken, ctrl.create);
router.put("/tim-penerimaan-bahan-pendukung/:idTim", verifyToken, ctrl.update);
router.delete("/tim-penerimaan-bahan-pendukung/:idTim", verifyToken, ctrl.remove);

module.exports = router;
