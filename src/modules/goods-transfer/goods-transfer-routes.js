const express = require("express");
const router = express.Router();
const verifyToken = require("../../core/middleware/verify-token");
const attachPermissions = require("../../core/middleware/attach-permissions");
const requirePermission = require("../../core/middleware/require-permission");
const goodsTransferController = require("./goods-transfer-controller");

// urutan penting: verify → attach → require → controller
router.use(verifyToken, attachPermissions);

router.post(
  "/",
  requirePermission("goods_transfer:create"),
  goodsTransferController.createHandler,
);
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
router.get(
  "/inspect-label",
  requirePermission("goods_transfer:create"),
  goodsTransferController.inspectLabelHandler,
);
router.get(
  "/:noTransfer",
  requirePermission("goods_transfer:read"),
  goodsTransferController.detailHandler,
);
router.post(
  "/:noTransfer/cancel",
  requirePermission("goods_transfer:update"),
  goodsTransferController.cancelHandler,
);
router.post(
  "/:noTransfer/reject",
  requirePermission("goods_transfer:update"),
  goodsTransferController.rejectHandler,
);
router.post(
  "/:noTransfer/accept",
  requirePermission("goods_transfer:update"),
  goodsTransferController.acceptHandler,
);
router.post(
  "/accept-scan",
  requirePermission("goods_transfer:update"),
  goodsTransferController.acceptScanHandler,
);

module.exports = router;
