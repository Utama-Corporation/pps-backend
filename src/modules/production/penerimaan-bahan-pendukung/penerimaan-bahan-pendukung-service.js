// penerimaan-bahan-pendukung-service.js
//
// Mengikuti pola penerimaan-bahan-baku-service.js (2 fase: create header lalu
// add items), TAPI disederhanakan sesuai kebutuhan bahan pendukung:
//   - Tidak ada struktur pallet/sak — barang pendukung (baut/pipa/plat/dll)
//     dihitung PCS, jadi tiap baris "item" (PenerimaanBahanPendukung_d)
//     LANGSUNG jadi 1 "label" (NamaBarang + Qty + Satuan), tanpa breakdown.
//   - Tidak ada kategori/prefix label seperti bahan baku (Pakai/Proses) —
//     satu kategori saja, jadi tidak perlu resolveKategoriPrefix ataupun
//     multi-kategori per section.
//   - Tim dari tabel GLOBAL dbo.MstTimPenerimaan (bukan MstTimPenerimaanBB
//     yang khusus bahan baku) — supaya bisa dipakai ulang modul penerimaan
//     lain di masa depan.
const { sql, poolPromise } = require("../../../core/config/db");
const { generateNextCode } = require("../../../core/utils/sequence-code-helper");
const { badReq, notFound, conflict } = require("../../../core/utils/http-error");
const { applyAuditContext } = require("../../../core/utils/db-audit-context");
const {
  assertNotLocked,
  loadDocDateOnlyFromConfig,
  toDateOnly,
} = require("../../../core/shared/tutup-transaksi-guard");

function validateHeaderPayload(payload) {
  const tglPenerimaan = String(payload?.tglPenerimaan || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tglPenerimaan)) {
    throw badReq("tglPenerimaan wajib diisi dengan format YYYY-MM-DD");
  }

  const idTim = Number(payload?.idTim);
  if (!Number.isInteger(idTim) || idTim <= 0) {
    throw badReq("idTim wajib diisi");
  }

  const shift = Number(payload?.shift);
  if (!Number.isInteger(shift) || shift <= 0) {
    throw badReq("shift wajib diisi");
  }

  const hourStart = String(payload?.hourStart || "").trim();
  if (!hourStart) {
    throw badReq("hourStart wajib diisi");
  }

  const hourEnd = String(payload?.hourEnd || "").trim();
  if (!hourEnd) {
    throw badReq("hourEnd wajib diisi");
  }

  const idOperators = [
    ...new Set(
      (Array.isArray(payload?.idOperators) ? payload.idOperators : [])
        .map((v) => Number(v))
        .filter((n) => Number.isInteger(n) && n > 0),
    ),
  ];
  if (idOperators.length === 0) {
    throw badReq("idOperators wajib diisi minimal 1 operator");
  }

  return { tglPenerimaan, idTim, shift, hourStart, hourEnd, idOperators };
}

function normalizeItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw badReq("items wajib berisi minimal 1 barang");
  }

  return items.map((it, i) => {
    const idSupplier = Number(it?.idSupplier);
    if (!Number.isInteger(idSupplier) || idSupplier <= 0) {
      throw badReq(`items[${i}].idSupplier wajib diisi`);
    }

    const namaBarang = String(it?.namaBarang || "").trim();
    if (!namaBarang) {
      throw badReq(`items[${i}].namaBarang wajib diisi`);
    }

    const qty = Number(it?.qty);
    if (!Number.isFinite(qty) || qty <= 0) {
      throw badReq(`items[${i}].qty wajib valid (> 0)`);
    }

    const satuan = String(it?.satuan || "PCS").trim() || "PCS";
    const keterangan = it?.keterangan != null ? String(it.keterangan).trim() || null : null;

    return { idSupplier, namaBarang, qty, satuan, keterangan };
  });
}

async function generateUniqueCode(tx, opts) {
  let code = await generateNextCode(tx, opts);
  const existing = await new sql.Request(tx)
    .input("Code", sql.VarChar(50), code)
    .query(`SELECT 1 FROM ${opts.tableName} WITH (UPDLOCK, HOLDLOCK) WHERE ${opts.columnName} = @Code`);

  if (existing.recordset.length > 0) {
    code = await generateNextCode(tx, opts);
    const existing2 = await new sql.Request(tx)
      .input("Code", sql.VarChar(50), code)
      .query(`SELECT 1 FROM ${opts.tableName} WITH (UPDLOCK, HOLDLOCK) WHERE ${opts.columnName} = @Code`);
    if (existing2.recordset.length > 0) {
      throw conflict(`Gagal generate ${opts.columnName} unik, coba lagi`);
    }
  }

  return code;
}

async function assertTimAktif(tx, idTim) {
  const result = await new sql.Request(tx)
    .input("IdTim", sql.Int, idTim)
    .query(`SELECT Aktif FROM dbo.MstTimPenerimaan WHERE IdTim = @IdTim`);

  const row = result.recordset[0];
  if (!row) {
    throw badReq(`IdTim ${idTim} tidak ditemukan`);
  }
  if (!row.Aktif) {
    throw badReq(`Tim penerimaan dengan IdTim ${idTim} sedang tidak aktif`);
  }
}

// ==========================================
//  FASE 1: CREATE HEADER (analog PenerimaanBahanBaku_h create)
//  POST /api/penerimaan-bahan-pendukung
// ==========================================
async function createHeaderPenerimaanBahanPendukung(payload, ctx) {
  const v = validateHeaderPayload(payload);
  const { actorId, actorUsername, requestId } = ctx || {};

  if (!actorId) {
    throw badReq("actorId kosong / tidak valid. Controller harus inject actorId dari token.");
  }

  const pool = await poolPromise;
  const tx = new sql.Transaction(pool);

  try {
    await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);

    const audit = await applyAuditContext(new sql.Request(tx), {
      actorId,
      actorUsername,
      requestId,
    });

    const docDateOnly = toDateOnly(v.tglPenerimaan);
    await assertNotLocked({
      date: docDateOnly,
      runner: tx,
      action: "create PenerimaanBahanPendukung (header)",
      useLock: true,
    });

    await assertTimAktif(tx, v.idTim);

    const noPenerimaan = await generateUniqueCode(tx, {
      tableName: "dbo.PenerimaanBahanPendukung_h",
      columnName: "NoPenerimaan",
      prefix: "PP.",
      width: 10,
    });

    await new sql.Request(tx)
      .input("NoPenerimaan", sql.VarChar(20), noPenerimaan)
      .input("TglPenerimaan", sql.Date, v.tglPenerimaan)
      .input("IdTim", sql.Int, v.idTim)
      .input("Shift", sql.Int, v.shift)
      .input("HourStart", sql.VarChar(20), v.hourStart)
      .input("HourEnd", sql.VarChar(20), v.hourEnd)
      .input("CreateBy", sql.VarChar(100), actorUsername || null)
      .query(`
        INSERT INTO dbo.PenerimaanBahanPendukung_h
          (NoPenerimaan, TglPenerimaan, IdTim, Shift, HourStart, HourEnd, CreateBy)
        VALUES
          (
            @NoPenerimaan, @TglPenerimaan, @IdTim,
            @Shift,
            CASE WHEN @HourStart IS NULL OR LTRIM(RTRIM(@HourStart)) = '' THEN NULL ELSE CAST(@HourStart AS time(7)) END,
            CASE WHEN @HourEnd IS NULL OR LTRIM(RTRIM(@HourEnd)) = '' THEN NULL ELSE CAST(@HourEnd AS time(7)) END,
            @CreateBy
          )
      `);

    const rqOp = new sql.Request(tx);
    rqOp.input("NoPenerimaan", sql.VarChar(20), noPenerimaan);
    const opValues = v.idOperators.map((opId, i) => {
      const p = `Op${i}`;
      rqOp.input(p, sql.Int, opId);
      return `(@NoPenerimaan, @${p})`;
    });
    await rqOp.query(`
      INSERT INTO dbo.PenerimaanBahanPendukungOperator_d (NoPenerimaan, IdOperator)
      VALUES ${opValues.join(", ")};
    `);

    await tx.commit();

    return {
      noPenerimaan,
      tglPenerimaan: v.tglPenerimaan,
      idTim: v.idTim,
      idOperators: v.idOperators,
      shift: v.shift,
      hourStart: v.hourStart,
      hourEnd: v.hourEnd,
      audit: { actorId: audit.actorId, requestId: audit.requestId },
    };
  } catch (err) {
    try {
      await tx.rollback();
    } catch (_) {}
    throw err;
  }
}

// ==========================================
//  FASE 2: ADD ITEMS ke NoPenerimaan yang SUDAH ADA
//  POST /api/penerimaan-bahan-pendukung/:noPenerimaan/items
//  Boleh dipanggil >1x untuk NoPenerimaan yang sama.
// ==========================================
async function addItemsPenerimaanBahanPendukung(noPenerimaan, payload, ctx) {
  const items = normalizeItems(payload?.items);
  const { actorId, actorUsername, requestId } = ctx || {};

  if (!actorId) {
    throw badReq("actorId kosong / tidak valid. Controller harus inject actorId dari token.");
  }

  const pool = await poolPromise;
  const tx = new sql.Transaction(pool);

  try {
    await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);

    const audit = await applyAuditContext(new sql.Request(tx), {
      actorId,
      actorUsername,
      requestId,
    });

    const headerRows = await new sql.Request(tx)
      .input("NoPenerimaan", sql.VarChar(20), String(noPenerimaan))
      .query(`
        SELECT NoPenerimaan, TglPenerimaan
        FROM dbo.PenerimaanBahanPendukung_h WITH (UPDLOCK, HOLDLOCK)
        WHERE NoPenerimaan = @NoPenerimaan
      `);
    const header = headerRows.recordset[0];
    if (!header) {
      throw notFound(`PenerimaanBahanPendukung dengan NoPenerimaan ${noPenerimaan} tidak ditemukan`);
    }

    const docDateOnly = toDateOnly(header.TglPenerimaan);
    await assertNotLocked({
      date: docDateOnly,
      runner: tx,
      action: "add items PenerimaanBahanPendukung",
      useLock: true,
    });

    const maxRow = await new sql.Request(tx)
      .input("NoPenerimaan", sql.VarChar(20), String(noPenerimaan))
      .query(`
        SELECT ISNULL(MAX(NoUrut), 0) AS MaxNoUrut
        FROM dbo.PenerimaanBahanPendukung_d WITH (UPDLOCK, HOLDLOCK)
        WHERE NoPenerimaan = @NoPenerimaan
      `);
    let noUrut = (maxRow.recordset[0]?.MaxNoUrut || 0) + 1;

    const createdItems = [];
    for (const item of items) {
      await new sql.Request(tx)
        .input("NoPenerimaan", sql.VarChar(20), String(noPenerimaan))
        .input("NoUrut", sql.Int, noUrut)
        .input("IdSupplier", sql.Int, item.idSupplier)
        .input("NamaBarang", sql.NVarChar(200), item.namaBarang)
        .input("Qty", sql.Decimal(18, 3), item.qty)
        .input("Satuan", sql.VarChar(20), item.satuan)
        .input("Keterangan", sql.NVarChar(200), item.keterangan)
        .input("CreateBy", sql.VarChar(100), actorUsername || null)
        .query(`
          INSERT INTO dbo.PenerimaanBahanPendukung_d
            (NoPenerimaan, NoUrut, IdSupplier, NamaBarang, Qty, Satuan, Keterangan, CreateBy)
          VALUES
            (@NoPenerimaan, @NoUrut, @IdSupplier, @NamaBarang, @Qty, @Satuan, @Keterangan, @CreateBy)
        `);

      createdItems.push({ noPenerimaan: String(noPenerimaan), noUrut, ...item });
      noUrut += 1;
    }

    await tx.commit();

    return {
      noPenerimaan: String(noPenerimaan),
      items: createdItems,
      audit: { actorId: audit.actorId, requestId: audit.requestId },
    };
  } catch (err) {
    try {
      await tx.rollback();
    } catch (_) {}
    throw err;
  }
}

async function listPenerimaanBahanPendukung({ page = 1, pageSize = 20, filter = "" } = {}) {
  const pool = await poolPromise;

  const p = Math.max(1, Number(page) || 1);
  const ps = Math.max(1, Math.min(200, Number(pageSize) || 20));
  const offset = (p - 1) * ps;
  const filterTerm = String(filter || "").trim();

  const whereClause = `
    WHERE (
      @Filter = ''
      OR h.NoPenerimaan LIKE '%' + @Filter + '%'
      OR ISNULL(t.NamaTim, '') LIKE '%' + @Filter + '%'
    )
  `;

  const countReq = pool.request();
  countReq.input("Filter", sql.VarChar(100), filterTerm);
  const countRes = await countReq.query(`
    SELECT COUNT(1) AS total
    FROM dbo.PenerimaanBahanPendukung_h h WITH (NOLOCK)
    LEFT JOIN dbo.MstTimPenerimaan t WITH (NOLOCK) ON t.IdTim = h.IdTim
    ${whereClause};
  `);
  const total = countRes.recordset?.[0]?.total || 0;
  if (total === 0) return { data: [], total: 0 };

  const dataReq = pool.request();
  dataReq.input("Filter", sql.VarChar(100), filterTerm);
  dataReq.input("offset", sql.Int, offset);
  dataReq.input("limit", sql.Int, ps);
  const dataRes = await dataReq.query(`
    SELECT
      h.NoPenerimaan,
      CONVERT(varchar(10), h.TglPenerimaan, 23) AS TglPenerimaan,
      h.IdTim,
      t.NamaTim,
      h.Shift,
      CONVERT(VARCHAR(8), h.HourStart, 108) AS HourStart,
      CONVERT(VARCHAR(8), h.HourEnd, 108) AS HourEnd,
      h.CreateBy,
      h.DateTimeCreate,
      opAgg.NamaOperators,
      agg.JumlahItem,
      agg.TotalQty
    FROM dbo.PenerimaanBahanPendukung_h h WITH (NOLOCK)
    LEFT JOIN dbo.MstTimPenerimaan t WITH (NOLOCK) ON t.IdTim = h.IdTim
    OUTER APPLY (
      SELECT
        STUFF((
          SELECT ', ' + mo.NamaOperator
          FROM dbo.PenerimaanBahanPendukungOperator_d od WITH (NOLOCK)
          INNER JOIN dbo.MstOperator mo WITH (NOLOCK) ON mo.IdOperator = od.IdOperator
          WHERE od.NoPenerimaan = h.NoPenerimaan
          FOR XML PATH('')
        ), 1, 2, '') AS NamaOperators
    ) opAgg
    OUTER APPLY (
      SELECT
        COUNT(1) AS JumlahItem,
        SUM(ISNULL(dd.Qty, 0)) AS TotalQty
      FROM dbo.PenerimaanBahanPendukung_d dd
      WHERE dd.NoPenerimaan = h.NoPenerimaan
    ) agg
    ${whereClause}
    ORDER BY h.NoPenerimaan DESC
    OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY;
  `);

  return { data: dataRes.recordset || [], total };
}

async function getDetailPenerimaanBahanPendukung(noPenerimaan) {
  const pool = await poolPromise;
  const request = pool.request();
  request.input("NoPenerimaan", sql.VarChar(20), String(noPenerimaan));

  const headerResult = await request.query(`
    SELECT
      h.NoPenerimaan,
      CONVERT(varchar(10), h.TglPenerimaan, 23) AS TglPenerimaan,
      h.IdTim,
      t.NamaTim,
      opAgg.IdOperators,
      opAgg.NamaOperators,
      h.Shift,
      CONVERT(VARCHAR(8), h.HourStart, 108) AS HourStart,
      CONVERT(VARCHAR(8), h.HourEnd, 108) AS HourEnd,
      h.CreateBy,
      h.DateTimeCreate
    FROM dbo.PenerimaanBahanPendukung_h h
    LEFT JOIN dbo.MstTimPenerimaan t ON t.IdTim = h.IdTim
    OUTER APPLY (
      SELECT
        JSON_QUERY(COALESCE(
          (SELECT od.IdOperator AS [value]
           FROM dbo.PenerimaanBahanPendukungOperator_d od
           WHERE od.NoPenerimaan = h.NoPenerimaan
           FOR JSON PATH), '[]'
        )) AS IdOperators,
        STUFF((
          SELECT ', ' + mo.NamaOperator
          FROM dbo.PenerimaanBahanPendukungOperator_d od
          INNER JOIN dbo.MstOperator mo ON mo.IdOperator = od.IdOperator
          WHERE od.NoPenerimaan = h.NoPenerimaan
          FOR XML PATH('')
        ), 1, 2, '') AS NamaOperators
    ) opAgg
    WHERE h.NoPenerimaan = @NoPenerimaan
  `);

  const header = headerResult.recordset[0];
  if (!header) return null;

  const itemsResult = await request.query(`
    SELECT
      dd.NoPenerimaan,
      dd.NoUrut,
      dd.IdSupplier,
      sup.NmSupplier AS NamaSupplier,
      dd.NamaBarang,
      dd.Qty,
      dd.Satuan,
      dd.Keterangan
    FROM dbo.PenerimaanBahanPendukung_d dd
    LEFT JOIN dbo.MstSupplier sup ON sup.IdSupplier = dd.IdSupplier
    WHERE dd.NoPenerimaan = @NoPenerimaan
    ORDER BY dd.NoUrut
  `);

  return {
    ...header,
    items: itemsResult.recordset || [],
  };
}

async function deletePenerimaanBahanPendukung(noPenerimaan, ctx) {
  const pool = await poolPromise;
  const tx = new sql.Transaction(pool);

  try {
    await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    await applyAuditContext(new sql.Request(tx), ctx || {});

    const { docDateOnly } = await loadDocDateOnlyFromConfig({
      entityKey: "penerimaanBahanPendukung",
      codeValue: noPenerimaan,
      runner: tx,
      useLock: true,
      throwIfNotFound: false,
    });

    if (!docDateOnly) {
      throw notFound("Data PenerimaanBahanPendukung tidak ditemukan");
    }

    await assertNotLocked({
      date: docDateOnly,
      runner: tx,
      action: "delete PenerimaanBahanPendukung",
      useLock: true,
    });

    await new sql.Request(tx)
      .input("NoPenerimaan", sql.VarChar(20), String(noPenerimaan))
      .query(`DELETE FROM dbo.PenerimaanBahanPendukung_d WHERE NoPenerimaan = @NoPenerimaan`);

    await new sql.Request(tx)
      .input("NoPenerimaan", sql.VarChar(20), String(noPenerimaan))
      .query(`DELETE FROM dbo.PenerimaanBahanPendukungOperator_d WHERE NoPenerimaan = @NoPenerimaan`);

    await new sql.Request(tx)
      .input("NoPenerimaan", sql.VarChar(20), String(noPenerimaan))
      .query(`DELETE FROM dbo.PenerimaanBahanPendukung_h WHERE NoPenerimaan = @NoPenerimaan`);

    await tx.commit();
    return true;
  } catch (err) {
    try {
      await tx.rollback();
    } catch (_) {}
    throw err;
  }
}

// ==========================================
//  STATUS TIM (untuk grid ala mesin washing / penerimaan bahan baku)
// ==========================================
async function getTimStatus() {
  const pool = await poolPromise;
  const result = await pool.request().query(`
    SELECT
      t.IdTim,
      t.NamaTim,
      t.Aktif,
      today.NoPenerimaan,
      CONVERT(varchar(10), today.TglPenerimaan, 23) AS TglPenerimaan,
      today.Shift,
      CONVERT(VARCHAR(8), today.HourStart, 108) AS HourStart,
      CONVERT(VARCHAR(8), today.HourEnd, 108) AS HourEnd,
      today.NamaOperators
    FROM dbo.MstTimPenerimaan t WITH (NOLOCK)
    OUTER APPLY (
      SELECT TOP 1
        h.NoPenerimaan, h.TglPenerimaan, h.Shift, h.HourStart, h.HourEnd,
        STUFF((
          SELECT ', ' + mo.NamaOperator
          FROM dbo.PenerimaanBahanPendukungOperator_d od WITH (NOLOCK)
          INNER JOIN dbo.MstOperator mo WITH (NOLOCK) ON mo.IdOperator = od.IdOperator
          WHERE od.NoPenerimaan = h.NoPenerimaan
          FOR XML PATH('')
        ), 1, 2, '') AS NamaOperators
      FROM dbo.PenerimaanBahanPendukung_h h WITH (NOLOCK)
      WHERE h.IdTim = t.IdTim
        AND CONVERT(date, h.TglPenerimaan) = CONVERT(date, GETDATE())
      ORDER BY h.DateTimeCreate DESC
    ) today
    ORDER BY t.NamaTim ASC;
  `);

  return result.recordset || [];
}

module.exports = {
  createHeaderPenerimaanBahanPendukung,
  addItemsPenerimaanBahanPendukung,
  listPenerimaanBahanPendukung,
  getDetailPenerimaanBahanPendukung,
  deletePenerimaanBahanPendukung,
  getTimStatus,
};
