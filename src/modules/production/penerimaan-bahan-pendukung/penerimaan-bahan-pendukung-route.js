// penerimaan-bahan-pendukung-route.js
//
// Tidak ada permission "penerimaan_bahanpendukung:*" tersendiri — modul ini
// pakai LANGSUNG permission "label_bahanpendukung:*" yang sudah ada (barang
// yang dibuat di sini adalah baris dbo.BahanPendukung juga, lihat
// penerimaan-bahan-pendukung-service.js#addItemsPenerimaanBahanPendukung).
const express = require("express");
const router = express.Router();

const verifyToken = require("../../../core/middleware/verify-token");
const attachPermissions = require("../../../core/middleware/attach-permissions");
const requirePermission = require("../../../core/middleware/require-permission");
const ctrl = require("./penerimaan-bahan-pendukung-controller");

router.use(verifyToken, attachPermissions);

router.get("/", requirePermission("label_bahanpendukung:read"), ctrl.list);
// Statis, harus di atas "/:noPenerimaan" supaya tidak ketangkap sebagai param.
router.get(
  "/tim-status",
  requirePermission("label_bahanpendukung:read"),
  ctrl.timStatus,
);
router.get(
  "/:noPenerimaan",
  requirePermission("label_bahanpendukung:read"),
  ctrl.getDetail,
);
// Fase 1: buat header dokumen (analog create PenerimaanBahanBaku_h).
router.post(
  "/",
  requirePermission("label_bahanpendukung:create"),
  ctrl.createHeader,
);
// Fase 2: tambah barang ke header yang sudah ada — boleh dipanggil >1x.
router.post(
  "/:noPenerimaan/items",
  requirePermission("label_bahanpendukung:create"),
  ctrl.addItems,
);
router.delete(
  "/:noPenerimaan",
  requirePermission("label_bahanpendukung:delete"),
  ctrl.remove,
);
// Tandai penerimaan sebagai selesai (IsComplete = 1).
router.patch(
  "/:noPenerimaan/complete",
  requirePermission("label_bahanpendukung:update"),
  ctrl.complete,
);

module.exports = router;
