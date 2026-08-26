// src/modules/retur-v3/retur-v3-routes.js
const express = require("express");
const router = express.Router();

const verifyToken = require("../../core/middleware/verify-token");
const attachPermissions = require("../../core/middleware/attach-permissions");
const requirePermission = require("../../core/middleware/require-permission");
const ctrl = require("./retur-v3-controller");

// urutan penting: verify → attach → require → controller
router.use(verifyToken, attachPermissions);

router.get("/", ctrl.getAll);
router.get("/:noRetur", ctrl.getDetail);
router.get("/:noRetur/outputs", ctrl.getOutputs);
router.get("/:noRetur/turnover", ctrl.getTurnover);

router.post("/", ctrl.create);
router.put("/:noRetur", ctrl.update);
router.delete("/:noRetur", ctrl.remove);

router.post("/:noRetur/items", ctrl.addItems);
router.put("/:noRetur/items/:idItem", ctrl.updateItem);
router.delete("/:noRetur/items/:idItem", ctrl.deleteItem);

// Keputusan diganti/tidak-diganti adalah wewenang Sales (retur:decide),
// terpisah dari retur:update yang dipegang Admin — lihat doc comment
// ReturV3DetailScreen di frontend untuk pembagian peran lengkap.
router.patch("/:noRetur/decision", ctrl.decide);
router.post("/:noRetur/export-gsu", ctrl.exportGsu);

router.post("/:noRetur/items/:idItem/generate-label", ctrl.generateLabel);

// Target pengganti (item + pcs) adalah bagian dari keputusan penggantian,
// jadi wewenangnya ikut retur:decide (Sales) — bukan retur:update.
router.post("/:noRetur/items/:idItem/targets", ctrl.addTurnoverTargets);
router.put("/:noRetur/targets/:idTarget", ctrl.updateTurnoverTarget);
router.delete("/:noRetur/targets/:idTarget", ctrl.deleteTurnoverTarget);

router.post("/:noRetur/scan", ctrl.scanAuto);
router.delete("/:noRetur/turnover/:idTurnover", ctrl.undoScan);

router.patch("/:noRetur/complete", ctrl.complete);

module.exports = router;
