// master-warehouse-route.js
const express = require("express");
const router = express.Router();

const verifyToken = require("../../../core/middleware/verify-token");
const ctrl = require("./master-warehouse-controller");

// List warehouse (active only by default)
// Query: ?includeDisabled=1&q=inje&orderBy=NamaWarehouse&orderDir=ASC
router.get("/warehouse", verifyToken, ctrl.list);

// Set / lepas group (site) sebuah warehouse. Body: { idWarehouseGroup: <int|null> }
router.put("/warehouse/:idWarehouse/group", verifyToken, ctrl.setGroup);

module.exports = router;
