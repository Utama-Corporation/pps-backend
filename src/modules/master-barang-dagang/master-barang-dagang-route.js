const express = require("express");
const router = express.Router();

const ctrl = require("./master-barang-dagang-controller");

// Read-only lookup master jenis barang dagang (dipakai buat dropdown "nama
// barang" saat tambah item penerimaan). Tanpa verifyToken, mirror pola
// GET /api/mst-furniture-material/cabinet-materials.
router.get("/", ctrl.getMasterBarangDagang);

module.exports = router;
