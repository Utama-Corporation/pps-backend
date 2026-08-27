// penerimaan-barang-dagang-route.js
//
// Tidak ada permission "penerimaan_barangdagang:*" tersendiri — modul ini
// pakai LANGSUNG permission "label_barangdagang:*" yang sudah ada (barang
// yang dibuat di sini adalah baris dbo.BarangDagang juga, lihat
// penerimaan-barang-dagang-service.js#addItemsPenerimaanBarangDagang).
const express = require("express");
const router = express.Router();

const verifyToken = require("../../../core/middleware/verify-token");
const attachPermissions = require("../../../core/middleware/attach-permissions");
const requirePermission = require("../../../core/middleware/require-permission");
const ctrl = require("./penerimaan-barang-dagang-controller");

router.use(verifyToken, attachPermissions);

router.get("/", requirePermission("label_barangdagang:read"), ctrl.list);
// Statis, harus di atas "/:noPenerimaan" supaya tidak ketangkap sebagai param.
router.get(
  "/tim-status",
  requirePermission("label_barangdagang:read"),
  ctrl.timStatus,
);
router.get(
  "/:noPenerimaan",
  requirePermission("label_barangdagang:read"),
  ctrl.getDetail,
);
// Fase 1: buat header dokumen.
router.post(
  "/",
  requirePermission("label_barangdagang:create"),
  ctrl.createHeader,
);
// Fase 2: tambah barang ke header yang sudah ada — boleh dipanggil >1x.
router.post(
  "/:noPenerimaan/items",
  requirePermission("label_barangdagang:create"),
  ctrl.addItems,
);
router.delete(
  "/:noPenerimaan",
  requirePermission("label_barangdagang:delete"),
  ctrl.remove,
);
// Tandai penerimaan sebagai selesai (IsComplete = 1).
router.patch(
  "/:noPenerimaan/complete",
  requirePermission("label_barangdagang:update"),
  ctrl.complete,
);

module.exports = router;
