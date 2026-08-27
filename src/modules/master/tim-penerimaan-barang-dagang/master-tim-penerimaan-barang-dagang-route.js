// master-tim-penerimaan-barang-dagang-route.js
const express = require("express");
const router = express.Router();

const verifyToken = require("../../../core/middleware/verify-token");
const ctrl = require("./master-tim-penerimaan-barang-dagang-controller");

// List tim penerimaan barang dagang
// Query: ?q=nama&includeInactive=1&orderBy=NamaTim&orderDir=ASC
router.get("/tim-penerimaan-barang-dagang", verifyToken, ctrl.list);
router.get("/tim-penerimaan-barang-dagang/:idTim", verifyToken, ctrl.getById);
router.post("/tim-penerimaan-barang-dagang", verifyToken, ctrl.create);
router.put("/tim-penerimaan-barang-dagang/:idTim", verifyToken, ctrl.update);
router.delete("/tim-penerimaan-barang-dagang/:idTim", verifyToken, ctrl.remove);

module.exports = router;
