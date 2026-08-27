// master-warehouse-group-route.js
const express = require("express");
const router = express.Router();

const verifyToken = require("../../../core/middleware/verify-token");
const ctrl = require("./master-warehouse-group-controller");

// CRUD group warehouse (site).
// Query list: ?q=nama&includeInactive=1&orderBy=NamaGroup&orderDir=ASC
router.get("/warehouse-group", verifyToken, ctrl.list);
router.get("/warehouse-group/:id", verifyToken, ctrl.getById);
router.post("/warehouse-group", verifyToken, ctrl.create);
router.put("/warehouse-group/:id", verifyToken, ctrl.update);
router.delete("/warehouse-group/:id", verifyToken, ctrl.remove);

module.exports = router;
