const express = require("express");
const verifyToken = require("../../core/middleware/verify-token");
const {
  getListHandler,
  getPermissionListHandler,
  createPermissionHandler,
  updatePermissionHandler,
  deletePermissionHandler,
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
router.post("/permissions", verifyToken, createPermissionHandler);
router.put("/permissions/:noPermission", verifyToken, updatePermissionHandler);
router.delete("/permissions/:noPermission", verifyToken, deletePermissionHandler);

// =========================
// CRUD
// =========================
router.get("/", verifyToken, getListHandler);
router.get("/:idUGroup", verifyToken, getDetailHandler);

router.post("/", verifyToken, saveNewHandler);
router.put("/:idUGroup", verifyToken, saveUpdateHandler);
router.delete("/:idUGroup", verifyToken, removeHandler);

module.exports = router;