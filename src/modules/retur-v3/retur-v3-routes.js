// src/modules/retur-v3/retur-v3-routes.js
const express = require("express");
const router = express.Router();

const verifyToken = require("../../core/middleware/verify-token");
const attachPermissions = require("../../core/middleware/attach-permissions");
const requirePermission = require("../../core/middleware/require-permission");
const ctrl = require("./retur-v3-controller");

router.use(verifyToken, attachPermissions);

router.get("/", requirePermission("retur:read"), ctrl.getAll);
router.get("/:noRetur", requirePermission("retur:read"), ctrl.getDetail);
router.get("/:noRetur/outputs", requirePermission("retur:read"), ctrl.getOutputs);
router.get("/:noRetur/turnover", requirePermission("retur:read"), ctrl.getTurnover);

router.post("/", requirePermission("retur:create"), ctrl.create);
router.put("/:noRetur", requirePermission("retur:update"), ctrl.update);
router.delete("/:noRetur", requirePermission("retur:delete"), ctrl.remove);

router.post("/:noRetur/items", requirePermission("retur:create"), ctrl.addItems);
router.put("/:noRetur/items/:idItem", requirePermission("retur:update"), ctrl.updateItem);
router.delete("/:noRetur/items/:idItem", requirePermission("retur:delete"), ctrl.deleteItem);

// retur:decide HANYA untuk menentukan diganti/tidak-diganti — wewenang
// Sales. generate-label tetap retur:update (Admin), karena itu langkah
// operasional yang beda orangnya dari yang mengambil keputusan; dipicu
// otomatis di sisi FE begitu Admin (bukan Sales) membuka retur yang
// statusnya sudah diputuskan, bukan lagi langsung nempel di aksi decide.
router.patch("/:noRetur/decision", requirePermission("retur:decide"), ctrl.decide);

router.post(
  "/:noRetur/items/:idItem/generate-label",
  requirePermission("retur:update"),
  ctrl.generateLabel,
);

router.post(
  "/:noRetur/items/:idItem/scan",
  requirePermission("retur:update"),
  ctrl.scan,
);
router.post(
  "/:noRetur/scan",
  requirePermission("retur:update"),
  ctrl.scanAuto,
);
router.delete(
  "/:noRetur/items/:idItem/scan/:idTurnover",
  requirePermission("retur:delete"),
  ctrl.undoScan,
);

router.patch("/:noRetur/flag-kirim", requirePermission("retur:update"), ctrl.flagKirim);

module.exports = router;
