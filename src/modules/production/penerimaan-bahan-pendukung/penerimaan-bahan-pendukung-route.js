// penerimaan-bahan-pendukung-route.js
const express = require("express");
const router = express.Router();

const verifyToken = require("../../../core/middleware/verify-token");
const ctrl = require("./penerimaan-bahan-pendukung-controller");

router.get("/", verifyToken, ctrl.list);
// Statis, harus di atas "/:noPenerimaan" supaya tidak ketangkap sebagai param.
router.get("/tim-status", verifyToken, ctrl.timStatus);
router.get("/:noPenerimaan", verifyToken, ctrl.getDetail);
// Fase 1: buat header dokumen (analog create PenerimaanBahanBaku_h).
router.post("/", verifyToken, ctrl.createHeader);
// Fase 2: tambah barang ke header yang sudah ada — boleh dipanggil >1x.
router.post("/:noPenerimaan/items", verifyToken, ctrl.addItems);
router.delete("/:noPenerimaan", verifyToken, ctrl.remove);
// Tandai penerimaan sebagai selesai (IsComplete = 1).
router.patch("/:noPenerimaan/complete", verifyToken, ctrl.complete);

module.exports = router;
