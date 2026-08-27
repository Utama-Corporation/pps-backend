const { sql, poolPromise } = require("../../core/config/db");
const { generateNextCode } = require("../../core/utils/sequence-code-helper");
const { assertNotLocked } = require("../../core/shared/tutup-transaksi-guard");
const { applyAuditContext } = require("../../core/utils/db-audit-context");
const labelService = require("../label/all/label-service");

const {
  resolveLabelTable,
  getLabelColumn,
  getAvailabilityCheckSQL,
} = labelService;

function toIntOrNull(v) {
  return v === null || v === undefined || Number.isNaN(Number(v))
    ? null
    : Number(v);
}

function normBlok(v) {
  return (v ?? "").toString().trim().toUpperCase();
}

function resolveLabelColExpr(prefix) {
  if (prefix === "A" || prefix === "AB") {
    return "(CAST(NoBahanBaku AS NVARCHAR(50)) + '-' + CAST(NoPallet AS NVARCHAR(10)))";
  }
  return getLabelColumn(prefix);
}

/**
 * Resolve IdWarehouse pemilik sebuah Blok dari dbo.MstBlok (sumber kebenaran
 * relasi Blok->Warehouse) — JANGAN percaya kolom IdWarehouse yang tersimpan
 * langsung di tabel label, karena bisa tidak sinkron dengan Blok terkini.
 */
async function _resolveWarehouseForBlok(pool, blok) {
  const blokNorm = normBlok(blok);
  if (!blokNorm) return null;
  const res = await pool
    .request()
    .input("Blok", sql.VarChar(100), blokNorm)
    .query(`SELECT TOP 1 IdWarehouse FROM dbo.MstBlok WHERE Blok = @Blok`);
  return toIntOrNull(res.recordset[0]?.IdWarehouse);
}

/**
 * Ambil info ketersediaan + lokasi/warehouse saat ini untuk 1 label.
 * Mengembalikan null jika label tidak dikenali.
 */
async function _inspectLabel(pool, labelCode) {
  const prefix = (String(labelCode).split(".")[0] || "").toUpperCase();
  const tableName = resolveLabelTable(prefix);
  if (!tableName) return null;

  const sqlText = getAvailabilityCheckSQL(prefix, tableName);
  const res = await pool
    .request()
    .input("LabelCode", sql.NVarChar(50), labelCode)
    .query(sqlText);

  if (!res.recordset.length) return null;

  const row = res.recordset[0];
  const blok = row.Blok ?? null;

  return {
    prefix,
    tableName,
    labelCol: resolveLabelColExpr(prefix),
    blok,
    idLokasi: toIntOrNull(row.IdLokasi),
    // IdWarehouse dihitung dari MstBlok (relasi Blok->Warehouse yang sebenarnya),
    // bukan dari kolom IdWarehouse pada tabel label yang bisa basi.
    idWarehouse: await _resolveWarehouseForBlok(pool, blok),
    available: !!row.Available,
  };
}

async function _isInTransit(runner, labelCode) {
  const req = new sql.Request(runner);
  const res = await req
    .input("LabelCode", sql.NVarChar(50), labelCode).query(`
      SELECT TOP 1 1 AS Found
      FROM dbo.GoodsTransferItem
      WHERE LabelCode = @LabelCode AND StatusItem = 'IN_TRANSIT'
    `);
  return res.recordset.length > 0;
}

/**
 * Cek 1 label sebelum ditambahkan ke daftar transfer (dipanggil setiap kali
 * user scan/input kode label di layar create). Menolak kalau label tidak
 * dikenali, sudah terpakai, sedang IN_TRANSIT, atau blok saat ini bukan milik
 * warehouse asal yang dipilih.
 */
async function inspectLabel({ labelCode, idWarehouseAsal }) {
  const code = String(labelCode || "").trim();
  if (!code) {
    return { success: false, code: "VALIDATION_ERROR", message: "labelCode wajib diisi" };
  }

  const pool = await poolPromise;
  const info = await _inspectLabel(pool, code);

  if (!info) {
    return {
      success: false,
      code: "UNKNOWN_PREFIX",
      message: `Label ${code} tidak dikenali`,
    };
  }
  if (!info.available) {
    return {
      success: false,
      code: "ALREADY_USED",
      message: `Label ${code} sudah terpakai`,
    };
  }
  if (await _isInTransit(pool, code)) {
    return {
      success: false,
      code: "LABEL_IN_TRANSIT",
      message: `Label ${code} sedang dalam proses Goods Transfer lain`,
    };
  }

  const whAsal = toIntOrNull(idWarehouseAsal);
  if (whAsal !== null && info.idWarehouse !== whAsal) {
    return {
      success: false,
      code: "WAREHOUSE_MISMATCH",
      message: `Label ${code} berada di blok ${info.blok ?? "-"} yang bukan milik warehouse asal yang dipilih`,
    };
  }

  const summary = await labelService.getLabelSummaryByCode(code);

  return {
    success: true,
    data: {
      labelCode: code,
      prefix: info.prefix,
      blok: info.blok,
      idLokasi: info.idLokasi,
      idWarehouse: info.idWarehouse,
      namaJenis: summary?.NamaJenis ?? null,
      kategori: summary?.Kategori ?? null,
      uom: summary?.Uom ?? null,
      qty: summary?.Qty ?? null,
      berat: summary?.Berat ?? null,
    },
  };
}

/**
 * Create Goods Transfer: kirim N label dari 1 warehouse asal ke 1 warehouse tujuan.
 */
async function createGoodsTransfer({
  idWarehouseAsal,
  idWarehouseTujuan,
  labelCodes,
  tanggalKirim,
  catatan,
  actorId,
  actorUsername,
  requestId,
}) {
  const whAsal = toIntOrNull(idWarehouseAsal);
  const whTujuan = toIntOrNull(idWarehouseTujuan);

  if (!whAsal || !whTujuan) {
    return {
      success: false,
      code: "VALIDATION_ERROR",
      message: "idWarehouseAsal dan idWarehouseTujuan wajib diisi",
    };
  }
  if (whAsal === whTujuan) {
    return {
      success: false,
      code: "SAME_WAREHOUSE",
      message: "Warehouse asal dan tujuan tidak boleh sama",
    };
  }
  const codes = Array.isArray(labelCodes)
    ? [...new Set(labelCodes.map((c) => String(c).trim()).filter(Boolean))]
    : [];
  if (codes.length === 0) {
    return {
      success: false,
      code: "VALIDATION_ERROR",
      message: "labelCodes wajib diisi minimal 1 label",
    };
  }

  const pool = await poolPromise;
  const tx = new sql.Transaction(pool);
  let began = false;

  try {
    await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    began = true;

    await applyAuditContext(new sql.Request(tx), {
      actorId,
      actorUsername,
      requestId,
    });

    await assertNotLocked({
      date: tanggalKirim,
      runner: tx,
      action: "membuat Goods Transfer",
      useLock: true,
    });

    const items = [];
    for (const labelCode of codes) {
      const info = await _inspectLabel(pool, labelCode);
      if (!info) {
        await tx.rollback();
        return {
          success: false,
          code: "UNKNOWN_PREFIX",
          message: `Label ${labelCode} tidak dikenali`,
        };
      }
      if (!info.available) {
        await tx.rollback();
        return {
          success: false,
          code: "ALREADY_USED",
          message: `Label ${labelCode} sudah terpakai`,
        };
      }
      if (info.idWarehouse !== whAsal) {
        await tx.rollback();
        return {
          success: false,
          code: "WAREHOUSE_MISMATCH",
          message: `Label ${labelCode} tidak berada di warehouse asal yang dipilih`,
        };
      }
      if (await _isInTransit(tx, labelCode)) {
        await tx.rollback();
        return {
          success: false,
          code: "LABEL_IN_TRANSIT",
          message: `Label ${labelCode} sedang dalam proses Goods Transfer lain`,
        };
      }
      items.push({ labelCode, ...info });
    }

    const noTransfer = await generateNextCode(tx, {
      tableName: "dbo.GoodsTransfer_h",
      columnName: "NoTransfer",
      prefix: "GT.",
      width: 10,
    });

    await new sql.Request(tx)
      .input("NoTransfer", sql.VarChar(20), noTransfer)
      .input("TanggalKirim", sql.Date, tanggalKirim)
      .input("IdWarehouseAsal", sql.Int, whAsal)
      .input("IdWarehouseTujuan", sql.Int, whTujuan)
      .input("IdUsernameKirim", sql.Int, actorId)
      .input("Catatan", sql.VarChar(500), catatan || null).query(`
        INSERT INTO dbo.GoodsTransfer_h
          (NoTransfer, TanggalKirim, IdWarehouseAsal, IdWarehouseTujuan, IdUsernameKirim, Catatan)
        VALUES
          (@NoTransfer, @TanggalKirim, @IdWarehouseAsal, @IdWarehouseTujuan, @IdUsernameKirim, @Catatan)
      `);

    for (const item of items) {
      await new sql.Request(tx)
        .input("NoTransfer", sql.VarChar(20), noTransfer)
        .input("LabelCode", sql.VarChar(50), item.labelCode)
        .input("PrefixKategori", sql.VarChar(10), item.prefix)
        .input("BlokAsal", sql.VarChar(50), item.blok)
        .input("IdLokasiAsal", sql.Int, item.idLokasi).query(`
          INSERT INTO dbo.GoodsTransferItem
            (NoTransfer, LabelCode, PrefixKategori, BlokAsal, IdLokasiAsal)
          VALUES
            (@NoTransfer, @LabelCode, @PrefixKategori, @BlokAsal, @IdLokasiAsal)
        `);
    }

    await tx.commit();

    return {
      success: true,
      code: "CREATED",
      message: `Goods Transfer ${noTransfer} berhasil dibuat`,
      data: { noTransfer, itemCount: items.length },
    };
  } catch (err) {
    if (began) {
      try {
        await tx.rollback();
      } catch (_) {}
    }
    throw err;
  }
}

async function _getHeader(runner, noTransfer) {
  const req = new sql.Request(runner);
  const res = await req.input("NoTransfer", sql.VarChar(20), noTransfer).query(`
      SELECT h.*, whAsal.NamaWarehouse AS NamaWarehouseAsal, whTujuan.NamaWarehouse AS NamaWarehouseTujuan,
             uKirim.Username AS UsernameKirim, uTerima.Username AS UsernameTerima
      FROM dbo.GoodsTransfer_h h
      LEFT JOIN dbo.MstWarehouse whAsal ON whAsal.IdWarehouse = h.IdWarehouseAsal
      LEFT JOIN dbo.MstWarehouse whTujuan ON whTujuan.IdWarehouse = h.IdWarehouseTujuan
      LEFT JOIN dbo.MstUsername uKirim ON uKirim.IdUsername = h.IdUsernameKirim
      LEFT JOIN dbo.MstUsername uTerima ON uTerima.IdUsername = h.IdUsernameTerima
      WHERE h.NoTransfer = @NoTransfer
    `);
  return res.recordset[0] || null;
}

async function getDetail(noTransfer) {
  const pool = await poolPromise;
  const header = await _getHeader(pool, noTransfer);
  if (!header) {
    return { success: false, code: "NOT_FOUND", message: "Transfer tidak ditemukan" };
  }
  const itemsRes = await pool
    .request()
    .input("NoTransfer", sql.VarChar(20), noTransfer)
    .query(`SELECT * FROM dbo.GoodsTransferItem WHERE NoTransfer = @NoTransfer ORDER BY IdTransferItem`);

  // Lengkapi tiap item dengan ringkasan label (jenis/kategori/uom/qty/berat) —
  // sumber sama dengan yang dipakai layar Create (inspect-label), supaya
  // daftar label di detail transfer tampil konsisten.
  const items = await Promise.all(
    itemsRes.recordset.map(async (item) => {
      const summary = await labelService.getLabelSummaryByCode(item.LabelCode);
      return {
        ...item,
        NamaJenis: summary?.NamaJenis ?? null,
        Kategori: summary?.Kategori ?? null,
        Uom: summary?.Uom ?? null,
        Qty: summary?.Qty ?? null,
        Berat: summary?.Berat ?? null,
      };
    }),
  );

  return {
    success: true,
    data: { header, items },
  };
}

async function listAll({ status, page = 1, limit = 50 }) {
  const pool = await poolPromise;
  const offset = (page - 1) * limit;
  const req = pool.request();
  let where = "";
  if (status) {
    req.input("Status", sql.VarChar(20), status);
    where = "WHERE Status = @Status";
  }
  req.input("Offset", sql.Int, offset).input("Limit", sql.Int, limit);

  const res = await req.query(`
    SELECT h.*, whAsal.NamaWarehouse AS NamaWarehouseAsal, whTujuan.NamaWarehouse AS NamaWarehouseTujuan,
           uKirim.Username AS UsernameKirim,
           (SELECT COUNT(*) FROM dbo.GoodsTransferItem gi WHERE gi.NoTransfer = h.NoTransfer) AS ItemCount
    FROM dbo.GoodsTransfer_h h
    LEFT JOIN dbo.MstWarehouse whAsal ON whAsal.IdWarehouse = h.IdWarehouseAsal
    LEFT JOIN dbo.MstWarehouse whTujuan ON whTujuan.IdWarehouse = h.IdWarehouseTujuan
    LEFT JOIN dbo.MstUsername uKirim ON uKirim.IdUsername = h.IdUsernameKirim
    ${where}
    ORDER BY h.DateTimeKirim DESC
    OFFSET @Offset ROWS FETCH NEXT @Limit ROWS ONLY
  `);
  return { success: true, data: res.recordset };
}

async function listOutgoing({ idWarehouseAsal, status, page = 1, limit = 50 }) {
  const pool = await poolPromise;
  const offset = (page - 1) * limit;
  const req = pool.request().input("IdWarehouseAsal", sql.Int, idWarehouseAsal);
  let where = "WHERE h.IdWarehouseAsal = @IdWarehouseAsal";
  if (status) {
    req.input("Status", sql.VarChar(20), status);
    where += " AND h.Status = @Status";
  }
  req.input("Offset", sql.Int, offset).input("Limit", sql.Int, limit);

  const res = await req.query(`
    SELECT h.*, whAsal.NamaWarehouse AS NamaWarehouseAsal, whTujuan.NamaWarehouse AS NamaWarehouseTujuan,
           uKirim.Username AS UsernameKirim,
           (SELECT COUNT(*) FROM dbo.GoodsTransferItem gi WHERE gi.NoTransfer = h.NoTransfer) AS ItemCount
    FROM dbo.GoodsTransfer_h h
    LEFT JOIN dbo.MstWarehouse whAsal ON whAsal.IdWarehouse = h.IdWarehouseAsal
    LEFT JOIN dbo.MstWarehouse whTujuan ON whTujuan.IdWarehouse = h.IdWarehouseTujuan
    LEFT JOIN dbo.MstUsername uKirim ON uKirim.IdUsername = h.IdUsernameKirim
    ${where}
    ORDER BY h.DateTimeKirim DESC
    OFFSET @Offset ROWS FETCH NEXT @Limit ROWS ONLY
  `);
  return { success: true, data: res.recordset };
}

async function listIncoming({ idWarehouseTujuan, status, page = 1, limit = 50 }) {
  const pool = await poolPromise;
  const offset = (page - 1) * limit;
  const req = pool.request().input("IdWarehouseTujuan", sql.Int, idWarehouseTujuan);
  let where = "WHERE h.IdWarehouseTujuan = @IdWarehouseTujuan";
  if (status) {
    req.input("Status", sql.VarChar(20), status);
    where += " AND h.Status = @Status";
  }
  req.input("Offset", sql.Int, offset).input("Limit", sql.Int, limit);

  const res = await req.query(`
    SELECT h.*, whAsal.NamaWarehouse AS NamaWarehouseAsal, whTujuan.NamaWarehouse AS NamaWarehouseTujuan,
           uKirim.Username AS UsernameKirim,
           (SELECT COUNT(*) FROM dbo.GoodsTransferItem gi WHERE gi.NoTransfer = h.NoTransfer) AS ItemCount
    FROM dbo.GoodsTransfer_h h
    LEFT JOIN dbo.MstWarehouse whAsal ON whAsal.IdWarehouse = h.IdWarehouseAsal
    LEFT JOIN dbo.MstWarehouse whTujuan ON whTujuan.IdWarehouse = h.IdWarehouseTujuan
    LEFT JOIN dbo.MstUsername uKirim ON uKirim.IdUsername = h.IdUsernameKirim
    ${where}
    ORDER BY h.DateTimeKirim DESC
    OFFSET @Offset ROWS FETCH NEXT @Limit ROWS ONLY
  `);
  return { success: true, data: res.recordset };
}

async function cancelGoodsTransfer({ noTransfer, actorId, actorUsername, requestId }) {
  const pool = await poolPromise;
  const tx = new sql.Transaction(pool);
  let began = false;

  try {
    await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    began = true;

    await applyAuditContext(new sql.Request(tx), { actorId, actorUsername, requestId });

    const headerReq = new sql.Request(tx);
    const headerRes = await headerReq
      .input("NoTransfer", sql.VarChar(20), noTransfer)
      .query(`SELECT * FROM dbo.GoodsTransfer_h WITH (UPDLOCK, HOLDLOCK) WHERE NoTransfer = @NoTransfer`);
    const header = headerRes.recordset[0];

    if (!header) {
      await tx.rollback();
      return { success: false, code: "NOT_FOUND", message: "Transfer tidak ditemukan" };
    }
    if (header.Status !== "IN_TRANSIT") {
      await tx.rollback();
      return {
        success: false,
        code: "INVALID_STATUS",
        message: `Transfer sudah berstatus ${header.Status}, tidak bisa dibatalkan`,
      };
    }

    await new sql.Request(tx)
      .input("NoTransfer", sql.VarChar(20), noTransfer)
      .query(`UPDATE dbo.GoodsTransferItem SET StatusItem = 'CANCELLED', UpdatedAt = GETDATE() WHERE NoTransfer = @NoTransfer`);

    await new sql.Request(tx)
      .input("NoTransfer", sql.VarChar(20), noTransfer)
      .input("IdUsernameCancel", sql.Int, actorId).query(`
        UPDATE dbo.GoodsTransfer_h
        SET Status = 'CANCELLED', IdUsernameCancel = @IdUsernameCancel, DateTimeCancel = GETDATE(), UpdatedAt = GETDATE()
        WHERE NoTransfer = @NoTransfer
      `);

    await tx.commit();
    return { success: true, code: "CANCELLED", message: `Transfer ${noTransfer} dibatalkan` };
  } catch (err) {
    if (began) {
      try {
        await tx.rollback();
      } catch (_) {}
    }
    throw err;
  }
}

async function rejectGoodsTransfer({ noTransfer, alasanTolak, actorId, actorUsername, requestId }) {
  if (!alasanTolak || !String(alasanTolak).trim()) {
    return { success: false, code: "VALIDATION_ERROR", message: "alasanTolak wajib diisi" };
  }

  const pool = await poolPromise;
  const tx = new sql.Transaction(pool);
  let began = false;

  try {
    await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    began = true;

    await applyAuditContext(new sql.Request(tx), { actorId, actorUsername, requestId });

    const headerReq = new sql.Request(tx);
    const headerRes = await headerReq
      .input("NoTransfer", sql.VarChar(20), noTransfer)
      .query(`SELECT * FROM dbo.GoodsTransfer_h WITH (UPDLOCK, HOLDLOCK) WHERE NoTransfer = @NoTransfer`);
    const header = headerRes.recordset[0];

    if (!header) {
      await tx.rollback();
      return { success: false, code: "NOT_FOUND", message: "Transfer tidak ditemukan" };
    }
    if (header.Status !== "IN_TRANSIT") {
      await tx.rollback();
      return {
        success: false,
        code: "INVALID_STATUS",
        message: `Transfer sudah berstatus ${header.Status}, tidak bisa ditolak`,
      };
    }

    await new sql.Request(tx)
      .input("NoTransfer", sql.VarChar(20), noTransfer)
      .query(`UPDATE dbo.GoodsTransferItem SET StatusItem = 'REJECTED', UpdatedAt = GETDATE() WHERE NoTransfer = @NoTransfer`);

    await new sql.Request(tx)
      .input("NoTransfer", sql.VarChar(20), noTransfer)
      .input("IdUsernameTerima", sql.Int, actorId)
      .input("AlasanTolak", sql.VarChar(500), alasanTolak).query(`
        UPDATE dbo.GoodsTransfer_h
        SET Status = 'REJECTED', IdUsernameTerima = @IdUsernameTerima, DateTimeTerima = GETDATE(),
            TanggalTerima = CONVERT(date, GETDATE()), AlasanTolak = @AlasanTolak, UpdatedAt = GETDATE()
        WHERE NoTransfer = @NoTransfer
      `);

    await tx.commit();
    return { success: true, code: "REJECTED", message: `Transfer ${noTransfer} ditolak` };
  } catch (err) {
    if (began) {
      try {
        await tx.rollback();
      } catch (_) {}
    }
    throw err;
  }
}

/**
 * Accept: commit perpindahan warehouse ke tabel label asli.
 * items: [{ labelCode, blokTujuan, idLokasiTujuan }]
 */
async function acceptGoodsTransfer({ noTransfer, items, actorId, actorUsername, requestId }) {
  const itemInputs = Array.isArray(items) ? items : [];
  if (itemInputs.length === 0) {
    return { success: false, code: "VALIDATION_ERROR", message: "items wajib diisi" };
  }
  for (const it of itemInputs) {
    if (!it.labelCode || !it.blokTujuan || toIntOrNull(it.idLokasiTujuan) === null) {
      return {
        success: false,
        code: "VALIDATION_ERROR",
        message: "Setiap item wajib memiliki labelCode, blokTujuan, dan idLokasiTujuan",
      };
    }
  }

  const pool = await poolPromise;
  const tx = new sql.Transaction(pool);
  let began = false;

  try {
    await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    began = true;

    await applyAuditContext(new sql.Request(tx), { actorId, actorUsername, requestId });

    const headerReq = new sql.Request(tx);
    const headerRes = await headerReq
      .input("NoTransfer", sql.VarChar(20), noTransfer)
      .query(`SELECT * FROM dbo.GoodsTransfer_h WITH (UPDLOCK, HOLDLOCK) WHERE NoTransfer = @NoTransfer`);
    const header = headerRes.recordset[0];

    if (!header) {
      await tx.rollback();
      return { success: false, code: "NOT_FOUND", message: "Transfer tidak ditemukan" };
    }
    if (header.Status !== "IN_TRANSIT") {
      await tx.rollback();
      return {
        success: false,
        code: "INVALID_STATUS",
        message: `Transfer sudah berstatus ${header.Status}, tidak bisa diterima`,
      };
    }

    const dbItemsRes = await new sql.Request(tx)
      .input("NoTransfer", sql.VarChar(20), noTransfer)
      .query(`SELECT * FROM dbo.GoodsTransferItem WHERE NoTransfer = @NoTransfer`);
    const dbItems = dbItemsRes.recordset;

    const inputByLabel = new Map(itemInputs.map((it) => [it.labelCode, it]));
    for (const dbItem of dbItems) {
      const input = inputByLabel.get(dbItem.LabelCode);
      if (!input) {
        await tx.rollback();
        return {
          success: false,
          code: "VALIDATION_ERROR",
          message: `Item untuk label ${dbItem.LabelCode} belum diberi lokasi tujuan`,
        };
      }

      const tableName = resolveLabelTable(dbItem.PrefixKategori);
      const labelCol = resolveLabelColExpr(dbItem.PrefixKategori);
      const blokTujuan = normBlok(input.blokTujuan);
      const idLokasiTujuan = toIntOrNull(input.idLokasiTujuan);

      await new sql.Request(tx)
        .input("Blok", sql.VarChar(50), blokTujuan)
        .input("IdLokasi", sql.Int, idLokasiTujuan)
        .input("IdWarehouse", sql.Int, header.IdWarehouseTujuan)
        .input("LabelCode", sql.NVarChar(50), dbItem.LabelCode).query(`
          UPDATE ${tableName}
          SET Blok = @Blok, IdLokasi = @IdLokasi, IdWarehouse = @IdWarehouse
          WHERE ${labelCol} = @LabelCode
        `);

      await new sql.Request(tx)
        .input("IdTransferItem", sql.Int, dbItem.IdTransferItem)
        .input("BlokTujuan", sql.VarChar(50), blokTujuan)
        .input("IdLokasiTujuan", sql.Int, idLokasiTujuan).query(`
          UPDATE dbo.GoodsTransferItem
          SET StatusItem = 'RECEIVED', BlokTujuan = @BlokTujuan, IdLokasiTujuan = @IdLokasiTujuan, UpdatedAt = GETDATE()
          WHERE IdTransferItem = @IdTransferItem
        `);
    }

    await new sql.Request(tx)
      .input("NoTransfer", sql.VarChar(20), noTransfer)
      .input("IdUsernameTerima", sql.Int, actorId).query(`
        UPDATE dbo.GoodsTransfer_h
        SET Status = 'RECEIVED', IdUsernameTerima = @IdUsernameTerima, DateTimeTerima = GETDATE(),
            TanggalTerima = CONVERT(date, GETDATE()), UpdatedAt = GETDATE()
        WHERE NoTransfer = @NoTransfer
      `);

    await tx.commit();
    return { success: true, code: "RECEIVED", message: `Transfer ${noTransfer} diterima` };
  } catch (err) {
    if (began) {
      try {
        await tx.rollback();
      } catch (_) {}
    }
    throw err;
  }
}

/**
 * Terima 1 label lewat scan: resolve transfer & item aktif untuk labelCode
 * ini, commit perpindahan warehouse/blok/lokasi ke tabel label asli, tandai
 * item RECEIVED, dan kalau ini item terakhir yang IN_TRANSIT pada transfer
 * tsb, header ikut ditandai RECEIVED juga.
 */
async function acceptScannedItem({
  labelCode,
  blokTujuan,
  idLokasiTujuan,
  actorId,
  actorUsername,
  requestId,
}) {
  const code = String(labelCode || "").trim();
  const blok = normBlok(blokTujuan);
  const idLokasi = toIntOrNull(idLokasiTujuan);

  if (!code || !blok || idLokasi === null) {
    return {
      success: false,
      code: "VALIDATION_ERROR",
      message: "labelCode, blokTujuan, dan idLokasiTujuan wajib diisi",
    };
  }

  const pool = await poolPromise;
  const tx = new sql.Transaction(pool);
  let began = false;

  try {
    await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    began = true;

    await applyAuditContext(new sql.Request(tx), { actorId, actorUsername, requestId });

    const itemRes = await new sql.Request(tx)
      .input("LabelCode", sql.VarChar(50), code).query(`
        SELECT TOP 1 * FROM dbo.GoodsTransferItem WITH (UPDLOCK, HOLDLOCK)
        WHERE LabelCode = @LabelCode AND StatusItem = 'IN_TRANSIT'
      `);
    const item = itemRes.recordset[0];

    if (!item) {
      await tx.rollback();
      return {
        success: false,
        code: "NOT_IN_TRANSIT",
        message: `Label ${code} tidak sedang dalam proses penerimaan Goods Transfer`,
      };
    }

    const headerRes = await new sql.Request(tx)
      .input("NoTransfer", sql.VarChar(20), item.NoTransfer)
      .query(`SELECT * FROM dbo.GoodsTransfer_h WITH (UPDLOCK, HOLDLOCK) WHERE NoTransfer = @NoTransfer`);
    const header = headerRes.recordset[0];

    if (!header || header.Status !== "IN_TRANSIT") {
      await tx.rollback();
      return {
        success: false,
        code: "INVALID_STATUS",
        message: `Transfer ${item.NoTransfer} sudah tidak aktif`,
      };
    }

    // Guard: blok tujuan yang dipilih user harus benar milik warehouse tujuan transfer ini,
    // supaya scan label yang seharusnya untuk transfer lain tidak nyasar ke lokasi salah.
    const blokRes = await new sql.Request(tx)
      .input("Blok", sql.VarChar(100), blok)
      .query(`SELECT TOP 1 IdWarehouse FROM dbo.MstBlok WHERE Blok = @Blok`);
    const blokWarehouse = toIntOrNull(blokRes.recordset[0]?.IdWarehouse);

    if (blokWarehouse === null || blokWarehouse !== header.IdWarehouseTujuan) {
      await tx.rollback();
      return {
        success: false,
        code: "WAREHOUSE_MISMATCH",
        message: `Label ${code} adalah bagian dari transfer ke warehouse lain, bukan tujuan yang dipilih`,
      };
    }

    const tableName = resolveLabelTable(item.PrefixKategori);
    const labelCol = resolveLabelColExpr(item.PrefixKategori);

    await new sql.Request(tx)
      .input("Blok", sql.VarChar(50), blok)
      .input("IdLokasi", sql.Int, idLokasi)
      .input("IdWarehouse", sql.Int, header.IdWarehouseTujuan)
      .input("LabelCode", sql.NVarChar(50), code).query(`
        UPDATE ${tableName}
        SET Blok = @Blok, IdLokasi = @IdLokasi, IdWarehouse = @IdWarehouse
        WHERE ${labelCol} = @LabelCode
      `);

    await new sql.Request(tx)
      .input("IdTransferItem", sql.Int, item.IdTransferItem)
      .input("BlokTujuan", sql.VarChar(50), blok)
      .input("IdLokasiTujuan", sql.Int, idLokasi).query(`
        UPDATE dbo.GoodsTransferItem
        SET StatusItem = 'RECEIVED', BlokTujuan = @BlokTujuan, IdLokasiTujuan = @IdLokasiTujuan, UpdatedAt = GETDATE()
        WHERE IdTransferItem = @IdTransferItem
      `);

    const remainingRes = await new sql.Request(tx)
      .input("NoTransfer", sql.VarChar(20), item.NoTransfer).query(`
        SELECT COUNT(*) AS Remaining FROM dbo.GoodsTransferItem
        WHERE NoTransfer = @NoTransfer AND StatusItem = 'IN_TRANSIT'
      `);
    const remaining = remainingRes.recordset[0]?.Remaining ?? 0;

    let transferCompleted = false;
    if (remaining === 0) {
      await new sql.Request(tx)
        .input("NoTransfer", sql.VarChar(20), item.NoTransfer)
        .input("IdUsernameTerima", sql.Int, actorId).query(`
          UPDATE dbo.GoodsTransfer_h
          SET Status = 'RECEIVED', IdUsernameTerima = @IdUsernameTerima, DateTimeTerima = GETDATE(),
              TanggalTerima = CONVERT(date, GETDATE()), UpdatedAt = GETDATE()
          WHERE NoTransfer = @NoTransfer
        `);
      transferCompleted = true;
    }

    await tx.commit();

    return {
      success: true,
      code: "RECEIVED",
      message: `Label ${code} berhasil diterima`,
      data: {
        labelCode: code,
        noTransfer: item.NoTransfer,
        prefixKategori: item.PrefixKategori,
        remainingItems: remaining,
        transferCompleted,
      },
    };
  } catch (err) {
    if (began) {
      try {
        await tx.rollback();
      } catch (_) {}
    }
    throw err;
  }
}

module.exports = {
  inspectLabel,
  createGoodsTransfer,
  getDetail,
  listAll,
  listOutgoing,
  listIncoming,
  cancelGoodsTransfer,
  rejectGoodsTransfer,
  acceptGoodsTransfer,
  acceptScannedItem,
};
