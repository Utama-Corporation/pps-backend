// src/modules/retur-v3/retur-v3-routes.js
const express = require("express");
const router = express.Router();

const verifyToken = require("../../core/middleware/verify-token");
const ctrl = require("./retur-v3-controller");

router.use(verifyToken);

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

router.patch("/:noRetur/decision", ctrl.decide);
router.post("/:noRetur/export-gsu", ctrl.exportGsu);

router.post("/:noRetur/items/:idItem/generate-label", ctrl.generateLabel);
router.post("/:noRetur/items/:idItem/scan", ctrl.scan);
router.post("/:noRetur/scan", ctrl.scanAuto);
router.delete("/:noRetur/items/:idItem/scan/:idTurnover", ctrl.undoScan);

router.patch("/:noRetur/flag-kirim", ctrl.flagKirim);

module.exports = router;