// bahan-pendukung-routes.js
const express = require("express");
const router = express.Router();

const verifyToken = require("../../../core/middleware/verify-token");
const attachPermissions = require("../../../core/middleware/attach-permissions");
const requirePermission = require("../../../core/middleware/require-permission");
const ctrl = require("./bahan-pendukung-controller");

router.use(verifyToken, attachPermissions);

// GET all (pagination + search ?page=&limit=&search=)
router.get(
  "/labels/bahan-pendukung",
  requirePermission("label_bahanpendukung:read"),
  ctrl.getAll,
);

// UPDATE Bahan Pendukung
router.put(
  "/labels/bahan-pendukung/:noBahanPendukung",
  requirePermission("label_bahanpendukung:update"),
  ctrl.update,
);

router.patch(
  "/labels/bahan-pendukung/:noBahanPendukung/print",
  requirePermission("label_bahanpendukung:update"),
  ctrl.incrementHasBeenPrinted,
);

// DELETE Bahan Pendukung
router.delete(
  "/labels/bahan-pendukung/:noBahanPendukung",
  requirePermission("label_bahanpendukung:delete"),
  ctrl.delete,
);

module.exports = router;
