// barang-dagang-routes.js
const express = require("express");
const router = express.Router();

const verifyToken = require("../../../core/middleware/verify-token");
const attachPermissions = require("../../../core/middleware/attach-permissions");
const requirePermission = require("../../../core/middleware/require-permission");
const ctrl = require("./barang-dagang-controller");

router.use(verifyToken, attachPermissions);

// GET all (pagination + search ?page=&limit=&search=)
router.get(
  "/labels/barang-dagang",
  requirePermission("label_barangdagang:read"),
  ctrl.getAll,
);

// UPDATE Barang Dagang
router.put(
  "/labels/barang-dagang/:noBarangDagang",
  requirePermission("label_barangdagang:update"),
  ctrl.update,
);

router.patch(
  "/labels/barang-dagang/:noBarangDagang/print",
  requirePermission("label_barangdagang:update"),
  ctrl.incrementHasBeenPrinted,
);

// PDF label (QR + nama barang + kode CYn)
router.get(
  "/labels/barang-dagang/:noBarangDagang/pdf",
  requirePermission("label_barangdagang:read"),
  ctrl.generatePdf,
);

// DELETE Barang Dagang
router.delete(
  "/labels/barang-dagang/:noBarangDagang",
  requirePermission("label_barangdagang:delete"),
  ctrl.delete,
);

module.exports = router;
