const express = require("express");
const verifyToken = require("../../core/middleware/verify-token");
const {
  getListHandler,
  getNextNoHandler,
  getSalesPersonsHandler,
  getJenisRejectHandler,
  getDetailHandler,
  saveNewHandler,
  saveUpdateHandler,
  removeHandler,
} = require("./trade-in-controller");

const router = express.Router();

// =========================
// MASTER DATA (WAJIB sebelum :noPenerimaan)
// =========================
router.get("/master/salesperson", verifyToken, getSalesPersonsHandler);
router.get("/master/reject-types", verifyToken, getJenisRejectHandler);

// =========================
// GENERATE NOMOR
// =========================
router.get("/next-no", verifyToken, getNextNoHandler);

// =========================
// CRUD
// =========================
router.get("/", verifyToken, getListHandler);
router.get("/:noPenerimaan", verifyToken, getDetailHandler);

router.post("/", verifyToken, saveNewHandler);
router.put("/:noPenerimaan", verifyToken, saveUpdateHandler);
router.delete("/:noPenerimaan", verifyToken, removeHandler);

module.exports = router;
