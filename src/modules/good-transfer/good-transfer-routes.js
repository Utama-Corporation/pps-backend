const express = require("express");
const router = express.Router();
const verifyToken = require("../../core/middleware/verify-token");
const attachPermissions = require("../../core/middleware/attach-permissions");
const requirePermission = require("../../core/middleware/require-permission");
const goodTransferController = require("./good-transfer-controller");

// urutan penting: verify → attach → require → controller
router.use(verifyToken, attachPermissions);

router.post(
  "/",
  requirePermission("good_transfer:create"),
  goodTransferController.createHandler,
);
router.get(
  "/",
  requirePermission("good_transfer:read"),
  goodTransferController.listAllHandler,
);
router.get(
  "/outgoing",
  requirePermission("good_transfer:read"),
  goodTransferController.listOutgoingHandler,
);
router.get(
  "/incoming",
  requirePermission("good_transfer:read"),
  goodTransferController.listIncomingHandler,
);
// harus didaftarkan sebelum "/:noTransfer" agar tidak ketangkap sebagai param
router.get(
  "/inspect-label",
  requirePermission("good_transfer:create"),
  goodTransferController.inspectLabelHandler,
);
router.get(
  "/:noTransfer",
  requirePermission("good_transfer:read"),
  goodTransferController.detailHandler,
);
router.post(
  "/:noTransfer/cancel",
  requirePermission("good_transfer:update"),
  goodTransferController.cancelHandler,
);
router.post(
  "/:noTransfer/reject",
  requirePermission("good_transfer:update"),
  goodTransferController.rejectHandler,
);
router.post(
  "/:noTransfer/accept",
  requirePermission("good_transfer:update"),
  goodTransferController.acceptHandler,
);
router.post(
  "/accept-scan",
  requirePermission("good_transfer:update"),
  goodTransferController.acceptScanHandler,
);

module.exports = router;
