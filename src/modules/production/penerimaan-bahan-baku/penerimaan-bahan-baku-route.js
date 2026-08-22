// penerimaan-bahan-baku-route.js
const express = require("express");
const router = express.Router();

const verifyToken = require("../../../core/middleware/verify-token");
const ctrl = require("./penerimaan-bahan-baku-controller");

router.get("/", verifyToken, ctrl.list);
// Statis, harus di atas "/:noPenerimaan" supaya tidak ketangkap sebagai param.
router.get("/tim-status", verifyToken, ctrl.timStatus);
router.get("/:noPenerimaan", verifyToken, ctrl.getDetail);
// Fase 1: buat header dokumen (analog create WashingProduksi_h).
router.post("/", verifyToken, ctrl.createHeader);
// Fase 2: tambah pallet/sak ke header yang sudah ada — boleh dipanggil
// >1x per NoPenerimaan (1x per section Bahan Baku Pakai/Proses).
router.post("/:noPenerimaan/pallets", verifyToken, ctrl.addPallets);
router.delete("/:noPenerimaan", verifyToken, ctrl.remove);

module.exports = router;
