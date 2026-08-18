// penerimaan-bahan-baku-route.js
const express = require("express");
const router = express.Router();

const verifyToken = require("../../../core/middleware/verify-token");
const ctrl = require("./penerimaan-bahan-baku-controller");

router.get("/", verifyToken, ctrl.list);
// Statis, harus di atas "/:noPenerimaan" supaya tidak ketangkap sebagai param.
router.get("/tim-status", verifyToken, ctrl.timStatus);
router.get("/:noPenerimaan", verifyToken, ctrl.getDetail);
router.post("/", verifyToken, ctrl.create);
router.delete("/:noPenerimaan", verifyToken, ctrl.remove);

module.exports = router;
