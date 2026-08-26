// src/modules/laporan/broker/broker-route.js
const express = require("express");
const router = express.Router();

const verifyToken = require("../../../core/middleware/verify-token");
const ctrl = require("./broker-controller");

// GET /api/laporan/broker/stok-qc/pdf?tglAkhir=YYYY-MM-DD
router.get(
  "/stok-qc/pdf",
  verifyToken,
  ctrl.stokBrokerQcPdfHandler,
);

module.exports = router;