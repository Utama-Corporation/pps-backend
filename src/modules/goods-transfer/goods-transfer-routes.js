const express = require("express");
const router = express.Router();
const verifyToken = require("../../core/middleware/verify-token");
const attachPermissions = require("../../core/middleware/attach-permissions");
const requirePermission = require("../../core/middleware/require-permission");
const goodsTransferController = require("./goods-transfer-controller");

// urutan penting: verify → attach → require → controller
router.use(verifyToken, attachPermissions);

router.get(
  "/",
  requirePermission("goods_transfer:read"),
  goodsTransferController.listAllHandler,
);
router.get(
  "/outgoing",
  requirePermission("goods_transfer:read"),
  goodsTransferController.listOutgoingHandler,
);
router.get(
  "/incoming",
  requirePermission("goods_transfer:read"),
  goodsTransferController.listIncomingHandler,
);
// harus didaftarkan sebelum "/:noTransfer" agar tidak ketangkap sebagai param
router.post(
  "/accept-scan",
  requirePermission("goods_transfer:update"),
  goodsTransferController.acceptScanHandler,
);
router.delete(
  "/scan/:idScan",
  requirePermission("goods_transfer:update"),
  goodsTransferController.undoScanHandler,
);
router.get(
  "/:noTransfer",
  requirePermission("goods_transfer:read"),
  goodsTransferController.detailHandler,
);
router.post(
  "/:noTransfer/scan",
  requirePermission("goods_transfer:update"),
  goodsTransferController.scanHandler,
);
router.post(
  "/:noTransfer/kirim",
  requirePermission("goods_transfer:update"),
  goodsTransferController.kirimHandler,
);

module.exports = router;
