// master-supplier-route.js
const express = require("express");
const router = express.Router();

const verifyToken = require("../../../core/middleware/verify-token");
const ctrl = require("./master-supplier-controller");

// List supplier
// Query: ?q=nama&orderBy=NmSupplier&orderDir=ASC
router.get("/supplier", verifyToken, ctrl.list);

module.exports = router;
