const goodsTransferService = require("./goods-transfer-service");

const ERROR_STATUS = {
  VALIDATION_ERROR: 400,
  SAME_WAREHOUSE: 400,
  UNKNOWN_PREFIX: 400,
  NOT_FOUND: 404,
  NOT_IN_TRANSIT: 404,
  ALREADY_USED: 409,
  WAREHOUSE_MISMATCH: 409,
  LABEL_IN_TRANSIT: 409,
  INVALID_STATUS: 409,
};

function _actorCtx(req) {
  return {
    actorId: req.idUsername,
    actorUsername: req.username,
    requestId: req.headers["x-request-id"] || undefined,
  };
}

async function inspectLabelHandler(req, res) {
  try {
    const result = await goodsTransferService.inspectLabel({
      labelCode: req.query.labelCode,
      idWarehouseAsal: req.query.idWarehouseAsal,
    });
    if (!result.success) {
      const status = ERROR_STATUS[result.code] || 400;
      return res.status(status).json(result);
    }
    return res.json(result);
  } catch (err) {
    console.error("Error inspecting label:", err);
    return res.status(500).json({ success: false, message: "Terjadi kesalahan server", error: err.message });
  }
}

async function acceptScanHandler(req, res) {
  try {
    const result = await goodsTransferService.acceptScannedItem({
      labelCode: req.body?.labelCode,
      blokTujuan: req.body?.blokTujuan,
      idLokasiTujuan: req.body?.idLokasiTujuan,
      ..._actorCtx(req),
    });
    if (!result.success) {
      const status = ERROR_STATUS[result.code] || 400;
      return res.status(status).json(result);
    }
    return res.json(result);
  } catch (err) {
    console.error("Error accepting scanned item:", err);
    const status = err.statusCode || 500;
    return res.status(status).json({
      success: false,
      message: err.message || "Terjadi kesalahan server",
      code: err.code,
    });
  }
}

async function createHandler(req, res) {
  try {
    const { idWarehouseAsal, idWarehouseTujuan, labelCodes, tanggalKirim, catatan } = req.body || {};

    const result = await goodsTransferService.createGoodsTransfer({
      idWarehouseAsal,
      idWarehouseTujuan,
      labelCodes,
      tanggalKirim: tanggalKirim || new Date(),
      catatan,
      ..._actorCtx(req),
    });

    if (!result.success) {
      const status = ERROR_STATUS[result.code] || 400;
      return res.status(status).json(result);
    }
    return res.status(201).json(result);
  } catch (err) {
    console.error("Error creating goods transfer:", err);
    const status = err.statusCode || 500;
    return res.status(status).json({
      success: false,
      message: err.message || "Terjadi kesalahan server",
      code: err.code,
    });
  }
}

async function listAllHandler(req, res) {
  try {
    const result = await goodsTransferService.listAll({
      status: req.query.status || null,
      page: parseInt(req.query.page) || 1,
      limit: parseInt(req.query.limit) || 50,
    });
    return res.json(result);
  } catch (err) {
    console.error("Error listing goods transfers:", err);
    return res.status(500).json({ success: false, message: "Terjadi kesalahan server", error: err.message });
  }
}

async function listOutgoingHandler(req, res) {
  try {
    const idWarehouseAsal = parseInt(req.query.idWarehouse, 10);
    if (!idWarehouseAsal) {
      return res.status(400).json({ success: false, message: "Parameter idWarehouse wajib diisi" });
    }
    const result = await goodsTransferService.listOutgoing({
      idWarehouseAsal,
      status: req.query.status || null,
      page: parseInt(req.query.page) || 1,
      limit: parseInt(req.query.limit) || 50,
    });
    return res.json(result);
  } catch (err) {
    console.error("Error listing outgoing transfers:", err);
    return res.status(500).json({ success: false, message: "Terjadi kesalahan server", error: err.message });
  }
}

async function listIncomingHandler(req, res) {
  try {
    const idWarehouseTujuan = parseInt(req.query.idWarehouse, 10);
    if (!idWarehouseTujuan) {
      return res.status(400).json({ success: false, message: "Parameter idWarehouse wajib diisi" });
    }
    const result = await goodsTransferService.listIncoming({
      idWarehouseTujuan,
      status: req.query.status || null,
      page: parseInt(req.query.page) || 1,
      limit: parseInt(req.query.limit) || 50,
    });
    return res.json(result);
  } catch (err) {
    console.error("Error listing incoming transfers:", err);
    return res.status(500).json({ success: false, message: "Terjadi kesalahan server", error: err.message });
  }
}

async function detailHandler(req, res) {
  try {
    const result = await goodsTransferService.getDetail(req.params.noTransfer);
    if (!result.success) {
      const status = ERROR_STATUS[result.code] || 400;
      return res.status(status).json(result);
    }
    return res.json(result);
  } catch (err) {
    console.error("Error fetching goods transfer detail:", err);
    return res.status(500).json({ success: false, message: "Terjadi kesalahan server", error: err.message });
  }
}

async function cancelHandler(req, res) {
  try {
    const result = await goodsTransferService.cancelGoodsTransfer({
      noTransfer: req.params.noTransfer,
      ..._actorCtx(req),
    });
    if (!result.success) {
      const status = ERROR_STATUS[result.code] || 400;
      return res.status(status).json(result);
    }
    return res.json(result);
  } catch (err) {
    console.error("Error cancelling goods transfer:", err);
    return res.status(500).json({ success: false, message: "Terjadi kesalahan server", error: err.message });
  }
}

async function rejectHandler(req, res) {
  try {
    const result = await goodsTransferService.rejectGoodsTransfer({
      noTransfer: req.params.noTransfer,
      alasanTolak: req.body?.alasanTolak,
      ..._actorCtx(req),
    });
    if (!result.success) {
      const status = ERROR_STATUS[result.code] || 400;
      return res.status(status).json(result);
    }
    return res.json(result);
  } catch (err) {
    console.error("Error rejecting goods transfer:", err);
    return res.status(500).json({ success: false, message: "Terjadi kesalahan server", error: err.message });
  }
}

async function acceptHandler(req, res) {
  try {
    const result = await goodsTransferService.acceptGoodsTransfer({
      noTransfer: req.params.noTransfer,
      items: req.body?.items,
      ..._actorCtx(req),
    });
    if (!result.success) {
      const status = ERROR_STATUS[result.code] || 400;
      return res.status(status).json(result);
    }
    return res.json(result);
  } catch (err) {
    console.error("Error accepting goods transfer:", err);
    const status = err.statusCode || 500;
    return res.status(status).json({
      success: false,
      message: err.message || "Terjadi kesalahan server",
      code: err.code,
    });
  }
}

module.exports = {
  inspectLabelHandler,
  acceptScanHandler,
  createHandler,
  listAllHandler,
  listOutgoingHandler,
  listIncomingHandler,
  detailHandler,
  cancelHandler,
  rejectHandler,
  acceptHandler,
};
