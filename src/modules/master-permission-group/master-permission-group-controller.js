const {
  getList,
  getPermissionList,
  getDetail,
  saveNew,
  saveUpdate,
  remove,
} = require("./master-permission-group-service");

// =========================
// GET /api/master-permission-group?filter=xxx
// =========================
async function getListHandler(req, res) {
  try {
    const filter = req.query.filter ? String(req.query.filter) : "";
    const data = await getList(filter);
    return res.json({ success: true, data });
  } catch (err) {
    console.error("❌ master-permission-group getList:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
}

// =========================
// GET /api/master-permission-group/permissions
// =========================
async function getPermissionListHandler(req, res) {
  try {
    const data = await getPermissionList();
    return res.json({ success: true, data });
  } catch (err) {
    console.error("❌ master-permission-group getPermissionList:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
}

// =========================
// GET /api/master-permission-group/:idUGroup
// =========================
async function getDetailHandler(req, res) {
  try {
    const data = await getDetail(req.params.idUGroup);
    if (!data) {
      return res
        .status(404)
        .json({ success: false, message: "Data tidak ditemukan." });
    }
    return res.json({ success: true, data });
  } catch (err) {
    console.error("❌ master-permission-group getDetail:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
}

// =========================
// POST /api/master-permission-group
// =========================
async function saveNewHandler(req, res) {
  try {
    const idUGroup = await saveNew(req.body || {});
    return res.json({ success: true, data: { IdUGroup: idUGroup } });
  } catch (err) {
    console.error("❌ master-permission-group saveNew:", err.message);
    return res.status(err.statusCode || 500).json({
      success: false,
      message: err.message || "Internal Server Error",
    });
  }
}

// =========================
// PUT /api/master-permission-group/:idUGroup
// =========================
async function saveUpdateHandler(req, res) {
  try {
    const idUGroup = await saveUpdate(req.params.idUGroup, req.body || {});
    return res.json({ success: true, data: { IdUGroup: idUGroup } });
  } catch (err) {
    console.error("❌ master-permission-group saveUpdate:", err.message);
    return res.status(err.statusCode || 500).json({
      success: false,
      message: err.message || "Internal Server Error",
    });
  }
}

// =========================
// DELETE /api/master-permission-group/:idUGroup
// =========================
async function removeHandler(req, res) {
  try {
    await remove(req.params.idUGroup);
    return res.json({ success: true, message: "Data berhasil dihapus." });
  } catch (err) {
    console.error("❌ master-permission-group remove:", err.message);
    return res.status(err.statusCode || 500).json({
      success: false,
      message: err.message || "Internal Server Error",
    });
  }
}

module.exports = {
  getListHandler,
  getPermissionListHandler,
  getDetailHandler,
  saveNewHandler,
  saveUpdateHandler,
  removeHandler,
};