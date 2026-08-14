const express = require("express");
const verifyToken = require("../../core/middleware/verify-token");
const {
  getListHandler,
  getPermissionListHandler,
  getDetailHandler,
  saveNewHandler,
  saveUpdateHandler,
  removeHandler,
} = require("./master-permission-group-controller");

const router = express.Router();

// =========================
// MASTER DATA (WAJIB sebelum :idUGroup)
// =========================
router.get("/permissions", verifyToken, getPermissionListHandler);

// =========================
// CRUD
// =========================
router.get("/", verifyToken, getListHandler);
router.get("/:idUGroup", verifyToken, getDetailHandler);

router.post("/", verifyToken, saveNewHandler);
router.put("/:idUGroup", verifyToken, saveUpdateHandler);
router.delete("/:idUGroup", verifyToken, removeHandler);

module.exports = router;