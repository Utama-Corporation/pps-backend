const {
  getList,
  getNextNo,
  getSalesPersons,
  getJenisReject,
  getDetail,
  saveNew,
  saveUpdate,
  remove,
} = require("./trade-in-service");

const {
  getActorId,
  getActorUsername,
  makeRequestId,
} = require("../../core/utils/http-context");

function buildCtx(req) {
  return {
    actorId: getActorId(req) || null,
    actorUsername: getActorUsername(req) || "system",
    requestId: makeRequestId(req),
  };
}

// =========================
// GET /api/trade-in?filter=xxx
// =========================
async function getListHandler(req, res) {
  try {
    const filter = req.query.filter ? String(req.query.filter) : "";
    const data = await getList(filter);
    return res.json({ success: true, data });
  } catch (err) {
    console.error("❌ trade-in getList:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
}

// =========================
// GET /api/trade-in/next-no
// =========================
async function getNextNoHandler(req, res) {
  try {
    const noPenerimaan = await getNextNo();
    return res.json({ success: true, data: { noPenerimaan } });
  } catch (err) {
    console.error("❌ trade-in getNextNo:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
}

// =========================
// GET /api/trade-in/master/salesperson
// =========================
async function getSalesPersonsHandler(req, res) {
  try {
    const data = await getSalesPersons();
    return res.json({ success: true, data });
  } catch (err) {
    console.error("❌ trade-in getSalesPersons:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
}

// =========================
// GET /api/trade-in/master/reject-types
// =========================
async function getJenisRejectHandler(req, res) {
  try {
    const data = await getJenisReject();
    return res.json({ success: true, data });
  } catch (err) {
    console.error("❌ trade-in getJenisReject:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
}

// =========================
// GET /api/trade-in/:noPenerimaan
// =========================
async function getDetailHandler(req, res) {
  try {
    const data = await getDetail(req.params.noPenerimaan);
    if (!data) {
      return res
        .status(404)
        .json({ success: false, message: "Data tidak ditemukan." });
    }
    return res.json({ success: true, data });
  } catch (err) {
    console.error("❌ trade-in getDetail:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
}

// =========================
// POST /api/trade-in
// =========================
async function saveNewHandler(req, res) {
  try {
    const ctx = buildCtx(req);
    const noPenerimaan = await saveNew(req.body || {}, ctx);
    return res.json({ success: true, data: { noPenerimaan } });
  } catch (err) {
    console.error("❌ trade-in saveNew:", err.message);
    return res.status(err.statusCode || 500).json({
      success: false,
      message: err.message || "Internal Server Error",
    });
  }
}

// =========================
// PUT /api/trade-in/:noPenerimaan
// =========================
async function saveUpdateHandler(req, res) {
  try {
    const ctx = buildCtx(req);
    const noPenerimaan = await saveUpdate(
      req.params.noPenerimaan,
      req.body || {},
      ctx,
    );
    return res.json({ success: true, data: { noPenerimaan } });
  } catch (err) {
    console.error("❌ trade-in saveUpdate:", err.message);
    return res.status(err.statusCode || 500).json({
      success: false,
      message: err.message || "Internal Server Error",
    });
  }
}

// =========================
// DELETE /api/trade-in/:noPenerimaan
// =========================
async function removeHandler(req, res) {
  try {
    const ctx = buildCtx(req);
    await remove(req.params.noPenerimaan, ctx);
    return res.json({ success: true, message: "Data berhasil dihapus." });
  } catch (err) {
    console.error("❌ trade-in remove:", err.message);
    return res.status(err.statusCode || 500).json({
      success: false,
      message: err.message || "Internal Server Error",
    });
  }
}

module.exports = {
  getListHandler,
  getNextNoHandler,
  getSalesPersonsHandler,
  getJenisRejectHandler,
  getDetailHandler,
  saveNewHandler,
  saveUpdateHandler,
  removeHandler,
};
