const express = require("express");
const router = express.Router();

const verifyToken = require("../../../core/middleware/verify-token");
const ctrl = require("./master-shift-controller");

// GET shift hour by tanggal & shift
// Query: ?tanggal=2026-05-09&shift=1
router.get("/shift/hour", verifyToken, ctrl.getShiftHours);
router.get("/shift/current", verifyToken, ctrl.getCurrentShift);

// Khusus mixer: filter MstShiftHourSet.IdBagian = 5 (hardcode)
// Query: ?tanggal=2026-05-09&shift=1
router.get("/mixer/shift/hour", verifyToken, ctrl.getMixerShiftHours);
router.get("/mixer/shift/current", verifyToken, ctrl.getMixerCurrentShift);

module.exports = router;
