// routes/broker-production-route.js
const express = require("express");
const router = express.Router();
const verifyToken = require("../../../core/middleware/verify-token");
const brokerProduksiController = require("./broker-production-controller");

// GET /broker?page=1&pageSize=20
router.get("/broker", verifyToken, brokerProduksiController.getAllProduksi);

// GET BrokerProduksi_h by date (YYYY-MM-DD)
router.get(
  "/broker/:date(\\d{4}-\\d{2}-\\d{2})",
  verifyToken,
  brokerProduksiController.getProduksiByDate,
);

// ✅ Create
router.post("/broker", verifyToken, brokerProduksiController.createProduksi);

// POST /broker/split-time/:idMesin/:tanggal
router.post(
  "/broker/split-time/:idMesin/:tanggal",
  verifyToken,
  brokerProduksiController.splitProduksiTime,
);

router.patch(
  "/broker/:noProduksi/complete",
  verifyToken,
  brokerProduksiController.completeProduksi,
);

// Verifikasi tingkat pertama (Stock Controller / SC).
router.patch(
  "/broker/:noProduksi/verify-sc",
  verifyToken,
  brokerProduksiController.verifyProduksiSC,
);

router.patch(
  "/broker/:noProduksi/unverify-sc",
  verifyToken,
  brokerProduksiController.unverifyProduksiSC,
);

// Verifikasi tingkat kedua (Product Controller / PC), independen dari
// verify-sc/unverify-sc di atas.
router.patch(
  "/broker/:noProduksi/verify-pc",
  verifyToken,
  brokerProduksiController.verifyProduksiPC,
);

router.patch(
  "/broker/:noProduksi/unverify-pc",
  verifyToken,
  brokerProduksiController.unverifyProduksiPC,
);

// Verifikasi tingkat ketiga (Department Head): memvalidasi bahwa verifikasi
// SC (verify-sc) dan PC (verify-pc) sudah dilakukan sebelum bisa
// diverifikasi.
router.patch(
  "/broker/:noProduksi/verify-depthead",
  verifyToken,
  brokerProduksiController.verifyProduksiDeptHead,
);

router.patch(
  "/broker/:noProduksi/unverify-depthead",
  verifyToken,
  brokerProduksiController.unverifyProduksiDeptHead,
);

// ✅ Update by NoProduksi
router.put(
  "/broker/:noProduksi",
  verifyToken,
  brokerProduksiController.updateProduksi,
);

// DELETE /api/production/broker/:noProduksi
router.delete(
  "/broker/:noProduksi",
  verifyToken,
  brokerProduksiController.deleteProduksi,
);

// Add this route after your existing routes
router.get(
  "/broker/validate-label/:labelCode",
  verifyToken,
  brokerProduksiController.validateLabel,
);

//get input routes
router.get(
  "/broker/:noProduksi/inputs",
  verifyToken,
  brokerProduksiController.getInputsByNoProduksi,
);

// GET /api/production/broker/:noProduksi/inputs/v2
// Sama seperti /inputs, tapi digrup per label (header + DetailSak[])
// mengikuti format response endpoint /outputs.
router.get(
  "/broker/:noProduksi/inputs/v2",
  verifyToken,
  brokerProduksiController.getInputsByNoProduksiV2,
);

router.get(
  "/broker/:noProduksi/formula-inputs",
  verifyToken,
  brokerProduksiController.getFormulaInputsByNoProduksi,
);

// GET /api/production/broker/:noProduksi/verification-summary
// Agregasi header + inputs/v2 + outputs/v2 + formula-inputs untuk layar
// verifikasi Product Controller (lihat verify-pc/unverify-pc).
router.get(
  "/broker/:noProduksi/verification-summary",
  verifyToken,
  brokerProduksiController.getVerificationSummary,
);

router.get(
  "/broker/:noProduksi/outputs",
  verifyToken,
  brokerProduksiController.getOutputsByNoProduksi,
);

// GET /api/production/broker/:noProduksi/outputs/v2
// Sama seperti /outputs, tapi dibungkus per kategori sumber (mis. "broker")
// mengikuti format response endpoint /inputs/v2.
router.get(
  "/broker/:noProduksi/outputs/v2",
  verifyToken,
  brokerProduksiController.getOutputsByNoProduksiV2,
);

router.get(
  "/broker/:noProduksi/outputs/bonggolan",
  verifyToken,
  brokerProduksiController.getOutputsBonggolanByNoProduksi,
);

// PATCH /broker/:noProduksi/outputs/move
// Body: { targetNoProduksi: "E.xxx", items: [{ noBroker: "D.xxx", noSak: 1 }] }
router.patch(
  "/broker/:noProduksi/outputs/move",
  verifyToken,
  brokerProduksiController.moveOutputs,
);

// PATCH /broker/:noProduksi/outputs/bonggolan/move
// Body: { targetNoProduksi: "E.xxx", noBonggolanList: ["M.xxx", "M.yyy"] }
router.patch(
  "/broker/:noProduksi/outputs/bonggolan/move",
  verifyToken,
  brokerProduksiController.moveOutputsBonggolan,
);

// routes/broker-production-route.js
router.post(
  "/broker/:noProduksi/inputs",
  verifyToken,
  brokerProduksiController.upsertInputsAndPartials,
);

router.delete(
  "/broker/:noProduksi/inputs",
  verifyToken,
  brokerProduksiController.deleteInputsAndPartials,
);

module.exports = router;
