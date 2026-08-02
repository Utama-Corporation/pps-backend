// routes/production-route.js
const express = require("express");
const router = express.Router();
const verifyToken = require("../../../core/middleware/verify-token");
const washingProduksiController = require("./washing-production-controller");

// GET /washing?page=1&pageSize=20
router.get("/washing", verifyToken, washingProduksiController.getAllProduksi);

// Validasi pola tanggal langsung di route (YYYY-MM-DD)
router.get(
  "/washing/:date(\\d{4}-\\d{2}-\\d{2})",
  verifyToken,
  washingProduksiController.getProduksiByDate,
);

// ✅ Create WashingProduksi_h
// req.body support: { ..., isBlower: 1 | 0 }
router.post("/washing", verifyToken, washingProduksiController.createProduksi);

// POST /washing/split-time/:idMesin/:tanggal
router.post(
  "/washing/split-time/:idMesin/:tanggal",
  verifyToken,
  washingProduksiController.splitProduksiTime,
);

router.patch(
  "/washing/:noProduksi/complete",
  verifyToken,
  washingProduksiController.completeProduksi,
);

// Verifikasi tingkat pertama (Stock Controller / SC).
router.patch(
  "/washing/:noProduksi/verify-sc",
  verifyToken,
  washingProduksiController.verifyProduksiSC,
);

router.patch(
  "/washing/:noProduksi/unverify-sc",
  verifyToken,
  washingProduksiController.unverifyProduksiSC,
);

// Verifikasi tingkat kedua (Product Controller / PC), independen dari
// verify-sc/unverify-sc di atas.
router.patch(
  "/washing/:noProduksi/verify-pc",
  verifyToken,
  washingProduksiController.verifyProduksiPC,
);

router.patch(
  "/washing/:noProduksi/unverify-pc",
  verifyToken,
  washingProduksiController.unverifyProduksiPC,
);

// Verifikasi tingkat ketiga (Department Head): memvalidasi bahwa verifikasi
// SC (verify-sc) dan PC (verify-pc) sudah dilakukan sebelum bisa
// diverifikasi.
router.patch(
  "/washing/:noProduksi/verify-depthead",
  verifyToken,
  washingProduksiController.verifyProduksiDeptHead,
);

router.patch(
  "/washing/:noProduksi/unverify-depthead",
  verifyToken,
  washingProduksiController.unverifyProduksiDeptHead,
);

// req.body support: { ..., isBlower: 1 | 0 }
router.put(
  "/washing/:noProduksi",
  verifyToken,
  washingProduksiController.updateProduksi,
);

router.delete(
  "/washing/:noProduksi",
  verifyToken,
  washingProduksiController.deleteProduksi,
);

// GET /api/production/washing/:noProduksi/inputs
router.get(
  "/washing/:noProduksi/inputs",
  verifyToken,
  washingProduksiController.getInputsByNoProduksi,
);

// GET /api/production/washing/:noProduksi/inputs/v2
// Sama seperti /inputs, tapi digrup per label (header + DetailSak[])
// mengikuti format response endpoint /outputs.
router.get(
  "/washing/:noProduksi/inputs/v2",
  verifyToken,
  washingProduksiController.getInputsByNoProduksiV2,
);

// GET /api/production/washing/:noProduksi/outputs
router.get(
  "/washing/:noProduksi/outputs",
  verifyToken,
  washingProduksiController.getOutputsByNoProduksi,
);

// GET /api/production/washing/:noProduksi/outputs/v2
// Sama seperti /outputs, tapi dibungkus per kategori sumber (mis. "washing")
// mengikuti format response endpoint /inputs/v2.
router.get(
  "/washing/:noProduksi/outputs/v2",
  verifyToken,
  washingProduksiController.getOutputsByNoProduksiV2,
);

router.get(
  "/washing/:noProduksi/formula-inputs",
  verifyToken,
  washingProduksiController.getFormulaInputsByNoProduksi,
);

// GET /api/production/washing/:noProduksi/verification-summary
// Agregasi header + inputs/v2 + outputs/v2 + formula-inputs untuk layar
// verifikasi Product Controller (lihat verify-pc/unverify-pc).
router.get(
  "/washing/:noProduksi/verification-summary",
  verifyToken,
  washingProduksiController.getVerificationSummary,
);

router.get(
  "/washing/validate-label/:labelCode",
  verifyToken,
  washingProduksiController.validateLabel,
);

router.post(
  "/washing/:noProduksi/inputs",
  verifyToken,
  washingProduksiController.upsertInputsAndPartials,
);

router.delete(
  "/washing/:noProduksi/inputs",
  verifyToken,
  washingProduksiController.deleteInputsAndPartials,
);

module.exports = router;
