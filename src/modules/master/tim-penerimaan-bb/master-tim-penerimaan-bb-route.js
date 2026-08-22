// master-tim-penerimaan-bb-route.js
const express = require("express");
const router = express.Router();

const verifyToken = require("../../../core/middleware/verify-token");
const ctrl = require("./master-tim-penerimaan-bb-controller");

// List tim penerimaan bahan baku
// Query: ?q=nama&includeInactive=1&orderBy=NamaTim&orderDir=ASC
router.get("/tim-penerimaan-bb", verifyToken, ctrl.list);
router.get("/tim-penerimaan-bb/:idTim", verifyToken, ctrl.getById);
router.post("/tim-penerimaan-bb", verifyToken, ctrl.create);
router.put("/tim-penerimaan-bb/:idTim", verifyToken, ctrl.update);
router.delete("/tim-penerimaan-bb/:idTim", verifyToken, ctrl.remove);

module.exports = router;
