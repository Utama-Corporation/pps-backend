// src/modules/retur-v3/retur-v3-service.js
const { sql, poolPromise } = require("../../core/config/db");
const {
  resolveEffectiveDateForCreate,
  assertNotLocked,
  loadDocDateOnlyFromConfig,
  formatYMD,
} = require("../../core/shared/tutup-transaksi-guard");
const { badReq, conflict, notFound } = require("../../core/utils/http-error");
const { applyAuditContext } = require("../../core/utils/db-audit-context");

const {
  generateBarangJadiLabel,
} = require("./handlers/generate-barang-jadi.handler");
const {
  generateFurnitureWipLabel,
} = require("./handlers/generate-furniture-wip.handler");
const {
  generateRejectLabel,
} = require("./handlers/generate-reject.handler");

const ALLOWED_KODE_KATEGORI = ["barangjadi", "furniturewip"];
const ALLOWED_KATEGORI_INPUT = ["BAGUS", "REJECT"];

function assertKodeKategori(value, field = "kodeKategori") {
  if (!ALLOWED_KODE_KATEGORI.includes(value)) {
    throw badReq(`${field} wajib salah satu dari: ${ALLOWED_KODE_KATEGORI.join(", ")}`);
  }
}

function assertKategoriInput(value, field = "kategoriInput") {
  if (!ALLOWED_KATEGORI_INPUT.includes(value)) {
    throw badReq(`${field} wajib salah satu dari: ${ALLOWED_KATEGORI_INPUT.join(", ")}`);
  }
}

async function jenisExists(tx, kodeKategori, idJenis) {
  const rq = new sql.Request(tx).input("Id", sql.Int, idJenis);
  if (kodeKategori === "barangjadi") {
    const r = await rq.query(`SELECT 1 FROM dbo.MstBarangJadi WHERE IdBJ=@Id`);
    return r.recordset.length > 0;
  }
  const r = await rq.query(`SELECT 1 FROM dbo.MstCabinetWIP WHERE IdCabinetWIP=@Id`);
  return r.recordset.length > 0;
}

// ---------------------------------------------------------------------------
// LIST / DETAIL
// ---------------------------------------------------------------------------

exports.getAllRetur = async ({
  page = 1,
  pageSize = 20,
  search = "",
  status = "",
  dateFrom = null,
  dateTo = null,
} = {}) => {
  const pool = await poolPromise;
  const p = Math.max(1, Number(page) || 1);
  const ps = Math.max(1, Math.min(200, Number(pageSize) || 20));
  const offset = (p - 1) * ps;
  const searchTerm = String(search || "").trim();
  const statusTerm = String(status || "").trim();
  const df = typeof dateFrom === "string" && dateFrom.trim() ? dateFrom.trim() : null;
  const dt = typeof dateTo === "string" && dateTo.trim() ? dateTo.trim() : null;

  const whereClause = `
    WHERE 1=1
      AND (@search = '' OR h.NoRetur LIKE '%' + @search + '%' OR ISNULL(p.NamaPembeli, '') LIKE '%' + @search + '%')
      AND (@status = '' OR h.StatusRetur = @status)
      AND (@dateFrom IS NULL OR CONVERT(date, h.Tanggal) >= @dateFrom)
      AND (@dateTo   IS NULL OR CONVERT(date, h.Tanggal) <= @dateTo)
  `;

  const countReq = pool.request();
  countReq.input("search", sql.VarChar(100), searchTerm);
  countReq.input("status", sql.VarChar(20), statusTerm);
  countReq.input("dateFrom", sql.Date, df);
  countReq.input("dateTo", sql.Date, dt);
  const countRes = await countReq.query(`
    SELECT COUNT(1) AS total
    FROM dbo.BJReturV3_h h WITH (NOLOCK)
    LEFT JOIN dbo.MstPembeli p WITH (NOLOCK) ON p.IdPembeli = h.IdPembeli
    ${whereClause};
  `);
  const total = countRes.recordset?.[0]?.total || 0;
  if (total === 0) return { data: [], total: 0 };

  const dataReq = pool.request();
  dataReq.input("search", sql.VarChar(100), searchTerm);
  dataReq.input("status", sql.VarChar(20), statusTerm);
  dataReq.input("dateFrom", sql.Date, df);
  dataReq.input("dateTo", sql.Date, dt);
  dataReq.input("offset", sql.Int, offset);
  dataReq.input("pageSize", sql.Int, ps);
  const dataRes = await dataReq.query(`
    ;WITH LastClosed AS (
      SELECT TOP 1 CONVERT(date, PeriodHarian) AS LastClosedDate
      FROM dbo.MstTutupTransaksiHarian WITH (NOLOCK)
      WHERE [Lock] = 1
      ORDER BY CONVERT(date, PeriodHarian) DESC, Id DESC
    )
    SELECT
      h.NoRetur,
      h.Tanggal,
      h.IdPembeli,
      p.NamaPembeli,
      h.Keterangan,
      h.StatusRetur,
      h.IsComplete,
      (SELECT COUNT(1) FROM dbo.BJReturV3Item_d it WHERE it.NoRetur = h.NoRetur) AS ItemCount,
      (SELECT ISNULL(SUM(t.Pcs), 0) FROM dbo.BJReturV3TurnoverTarget_d t WHERE t.NoRetur = h.NoRetur) AS TurnoverTargetPcs,
      (SELECT ISNULL(SUM(tv.Pcs), 0) FROM dbo.BJReturV3Turnover_d tv WHERE tv.NoRetur = h.NoRetur) AS TurnoverScannedPcs,
      CASE
        WHEN lc.LastClosedDate IS NOT NULL AND CONVERT(date, h.Tanggal) <= lc.LastClosedDate
        THEN CAST(1 AS bit) ELSE CAST(0 AS bit)
      END AS IsLocked
    FROM dbo.BJReturV3_h h WITH (NOLOCK)
    LEFT JOIN dbo.MstPembeli p WITH (NOLOCK) ON p.IdPembeli = h.IdPembeli
    OUTER APPLY (SELECT TOP 1 LastClosedDate FROM LastClosed) lc
    ${whereClause}
    ORDER BY h.NoRetur DESC
    OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY;
  `);

  return {
    data: (dataRes.recordset || []).map((r) => ({
      ...r,
      Tanggal: formatYMD(r.Tanggal),
    })),
    total,
  };
};

exports.getDetail = async (noRetur) => {
  const no = String(noRetur || "").trim();
  if (!no) throw badReq("noRetur wajib diisi");
  const pool = await poolPromise;

  const headerRes = await pool
    .request()
    .input("No", sql.VarChar(50), no).query(`
      SELECT h.*, p.NamaPembeli
      FROM dbo.BJReturV3_h h
      LEFT JOIN dbo.MstPembeli p ON p.IdPembeli = h.IdPembeli
      WHERE h.NoRetur = @No
    `);
  const header = headerRes.recordset?.[0];
  if (!header) throw notFound(`NoRetur ${no} tidak ditemukan`);

  const itemsRes = await pool
    .request()
    .input("No", sql.VarChar(50), no).query(`
      SELECT
        it.IdItem, it.NoRetur, it.KodeKategori, it.IdJenis, it.Pcs,
        it.KategoriInput, it.Berat, it.IdReject, it.GeneratedLabelCode,
        CASE
          WHEN it.KodeKategori = 'barangjadi' THEN mbj.NamaBJ
          WHEN it.KodeKategori = 'furniturewip' THEN mcw.Nama
        END AS NamaJenis,
        mr.NamaReject
      FROM dbo.BJReturV3Item_d it
      LEFT JOIN dbo.MstBarangJadi mbj ON mbj.IdBJ = it.IdJenis AND it.KodeKategori = 'barangjadi'
      LEFT JOIN dbo.MstCabinetWIP mcw ON mcw.IdCabinetWIP = it.IdJenis AND it.KodeKategori = 'furniturewip'
      LEFT JOIN dbo.MstReject mr ON mr.IdReject = it.IdReject
      WHERE it.NoRetur = @No
      ORDER BY it.IdItem ASC
    `);
  const items = itemsRes.recordset || [];

  let itemsWithExtra = items;

  if (header.StatusRetur === "DIGANTI" && items.length > 0) {
    // Diagregasi per item lewat target penggantinya (bisa 0..N target per
    // item, kategori/jenis/pcs bebas beda dari item aslinya) — bukan lagi
    // dibandingkan langsung ke it.Pcs seperti sebelum ada tabel target.
    const turnoverRes = await pool
      .request()
      .input("No", sql.VarChar(50), no).query(`
        SELECT
          t.IdItem,
          SUM(t.Pcs) AS TargetPcs,
          ISNULL(SUM(s.ScannedPcs), 0) AS ScannedPcs
        FROM dbo.BJReturV3TurnoverTarget_d t
        LEFT JOIN (
          SELECT IdTarget, SUM(Pcs) AS ScannedPcs
          FROM dbo.BJReturV3Turnover_d
          WHERE NoRetur = @No
          GROUP BY IdTarget
        ) s ON s.IdTarget = t.IdTarget
        WHERE t.NoRetur = @No
        GROUP BY t.IdItem
      `);
    const aggByItem = new Map(
      (turnoverRes.recordset || []).map((r) => [
        r.IdItem,
        { targetPcs: Number(r.TargetPcs || 0), scannedPcs: Number(r.ScannedPcs || 0) },
      ]),
    );
    itemsWithExtra = items.map((it) => {
      const agg = aggByItem.get(it.IdItem);
      return {
        ...it,
        TurnoverTargetPcs: agg?.targetPcs || 0,
        TurnoverScannedPcs: agg?.scannedPcs || 0,
        TurnoverRemainingPcs: Math.max(0, (agg?.targetPcs || 0) - (agg?.scannedPcs || 0)),
        TurnoverFulfilled: !!agg && agg.targetPcs > 0 && agg.scannedPcs === agg.targetPcs,
      };
    });
  }

  return {
    ...header,
    Tanggal: formatYMD(header.Tanggal),
    items: itemsWithExtra,
  };
};

// ---------------------------------------------------------------------------
// HEADER CRUD
// ---------------------------------------------------------------------------

exports.createHeader = async (payload, ctx) => {
  const { tanggal, idPembeli, keterangan } = payload || {};
  const must = [];
  if (!tanggal) must.push("tanggal");
  if (idPembeli == null || idPembeli === "") must.push("idPembeli");
  if (must.length) throw badReq(`Field wajib: ${must.join(", ")}`);

  const idPembeliNum = Number(idPembeli);
  if (!Number.isFinite(idPembeliNum) || idPembeliNum <= 0) {
    throw badReq("idPembeli tidak valid");
  }

  const pool = await poolPromise;
  const tx = new sql.Transaction(pool);
  const { actorId, actorUsername, requestId } = ctx;

  try {
    await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    await applyAuditContext(new sql.Request(tx), { actorId, actorUsername, requestId });

    const effectiveDate = resolveEffectiveDateForCreate(tanggal);
    await assertNotLocked({
      date: effectiveDate,
      runner: tx,
      action: "create Retur V3",
      useLock: true,
    });

    // NoRetur v3 melanjutkan sequence 'L.' yang SAMA dengan retur v1
    // (dbo.BJRetur_h) — bukan sequence terpisah — supaya tidak ada NoRetur
    // yang sama persis muncul di kedua tabel. generateNextCode() bawaan
    // cuma bisa cek satu tabel, jadi next-number dihitung manual dari MAX
    // gabungan kedua tabel di sini.
    const gen = async () => {
      const rq = new sql.Request(tx).input("prefix", sql.VarChar(50), "L.");
      const r = await rq.query(`
        SELECT TOP 1 Code FROM (
          SELECT NoRetur AS Code FROM dbo.BJRetur_h WITH (UPDLOCK, HOLDLOCK)
          WHERE NoRetur LIKE @prefix + '%'
          UNION ALL
          SELECT NoRetur AS Code FROM dbo.BJReturV3_h WITH (UPDLOCK, HOLDLOCK)
          WHERE NoRetur LIKE @prefix + '%'
        ) x
        ORDER BY TRY_CONVERT(BIGINT, SUBSTRING(Code, 3, 50)) DESC, Code DESC;
      `);
      const last = r.recordset?.[0]?.Code ? String(r.recordset[0].Code) : "";
      const lastNum = parseInt(last.substring(2), 10) || 0;
      return "L." + String(lastNum + 1).padStart(10, "0");
    };

    let noRetur = await gen();
    let exist = await new sql.Request(tx)
      .input("No", sql.VarChar(50), noRetur)
      .query(`
        SELECT 1 FROM dbo.BJRetur_h WITH (UPDLOCK,HOLDLOCK) WHERE NoRetur=@No
        UNION ALL
        SELECT 1 FROM dbo.BJReturV3_h WITH (UPDLOCK,HOLDLOCK) WHERE NoRetur=@No
      `);
    if (exist.recordset.length > 0) {
      noRetur = await gen();
      exist = await new sql.Request(tx)
        .input("No", sql.VarChar(50), noRetur)
        .query(`
          SELECT 1 FROM dbo.BJRetur_h WITH (UPDLOCK,HOLDLOCK) WHERE NoRetur=@No
          UNION ALL
          SELECT 1 FROM dbo.BJReturV3_h WITH (UPDLOCK,HOLDLOCK) WHERE NoRetur=@No
        `);
      if (exist.recordset.length > 0) throw conflict("Gagal generate NoRetur unik, coba lagi");
    }

    await new sql.Request(tx)
      .input("NoRetur", sql.VarChar(50), noRetur)
      .input("Tanggal", sql.Date, effectiveDate)
      .input("IdPembeli", sql.Int, idPembeliNum)
      .input("Keterangan", sql.NVarChar(500), keterangan ?? null)
      .input("CreateBy", sql.VarChar(50), actorUsername).query(`
        INSERT INTO dbo.BJReturV3_h (
          NoRetur, Tanggal, IdPembeli, Keterangan, StatusRetur, CreateBy
        ) VALUES (
          @NoRetur, @Tanggal, @IdPembeli, @Keterangan, 'PENDING', @CreateBy
        )
      `);

    await tx.commit();

    return {
      noRetur,
      tanggal: formatYMD(effectiveDate),
      idPembeli: idPembeliNum,
      keterangan: keterangan ?? null,
      statusRetur: "PENDING",
      audit: { actorId, requestId },
    };
  } catch (e) {
    try {
      await tx.rollback();
    } catch (_) {}
    throw e;
  }
};

exports.updateHeader = async (noRetur, payload, ctx) => {
  const no = String(noRetur || "").trim();
  if (!no) throw badReq("noRetur wajib diisi");

  const pool = await poolPromise;
  const tx = new sql.Transaction(pool);
  const { actorId, actorUsername, requestId } = ctx;

  try {
    await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    await applyAuditContext(new sql.Request(tx), { actorId, actorUsername, requestId });

    const { docDateOnly: oldDocDateOnly, row: headerRow } = await loadDocDateOnlyFromConfig({
      entityKey: "returnV3",
      codeValue: no,
      runner: tx,
      useLock: true,
      throwIfNotFound: false,
    });
    if (!headerRow) throw notFound(`NoRetur ${no} tidak ditemukan`);

    const headerRes = await new sql.Request(tx)
      .input("No", sql.VarChar(50), no)
      .query(
        `SELECT StatusRetur FROM dbo.BJReturV3_h WITH (UPDLOCK,HOLDLOCK) WHERE NoRetur=@No`,
      );
    const header = headerRes.recordset[0];
    if (!header) throw notFound(`NoRetur ${no} tidak ditemukan`);
    if (header.StatusRetur !== "PENDING") {
      throw conflict("Header sudah diputuskan, tidak bisa diupdate");
    }

    await assertNotLocked({
      date: oldDocDateOnly,
      runner: tx,
      action: "update Retur V3 (current date)",
      useLock: true,
    });

    const sets = [];
    const rq = new sql.Request(tx);

    if (payload?.tanggal !== undefined) {
      if (!payload.tanggal) throw badReq("tanggal tidak boleh kosong");
      const effectiveDate = resolveEffectiveDateForCreate(payload.tanggal);
      await assertNotLocked({
        date: effectiveDate,
        runner: tx,
        action: "update Retur V3 (new date)",
        useLock: true,
      });
      sets.push("Tanggal=@Tanggal");
      rq.input("Tanggal", sql.Date, effectiveDate);
    }

    if (payload?.idPembeli !== undefined) {
      if (payload.idPembeli == null || payload.idPembeli === "") {
        throw badReq("idPembeli tidak boleh kosong");
      }
      const idPembeliNum = Number(payload.idPembeli);
      if (!Number.isFinite(idPembeliNum) || idPembeliNum <= 0) {
        throw badReq("idPembeli tidak valid");
      }
      sets.push("IdPembeli=@IdPembeli");
      rq.input("IdPembeli", sql.Int, idPembeliNum);
    }

    if (payload?.keterangan !== undefined) {
      sets.push("Keterangan=@Keterangan");
      rq.input("Keterangan", sql.NVarChar(500), payload.keterangan ?? null);
    }

    if (sets.length === 0) throw badReq("Tidak ada field yang diupdate");

    rq.input("No", sql.VarChar(50), no);
    await rq.query(`UPDATE dbo.BJReturV3_h SET ${sets.join(", ")} WHERE NoRetur=@No`);

    await tx.commit();
    return { noRetur: no, audit: { actorId, requestId } };
  } catch (e) {
    try {
      await tx.rollback();
    } catch (_) {}
    throw e;
  }
};

exports.deleteHeader = async (noRetur, ctx) => {
  const no = String(noRetur || "").trim();
  if (!no) throw badReq("noRetur wajib diisi");

  const pool = await poolPromise;
  const tx = new sql.Transaction(pool);
  const { actorId, actorUsername, requestId } = ctx;

  try {
    await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    await applyAuditContext(new sql.Request(tx), { actorId, actorUsername, requestId });

    const { docDateOnly, row: headerRow } = await loadDocDateOnlyFromConfig({
      entityKey: "returnV3",
      codeValue: no,
      runner: tx,
      useLock: true,
      throwIfNotFound: false,
    });
    if (!headerRow) throw notFound(`NoRetur ${no} tidak ditemukan`);

    const headerRes = await new sql.Request(tx)
      .input("No", sql.VarChar(50), no)
      .query(
        `SELECT StatusRetur FROM dbo.BJReturV3_h WITH (UPDLOCK,HOLDLOCK) WHERE NoRetur=@No`,
      );
    const header = headerRes.recordset[0];
    if (!header) throw notFound(`NoRetur ${no} tidak ditemukan`);
    if (header.StatusRetur !== "PENDING") {
      throw conflict("Header sudah diputuskan, tidak bisa dihapus");
    }

    await assertNotLocked({
      date: docDateOnly,
      runner: tx,
      action: "delete Retur V3",
      useLock: true,
    });

    const itemsRes = await new sql.Request(tx)
      .input("No", sql.VarChar(50), no)
      .query(
        `SELECT IdItem, GeneratedLabelCode FROM dbo.BJReturV3Item_d WITH (UPDLOCK,HOLDLOCK) WHERE NoRetur=@No`,
      );
    const items = itemsRes.recordset || [];

    if (items.some((it) => it.GeneratedLabelCode)) {
      throw conflict("Tidak bisa hapus: ada item yang sudah generate label");
    }

    if (items.length > 0) {
      const turnoverRes = await new sql.Request(tx)
        .input("No", sql.VarChar(50), no)
        .query(`SELECT TOP 1 1 AS x FROM dbo.BJReturV3Turnover_d WHERE NoRetur=@No`);
      if (turnoverRes.recordset.length > 0) {
        throw conflict("Tidak bisa hapus: ada turnover scan pada item");
      }

      await new sql.Request(tx)
        .input("No", sql.VarChar(50), no)
        .query(`DELETE FROM dbo.BJReturV3Item_d WHERE NoRetur=@No`);
    }

    await new sql.Request(tx)
      .input("No", sql.VarChar(50), no)
      .query(`DELETE FROM dbo.BJReturV3_h WHERE NoRetur=@No`);

    await tx.commit();
    return { noRetur: no, audit: { actorId, requestId } };
  } catch (e) {
    try {
      await tx.rollback();
    } catch (_) {}
    throw e;
  }
};

// ---------------------------------------------------------------------------
// ITEM CRUD
// ---------------------------------------------------------------------------

exports.addItems = async (noRetur, items, ctx) => {
  const no = String(noRetur || "").trim();
  if (!no) throw badReq("noRetur wajib diisi");
  if (!Array.isArray(items) || items.length === 0) {
    throw badReq("items wajib berisi minimal 1 item");
  }

  for (let i = 0; i < items.length; i++) {
    const it = items[i] || {};
    assertKodeKategori(it.kodeKategori, `items[${i}].kodeKategori`);
    assertKategoriInput(it.kategoriInput, `items[${i}].kategoriInput`);
    const pcsNum = Number(it.pcs);
    if (!Number.isFinite(pcsNum) || pcsNum <= 0 || !Number.isInteger(pcsNum)) {
      throw badReq(`items[${i}].pcs wajib bilangan bulat positif`);
    }
    const idJenisNum = Number(it.idJenis);
    if (!Number.isFinite(idJenisNum) || idJenisNum <= 0) {
      throw badReq(`items[${i}].idJenis wajib diisi`);
    }
  }

  const pool = await poolPromise;
  const tx = new sql.Transaction(pool);
  const { actorId, actorUsername, requestId } = ctx;

  try {
    await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    await applyAuditContext(new sql.Request(tx), { actorId, actorUsername, requestId });

    const headerRes = await new sql.Request(tx)
      .input("No", sql.VarChar(50), no)
      .query(
        `SELECT StatusRetur FROM dbo.BJReturV3_h WITH (UPDLOCK,HOLDLOCK) WHERE NoRetur=@No`,
      );
    const header = headerRes.recordset[0];
    if (!header) throw notFound(`NoRetur ${no} tidak ditemukan`);
    if (header.StatusRetur !== "PENDING") {
      throw conflict("Header sudah diputuskan, tidak bisa menambah item");
    }

    const createdIds = [];
    for (const it of items) {
      const ok = await jenisExists(tx, it.kodeKategori, Number(it.idJenis));
      if (!ok) {
        throw badReq(
          `idJenis ${it.idJenis} tidak ditemukan untuk kategori ${it.kodeKategori}`,
        );
      }

      const ins = await new sql.Request(tx)
        .input("NoRetur", sql.VarChar(50), no)
        .input("KodeKategori", sql.VarChar(20), it.kodeKategori)
        .input("IdJenis", sql.Int, Number(it.idJenis))
        .input("Pcs", sql.Int, Math.trunc(Number(it.pcs)))
        .input("KategoriInput", sql.VarChar(10), it.kategoriInput)
        .input("CreateBy", sql.VarChar(50), actorUsername).query(`
          INSERT INTO dbo.BJReturV3Item_d (NoRetur, KodeKategori, IdJenis, Pcs, KategoriInput, CreateBy)
          OUTPUT INSERTED.IdItem
          VALUES (@NoRetur, @KodeKategori, @IdJenis, @Pcs, @KategoriInput, @CreateBy)
        `);
      createdIds.push(ins.recordset[0].IdItem);
    }

    // Ambil ulang dengan JOIN ke master (NamaJenis) supaya response langsung
    // membawa nama, bukan cuma IdJenis mentah — konsisten dengan getDetail().
    const idsJson = JSON.stringify(createdIds.map((id) => ({ id })));
    const createdRes = await new sql.Request(tx).input(
      "IdsJson",
      sql.NVarChar(sql.MAX),
      idsJson,
    ).query(`
      SELECT
        it.IdItem, it.NoRetur, it.KodeKategori, it.IdJenis, it.Pcs,
        it.KategoriInput, it.Berat, it.IdReject, it.GeneratedLabelCode,
        CASE
          WHEN it.KodeKategori = 'barangjadi' THEN mbj.NamaBJ
          WHEN it.KodeKategori = 'furniturewip' THEN mcw.Nama
        END AS NamaJenis,
        mr.NamaReject
      FROM dbo.BJReturV3Item_d it
      LEFT JOIN dbo.MstBarangJadi mbj ON mbj.IdBJ = it.IdJenis AND it.KodeKategori = 'barangjadi'
      LEFT JOIN dbo.MstCabinetWIP mcw ON mcw.IdCabinetWIP = it.IdJenis AND it.KodeKategori = 'furniturewip'
      LEFT JOIN dbo.MstReject mr ON mr.IdReject = it.IdReject
      WHERE it.IdItem IN (
        SELECT j.id FROM OPENJSON(@IdsJson) WITH (id int '$.id') AS j
      )
      ORDER BY it.IdItem ASC
    `);

    await tx.commit();
    return {
      noRetur: no,
      items: createdRes.recordset || [],
      audit: { actorId, requestId },
    };
  } catch (e) {
    try {
      await tx.rollback();
    } catch (_) {}
    throw e;
  }
};

exports.updateItem = async (noRetur, idItem, payload, ctx) => {
  const no = String(noRetur || "").trim();
  const idItemNum = Number(idItem);
  if (!no) throw badReq("noRetur wajib diisi");
  if (!Number.isFinite(idItemNum)) throw badReq("idItem tidak valid");

  const pool = await poolPromise;
  const tx = new sql.Transaction(pool);
  const { actorId, actorUsername, requestId } = ctx;

  try {
    await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    await applyAuditContext(new sql.Request(tx), { actorId, actorUsername, requestId });

    const headerRes = await new sql.Request(tx)
      .input("No", sql.VarChar(50), no)
      .query(
        `SELECT StatusRetur FROM dbo.BJReturV3_h WITH (UPDLOCK,HOLDLOCK) WHERE NoRetur=@No`,
      );
    const header = headerRes.recordset[0];
    if (!header) throw notFound(`NoRetur ${no} tidak ditemukan`);
    if (header.StatusRetur !== "PENDING") {
      throw conflict("Header sudah diputuskan, tidak bisa mengubah item");
    }

    const itemRes = await new sql.Request(tx)
      .input("Id", sql.Int, idItemNum)
      .input("No", sql.VarChar(50), no)
      .query(
        `SELECT * FROM dbo.BJReturV3Item_d WITH (UPDLOCK,HOLDLOCK) WHERE IdItem=@Id AND NoRetur=@No`,
      );
    const item = itemRes.recordset[0];
    if (!item) throw notFound(`Item ${idItemNum} tidak ditemukan pada retur ${no}`);

    const kodeKategori = payload?.kodeKategori !== undefined ? payload.kodeKategori : item.KodeKategori;
    const idJenis = payload?.idJenis !== undefined ? Number(payload.idJenis) : item.IdJenis;
    const pcs = payload?.pcs !== undefined ? Number(payload.pcs) : item.Pcs;
    const kategoriInput = payload?.kategoriInput !== undefined ? payload.kategoriInput : item.KategoriInput;

    assertKodeKategori(kodeKategori);
    assertKategoriInput(kategoriInput);
    if (!Number.isFinite(pcs) || pcs <= 0 || !Number.isInteger(pcs)) {
      throw badReq("pcs wajib bilangan bulat positif");
    }
    if (!Number.isFinite(idJenis) || idJenis <= 0) {
      throw badReq("idJenis wajib diisi");
    }

    const ok = await jenisExists(tx, kodeKategori, idJenis);
    if (!ok) throw badReq(`idJenis ${idJenis} tidak ditemukan untuk kategori ${kodeKategori}`);

    await new sql.Request(tx)
      .input("Id", sql.Int, idItemNum)
      .input("KodeKategori", sql.VarChar(20), kodeKategori)
      .input("IdJenis", sql.Int, idJenis)
      .input("Pcs", sql.Int, Math.trunc(pcs))
      .input("KategoriInput", sql.VarChar(10), kategoriInput).query(`
        UPDATE dbo.BJReturV3Item_d
        SET KodeKategori=@KodeKategori, IdJenis=@IdJenis, Pcs=@Pcs, KategoriInput=@KategoriInput
        WHERE IdItem=@Id
      `);

    // Ambil ulang dengan JOIN ke master (NamaJenis) supaya response langsung
    // membawa nama, bukan cuma id — konsisten dengan getDetail()/addItems().
    const updatedRes = await new sql.Request(tx).input("Id", sql.Int, idItemNum)
      .query(`
        SELECT
          it.IdItem, it.NoRetur, it.KodeKategori, it.IdJenis, it.Pcs,
          it.KategoriInput, it.Berat, it.IdReject, it.GeneratedLabelCode,
          CASE
            WHEN it.KodeKategori = 'barangjadi' THEN mbj.NamaBJ
            WHEN it.KodeKategori = 'furniturewip' THEN mcw.Nama
          END AS NamaJenis,
          mr.NamaReject
        FROM dbo.BJReturV3Item_d it
        LEFT JOIN dbo.MstBarangJadi mbj ON mbj.IdBJ = it.IdJenis AND it.KodeKategori = 'barangjadi'
        LEFT JOIN dbo.MstCabinetWIP mcw ON mcw.IdCabinetWIP = it.IdJenis AND it.KodeKategori = 'furniturewip'
        LEFT JOIN dbo.MstReject mr ON mr.IdReject = it.IdReject
        WHERE it.IdItem = @Id
      `);

    await tx.commit();
    return updatedRes.recordset[0];
  } catch (e) {
    try {
      await tx.rollback();
    } catch (_) {}
    throw e;
  }
};

exports.deleteItem = async (noRetur, idItem, ctx) => {
  const no = String(noRetur || "").trim();
  const idItemNum = Number(idItem);
  if (!no) throw badReq("noRetur wajib diisi");
  if (!Number.isFinite(idItemNum)) throw badReq("idItem tidak valid");

  const pool = await poolPromise;
  const tx = new sql.Transaction(pool);
  const { actorId, actorUsername, requestId } = ctx;

  try {
    await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    await applyAuditContext(new sql.Request(tx), { actorId, actorUsername, requestId });

    const headerRes = await new sql.Request(tx)
      .input("No", sql.VarChar(50), no)
      .query(
        `SELECT StatusRetur FROM dbo.BJReturV3_h WITH (UPDLOCK,HOLDLOCK) WHERE NoRetur=@No`,
      );
    const header = headerRes.recordset[0];
    if (!header) throw notFound(`NoRetur ${no} tidak ditemukan`);
    if (header.StatusRetur !== "PENDING") {
      throw conflict("Header sudah diputuskan, tidak bisa menghapus item");
    }

    const del = await new sql.Request(tx)
      .input("Id", sql.Int, idItemNum)
      .input("No", sql.VarChar(50), no)
      .query(`DELETE FROM dbo.BJReturV3Item_d WHERE IdItem=@Id AND NoRetur=@No`);
    if (!del.rowsAffected?.[0]) {
      throw notFound(`Item ${idItemNum} tidak ditemukan pada retur ${no}`);
    }

    await tx.commit();
    return { idItem: idItemNum, noRetur: no, audit: { actorId, requestId } };
  } catch (e) {
    try {
      await tx.rollback();
    } catch (_) {}
    throw e;
  }
};

// ---------------------------------------------------------------------------
// TURNOVER TARGETS (DIGANTI path) — apa yang akan dikirim sebagai
// pengganti item yang kembali. Diisi Admin setelah keputusan DIGANTI,
// terpisah dari BJReturV3Item_d karena barang pengganti bisa beda
// kategori/jenis dari barang yang kembali, dan 1 item retur bisa punya
// beberapa target (kombinasi jenis pengganti). Tidak ada aturan total pcs
// target harus sama dengan pcs item retur asalnya — bebas ditentukan Admin.
// ---------------------------------------------------------------------------

async function selectTargetsWithNamaJenis(tx, idTargets) {
  if (idTargets.length === 0) return [];
  const idsJson = JSON.stringify(idTargets.map((id) => ({ id })));
  const res = await new sql.Request(tx).input(
    "IdsJson",
    sql.NVarChar(sql.MAX),
    idsJson,
  ).query(`
    SELECT
      t.IdTarget, t.NoRetur, t.IdItem, t.KodeKategori, t.IdJenis, t.Pcs,
      CASE
        WHEN t.KodeKategori = 'barangjadi' THEN mbj.NamaBJ
        WHEN t.KodeKategori = 'furniturewip' THEN mcw.Nama
      END AS NamaJenis
    FROM dbo.BJReturV3TurnoverTarget_d t
    LEFT JOIN dbo.MstBarangJadi mbj ON mbj.IdBJ = t.IdJenis AND t.KodeKategori = 'barangjadi'
    LEFT JOIN dbo.MstCabinetWIP mcw ON mcw.IdCabinetWIP = t.IdJenis AND t.KodeKategori = 'furniturewip'
    WHERE t.IdTarget IN (
      SELECT j.id FROM OPENJSON(@IdsJson) WITH (id int '$.id') AS j
    )
    ORDER BY t.IdTarget ASC
  `);
  return res.recordset || [];
}

exports.addTurnoverTargets = async (noRetur, idItem, targets, ctx) => {
  const no = String(noRetur || "").trim();
  const idItemNum = Number(idItem);
  if (!no) throw badReq("noRetur wajib diisi");
  if (!Number.isFinite(idItemNum)) throw badReq("idItem tidak valid");
  if (!Array.isArray(targets) || targets.length === 0) {
    throw badReq("targets wajib berisi minimal 1 target");
  }

  for (let i = 0; i < targets.length; i++) {
    const t = targets[i] || {};
    assertKodeKategori(t.kodeKategori, `targets[${i}].kodeKategori`);
    const pcsNum = Number(t.pcs);
    if (!Number.isFinite(pcsNum) || pcsNum <= 0 || !Number.isInteger(pcsNum)) {
      throw badReq(`targets[${i}].pcs wajib bilangan bulat positif`);
    }
    const idJenisNum = Number(t.idJenis);
    if (!Number.isFinite(idJenisNum) || idJenisNum <= 0) {
      throw badReq(`targets[${i}].idJenis wajib diisi`);
    }
  }

  const pool = await poolPromise;
  const tx = new sql.Transaction(pool);
  const { actorId, actorUsername, requestId } = ctx;

  try {
    await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    await applyAuditContext(new sql.Request(tx), { actorId, actorUsername, requestId });

    const headerRes = await new sql.Request(tx)
      .input("No", sql.VarChar(50), no)
      .query(
        `SELECT StatusRetur FROM dbo.BJReturV3_h WITH (UPDLOCK,HOLDLOCK) WHERE NoRetur=@No`,
      );
    const header = headerRes.recordset[0];
    if (!header) throw notFound(`NoRetur ${no} tidak ditemukan`);
    if (header.StatusRetur !== "DIGANTI") {
      throw conflict("Target pengganti hanya bisa ditambahkan saat StatusRetur=DIGANTI");
    }

    const itemRes = await new sql.Request(tx)
      .input("Id", sql.Int, idItemNum)
      .input("No", sql.VarChar(50), no)
      .query(`SELECT IdItem FROM dbo.BJReturV3Item_d WHERE IdItem=@Id AND NoRetur=@No`);
    if (!itemRes.recordset[0]) {
      throw notFound(`Item ${idItemNum} tidak ditemukan pada retur ${no}`);
    }

    const createdIds = [];
    for (const t of targets) {
      const ok = await jenisExists(tx, t.kodeKategori, Number(t.idJenis));
      if (!ok) {
        throw badReq(
          `idJenis ${t.idJenis} tidak ditemukan untuk kategori ${t.kodeKategori}`,
        );
      }

      const ins = await new sql.Request(tx)
        .input("NoRetur", sql.VarChar(50), no)
        .input("IdItem", sql.Int, idItemNum)
        .input("KodeKategori", sql.VarChar(20), t.kodeKategori)
        .input("IdJenis", sql.Int, Number(t.idJenis))
        .input("Pcs", sql.Int, Math.trunc(Number(t.pcs)))
        .input("CreateBy", sql.VarChar(50), actorUsername).query(`
          INSERT INTO dbo.BJReturV3TurnoverTarget_d (NoRetur, IdItem, KodeKategori, IdJenis, Pcs, CreateBy)
          OUTPUT INSERTED.IdTarget
          VALUES (@NoRetur, @IdItem, @KodeKategori, @IdJenis, @Pcs, @CreateBy)
        `);
      createdIds.push(ins.recordset[0].IdTarget);
    }

    const created = await selectTargetsWithNamaJenis(tx, createdIds);

    await tx.commit();
    return { noRetur: no, idItem: idItemNum, targets: created, audit: { actorId, requestId } };
  } catch (e) {
    try {
      await tx.rollback();
    } catch (_) {}
    throw e;
  }
};

exports.updateTurnoverTarget = async (noRetur, idTarget, payload, ctx) => {
  const no = String(noRetur || "").trim();
  const idTargetNum = Number(idTarget);
  if (!no) throw badReq("noRetur wajib diisi");
  if (!Number.isFinite(idTargetNum)) throw badReq("idTarget tidak valid");

  const pool = await poolPromise;
  const tx = new sql.Transaction(pool);
  const { actorId, actorUsername, requestId } = ctx;

  try {
    await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    await applyAuditContext(new sql.Request(tx), { actorId, actorUsername, requestId });

    const targetRes = await new sql.Request(tx)
      .input("Id", sql.Int, idTargetNum)
      .input("No", sql.VarChar(50), no)
      .query(
        `SELECT * FROM dbo.BJReturV3TurnoverTarget_d WITH (UPDLOCK,HOLDLOCK) WHERE IdTarget=@Id AND NoRetur=@No`,
      );
    const target = targetRes.recordset[0];
    if (!target) throw notFound(`Target ${idTargetNum} tidak ditemukan pada retur ${no}`);

    const scannedRes = await new sql.Request(tx)
      .input("Id", sql.Int, idTargetNum)
      .query(`SELECT 1 FROM dbo.BJReturV3Turnover_d WHERE IdTarget=@Id`);
    if (scannedRes.recordset.length > 0) {
      throw conflict("Target sudah punya scan, tidak bisa diubah");
    }

    const kodeKategori = payload?.kodeKategori !== undefined ? payload.kodeKategori : target.KodeKategori;
    const idJenis = payload?.idJenis !== undefined ? Number(payload.idJenis) : target.IdJenis;
    const pcs = payload?.pcs !== undefined ? Number(payload.pcs) : target.Pcs;

    assertKodeKategori(kodeKategori);
    if (!Number.isFinite(pcs) || pcs <= 0 || !Number.isInteger(pcs)) {
      throw badReq("pcs wajib bilangan bulat positif");
    }
    if (!Number.isFinite(idJenis) || idJenis <= 0) {
      throw badReq("idJenis wajib diisi");
    }

    const ok = await jenisExists(tx, kodeKategori, idJenis);
    if (!ok) throw badReq(`idJenis ${idJenis} tidak ditemukan untuk kategori ${kodeKategori}`);

    await new sql.Request(tx)
      .input("Id", sql.Int, idTargetNum)
      .input("KodeKategori", sql.VarChar(20), kodeKategori)
      .input("IdJenis", sql.Int, idJenis)
      .input("Pcs", sql.Int, Math.trunc(pcs)).query(`
        UPDATE dbo.BJReturV3TurnoverTarget_d
        SET KodeKategori=@KodeKategori, IdJenis=@IdJenis, Pcs=@Pcs
        WHERE IdTarget=@Id
      `);

    const [updated] = await selectTargetsWithNamaJenis(tx, [idTargetNum]);

    await tx.commit();
    return updated;
  } catch (e) {
    try {
      await tx.rollback();
    } catch (_) {}
    throw e;
  }
};

exports.deleteTurnoverTarget = async (noRetur, idTarget, ctx) => {
  const no = String(noRetur || "").trim();
  const idTargetNum = Number(idTarget);
  if (!no) throw badReq("noRetur wajib diisi");
  if (!Number.isFinite(idTargetNum)) throw badReq("idTarget tidak valid");

  const pool = await poolPromise;
  const tx = new sql.Transaction(pool);
  const { actorId, actorUsername, requestId } = ctx;

  try {
    await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    await applyAuditContext(new sql.Request(tx), { actorId, actorUsername, requestId });

    const targetRes = await new sql.Request(tx)
      .input("Id", sql.Int, idTargetNum)
      .input("No", sql.VarChar(50), no)
      .query(
        `SELECT IdTarget FROM dbo.BJReturV3TurnoverTarget_d WITH (UPDLOCK,HOLDLOCK) WHERE IdTarget=@Id AND NoRetur=@No`,
      );
    if (!targetRes.recordset[0]) {
      throw notFound(`Target ${idTargetNum} tidak ditemukan pada retur ${no}`);
    }

    const scannedRes = await new sql.Request(tx)
      .input("Id", sql.Int, idTargetNum)
      .query(`SELECT 1 FROM dbo.BJReturV3Turnover_d WHERE IdTarget=@Id`);
    if (scannedRes.recordset.length > 0) {
      throw conflict("Target sudah punya scan, tidak bisa dihapus");
    }

    await new sql.Request(tx)
      .input("Id", sql.Int, idTargetNum)
      .query(`DELETE FROM dbo.BJReturV3TurnoverTarget_d WHERE IdTarget=@Id`);

    await tx.commit();
    return { idTarget: idTargetNum, noRetur: no, audit: { actorId, requestId } };
  } catch (e) {
    try {
      await tx.rollback();
    } catch (_) {}
    throw e;
  }
};

// ---------------------------------------------------------------------------
// EXPORT KE AS_GSU (AR_SalesReturnTransit + AR_SalesReturnTransitDetails)
// Dipanggil otomatis saat keputusan sales disimpan (decide), atau manual via
// POST /:noRetur/export-gsu. Idempotent-guard: jika NoRetur sudah pernah
// diekspor (Remarks = NoRetur di AR_SalesReturnTransit), proses ditolak.
// ---------------------------------------------------------------------------
const GSU_TRANSIT_DB = "AS_GSU_TEST5.dbo";

async function exportToGsuInTx(tx, noRetur, actorUsername, remarks = []) {
  const remarksByItem = new Map();
  if (Array.isArray(remarks)) {
    for (const r of remarks) {
      if (r && Number(r.idItem) > 0) {
        remarksByItem.set(Number(r.idItem), String(r.remark || "").trim());
      }
    }
  }

  // 0) Duplikat check — sudah pernah diekspor ke AS_GSU?
  const dup = await new sql.Request(tx)
    .input("No", sql.VarChar(50), noRetur).query(`
      SELECT 1
      FROM ${GSU_TRANSIT_DB}.AR_SalesReturnTransit WITH (UPDLOCK, HOLDLOCK)
      WHERE CAST(Remarks AS nvarchar(50)) = @No
    `);
  if (dup.recordset.length > 0) {
    throw conflict(`Retur ${noRetur} sudah pernah diekspor ke AS_GSU. Tidak boleh diproses lagi.`);
  }

  // 1) Data retur (mengikuti query yang diberikan user)
  const dataRes = await new sql.Request(tx)
    .input("No", sql.VarChar(50), noRetur).query(`
      SELECT
        A.NoRetur,
        A.Tanggal,
        F.CustomerID,
        F.CustomerName,
        G.ItemID,
        G.ItemName,
        B.IdItem,
        B.Pcs,
        ${GSU_TRANSIT_DB}.UDF_Common_GetSmallestUOMLevel(
          G.UOMID1, G.UOMID2, G.UOMID3, G.UOMID4
        ) AS UOMLevel
      FROM dbo.BJReturV3_h A
      LEFT JOIN dbo.BJReturV3Item_d B ON B.NoRetur = A.NoRetur
      LEFT JOIN dbo.MstKategori C ON C.KodeKategori = B.KodeKategori
      LEFT JOIN dbo.MstCabinetWIP D ON D.IdCabinetWIP = B.IdJenis
      LEFT JOIN dbo.MstPembeli E ON E.IdPembeli = A.IdPembeli
      LEFT JOIN ${GSU_TRANSIT_DB}.AR_Customers F ON F.CustomerCode = E.CustomerCode
      INNER JOIN ${GSU_TRANSIT_DB}.IC_Items G ON G.ItemCode = D.ItemCode
      WHERE A.NoRetur = @No
    `);
  const rows = dataRes.recordset || [];
  if (rows.length === 0) {
    return { exported: false, reason: "NO_DATA", message: "Tidak ada item yang cocok untuk diekspor ke AS_GSU." };
  }

  const customerId = rows[0].CustomerID;
  const tanggal = rows[0].Tanggal;

  // 2) Nomor urut TransitCounter per bulan (reset dari 1 tiap bulan)
  //    Prefix TransitNumber = SRT/MM/YY/ -> MAX per bulan retur tsb.
  const dt = new Date(tanggal);
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const yy = String(dt.getFullYear()).slice(-2);
  const prefix = `SRT/${mm}/${yy}/`;

  const seq = await new sql.Request(tx)
    .input("Prefix", sql.VarChar(10), prefix).query(`
      SELECT ISNULL(MAX(TransitCounter), 0) AS MaxCounter
      FROM ${GSU_TRANSIT_DB}.AR_SalesReturnTransit WITH (UPDLOCK, HOLDLOCK)
      WHERE TransitNumber LIKE @Prefix + '%'
    `);
  const counter = Number(seq.recordset[0].MaxCounter) + 1;

  // 3) TransitNumber = SRT/MM/YY/CCC (CCC 3 digit = TransitCounter bulan ini)
  const ccc = String(counter).padStart(3, "0");
  const transitNumber = `${prefix}${ccc}`;

  // 4) Insert header (TransitID identity auto; ambil lewat OUTPUT INSERTED)
  const headerIns = await new sql.Request(tx)
    .input("TransitNumber", sql.VarChar(50), transitNumber)
    .input("TransitDate", sql.Date, tanggal)
    .input("CustomerID", sql.Int, customerId)
    .input("Remarks", sql.VarChar(50), noRetur)
    .input("CreatedBy", sql.VarChar(50), "PPS")
    .input("ModifiedBy", sql.VarChar(50), "PPS")
    .input("TransitType", sql.VarChar(20), "SR")
    .input("TransitCounter", sql.Int, counter).query(`
      INSERT INTO ${GSU_TRANSIT_DB}.AR_SalesReturnTransit (
        TransitNumber, TransitDate, RegionID, CustomerID, Remarks,
        Void, Posted, CreatedBy, CreatedDate, ModifiedBy, ModifiedDate,
        WarehouseID, TransitType, TransitCounter, VoidDateTime, VoidBy, VoidReason
      ) OUTPUT INSERTED.TransitID
      VALUES (
        @TransitNumber, @TransitDate, 0, @CustomerID, @Remarks,
        0, 0, @CreatedBy, GETDATE(), @ModifiedBy, GETDATE(),
        0, @TransitType, @TransitCounter, NULL, NULL, NULL
      )
    `);
  const transitId = Number(headerIns.recordset[0].TransitID);

  // 5) Insert detail (TransitID = header; TransitDetailID identity auto)
  for (const row of rows) {
    const remark = remarksByItem.get(Number(row.IdItem)) ?? "";
    await new sql.Request(tx)
      .input("TransitID", sql.Int, transitId)
      .input("ItemID", sql.Int, Number(row.ItemID))
      .input("Quantity", sql.Int, Number(row.Pcs))
      .input("UOMLevel", sql.Int, Number(row.UOMLevel))
      .input("Remark", sql.NVarChar(500), remark).query(`
        INSERT INTO ${GSU_TRANSIT_DB}.AR_SalesReturnTransitDetails (
          TransitID, SourceInvoiceID, SourceInvoiceDetailID,
          ItemID, Quantity, UOMLevel, WarehouseID, Remarks,
          ImportedReturnID, ImportedReturnDetailID
        ) VALUES (
          @TransitID, 0, 0,
          @ItemID, @Quantity, @UOMLevel, 4, @Remark,
          0, 0
        )
      `);
  }

  return {
    exported: true,
    transitID: transitId,
    transitNumber,
    transitCounter: counter,
    transitDetailCount: rows.length,
  };
}

// Endpoint mandiri: POST /api/retur-v3/:noRetur/export-gsu
exports.exportToGsu = async (noRetur, body = {}, ctx) => {
  const no = String(noRetur || "").trim();
  if (!no) throw badReq("noRetur wajib diisi");

  const pool = await poolPromise;
  const tx = new sql.Transaction(pool);
  const { actorUsername } = ctx;

  try {
    await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    const result = await exportToGsuInTx(tx, no, actorUsername, body.remarks);
    await tx.commit();
    return { noRetur: no, ...result };
  } catch (e) {
    try {
      await tx.rollback();
    } catch (_) {}
    throw e;
  }
};

// ---------------------------------------------------------------------------
// DECISION
// ---------------------------------------------------------------------------

exports.decide = async (noRetur, decision, body = {}, ctx) => {
  const no = String(noRetur || "").trim();
  if (!no) throw badReq("noRetur wajib diisi");
  if (!["DIGANTI", "TIDAK_DIGANTI"].includes(decision)) {
    throw badReq("decision wajib DIGANTI atau TIDAK_DIGANTI");
  }

  const pool = await poolPromise;
  const tx = new sql.Transaction(pool);
  const { actorId, actorUsername, requestId } = ctx;

  try {
    await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    await applyAuditContext(new sql.Request(tx), { actorId, actorUsername, requestId });

    const headerRes = await new sql.Request(tx)
      .input("No", sql.VarChar(50), no)
      .query(
        `SELECT StatusRetur FROM dbo.BJReturV3_h WITH (UPDLOCK,HOLDLOCK) WHERE NoRetur=@No`,
      );
    const header = headerRes.recordset[0];
    if (!header) throw notFound(`NoRetur ${no} tidak ditemukan`);
    if (header.StatusRetur !== "PENDING") {
      throw conflict("Header sudah diputuskan sebelumnya");
    }

    const itemCountRes = await new sql.Request(tx)
      .input("No", sql.VarChar(50), no)
      .query(`SELECT COUNT(1) AS cnt FROM dbo.BJReturV3Item_d WHERE NoRetur=@No`);
    if (!(Number(itemCountRes.recordset[0].cnt) > 0)) {
      throw badReq("Header belum memiliki item, tidak bisa diputuskan");
    }

    await new sql.Request(tx)
      .input("No", sql.VarChar(50), no)
      .input("Status", sql.VarChar(20), decision)
      .input("DecisionBy", sql.Int, actorId)
      .input("DecisionByUsername", sql.VarChar(100), actorUsername).query(`
        UPDATE dbo.BJReturV3_h
        SET StatusRetur=@Status, DecisionBy=@DecisionBy, DecisionByUsername=@DecisionByUsername, DecisionAt=SYSUTCDATETIME()
        WHERE NoRetur=@No
      `);

    // Otomatis ekspor ke AS_GSU saat keputusan disimpan.
    // Jika retur ini sudah pernah diekspor, akan conflict (rollback).
    const exportResult = await exportToGsuInTx(tx, no, actorUsername, body.remarks);

    await tx.commit();
    return {
      noRetur: no,
      statusRetur: decision,
      export: exportResult,
      audit: { actorId, requestId },
    };
  } catch (e) {
    try {
      await tx.rollback();
    } catch (_) {}
    throw e;
  }
};

// ---------------------------------------------------------------------------
// GENERATE LABEL (TIDAK_DIGANTI path)
// ---------------------------------------------------------------------------

exports.generateLabel = async (noRetur, idItem, body, ctx) => {
  const no = String(noRetur || "").trim();
  const idItemNum = Number(idItem);
  if (!no) throw badReq("noRetur wajib diisi");
  if (!Number.isFinite(idItemNum)) throw badReq("idItem tidak valid");

  const pool = await poolPromise;
  const itemRes = await pool
    .request()
    .input("Id", sql.Int, idItemNum)
    .input("No", sql.VarChar(50), no)
    .query(`SELECT * FROM dbo.BJReturV3Item_d WHERE IdItem=@Id AND NoRetur=@No`);
  const item = itemRes.recordset[0];
  if (!item) throw notFound(`Item ${idItemNum} tidak ditemukan pada retur ${no}`);

  if (item.KategoriInput === "REJECT") {
    return generateRejectLabel(no, idItemNum, body, ctx);
  }
  if (item.KodeKategori === "barangjadi") {
    return generateBarangJadiLabel(no, idItemNum, ctx);
  }
  if (item.KodeKategori === "furniturewip") {
    return generateFurnitureWipLabel(no, idItemNum, ctx);
  }
  throw badReq(`KodeKategori ${item.KodeKategori} tidak didukung`);
};

// ---------------------------------------------------------------------------
// OUTPUTS
// ---------------------------------------------------------------------------

exports.getOutputs = async (noRetur) => {
  const no = String(noRetur || "").trim();
  if (!no) throw badReq("noRetur wajib diisi");
  const pool = await poolPromise;

  // Tidak ada tabel mapping output terpisah — GeneratedLabelCode di
  // BJReturV3Item_d menunjuk langsung ke NoBJ/NoFurnitureWIP/NoReject,
  // tergantung KodeKategori+KategoriInput item tsb, jadi cukup 1 query
  // dengan LEFT JOIN kondisional ke masing-masing tabel master.
  const res = await pool
    .request()
    .input("No", sql.VarChar(50), no).query(`
      SELECT
        it.GeneratedLabelCode AS LabelCode,
        COALESCE(bj.DateCreate, fw.DateCreate, r.DateCreate) AS DateCreate,
        COALESCE(mbj.NamaBJ, mcw.Nama, mr.NamaReject) AS NamaJenis,
        CASE WHEN it.KategoriInput = 'REJECT' THEN N'reject' ELSE it.KodeKategori END AS KodeKategori,
        CASE
          WHEN it.KategoriInput = 'REJECT' THEN N'Reject'
          WHEN it.KodeKategori = 'barangjadi' THEN N'Barang Jadi'
          ELSE N'Furniture WIP'
        END AS Kategori,
        CASE WHEN it.KategoriInput = 'REJECT' THEN N'kg' ELSE N'pcs' END AS Uom,
        COALESCE(bj.Blok, fw.Blok, r.Blok) AS Blok,
        COALESCE(bj.IdLokasi, fw.IdLokasi, r.IdLokasi) AS IdLokasi,
        CASE
          WHEN it.KategoriInput = 'REJECT' THEN ISNULL(r.Berat, 0)
          ELSE ISNULL(COALESCE(bj.Pcs, fw.Pcs), 0)
        END AS Qty,
        ISNULL(CAST(COALESCE(bj.HasBeenPrinted, fw.HasBeenPrinted, r.HasBeenPrinted) AS int), 0) AS HasBeenPrinted
      FROM dbo.BJReturV3Item_d it
      LEFT JOIN dbo.BarangJadi bj
        ON bj.NoBJ = it.GeneratedLabelCode AND it.KodeKategori = 'barangjadi' AND it.KategoriInput = 'BAGUS'
      LEFT JOIN dbo.MstBarangJadi mbj ON mbj.IdBJ = bj.IdBJ
      LEFT JOIN dbo.FurnitureWIP fw
        ON fw.NoFurnitureWIP = it.GeneratedLabelCode AND it.KodeKategori = 'furniturewip' AND it.KategoriInput = 'BAGUS'
      LEFT JOIN dbo.MstCabinetWIP mcw ON mcw.IdCabinetWIP = fw.IDFurnitureWIP
      LEFT JOIN dbo.RejectV2 r
        ON r.NoReject = it.GeneratedLabelCode AND it.KategoriInput = 'REJECT'
      LEFT JOIN dbo.MstReject mr ON mr.IdReject = r.IdReject
      WHERE it.NoRetur = @No AND it.GeneratedLabelCode IS NOT NULL
      ORDER BY it.GeneratedLabelCode ASC
    `);

  return res.recordset || [];
};

// ---------------------------------------------------------------------------
// TURNOVER (DIGANTI path) — scan mencocokkan ke BJReturV3TurnoverTarget_d
// (target pengganti), bukan ke BJReturV3Item_d (barang yang kembali) lagi.
// ---------------------------------------------------------------------------

// Auto-detect: deteksi kategori+jenis label yang discan (cek BarangJadi lalu
// FurnitureWIP), lalu cari target pengganti yang KodeKategori+IdJenis-nya
// cocok dan masih punya sisa (Pcs - ScannedPcs > 0). Kalau ada beberapa
// target yang cocok, pilih yang IdTarget paling kecil (ditambahkan paling
// awal) supaya deterministik.
exports.scanTurnoverAuto = async (noRetur, labelCode, ctx) => {
  const no = String(noRetur || "").trim();
  const code = String(labelCode || "").trim();
  if (!no) throw badReq("noRetur wajib diisi");
  if (!code) throw badReq("labelCode wajib diisi");

  const pool = await poolPromise;
  const tx = new sql.Transaction(pool);
  const { actorId, actorUsername, requestId } = ctx;

  try {
    await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    await applyAuditContext(new sql.Request(tx), { actorId, actorUsername, requestId });

    const headerRes = await new sql.Request(tx)
      .input("No", sql.VarChar(50), no)
      .query(
        `SELECT StatusRetur FROM dbo.BJReturV3_h WITH (UPDLOCK,HOLDLOCK) WHERE NoRetur=@No`,
      );
    const header = headerRes.recordset[0];
    if (!header) throw notFound(`NoRetur ${no} tidak ditemukan`);
    if (header.StatusRetur !== "DIGANTI") {
      throw conflict("Scan turnover hanya bisa dilakukan saat StatusRetur=DIGANTI");
    }

    const bjRes = await new sql.Request(tx).input("Code", sql.VarChar(50), code)
      .query(`
        SELECT NoBJ AS Code, IdBJ AS IdJenis, ISNULL(Pcs, 0) AS Pcs, DateUsage
        FROM dbo.BarangJadi WITH (UPDLOCK, HOLDLOCK)
        WHERE NoBJ = @Code
      `);

    let kodeKategori = null;
    let table = null;
    let codeCol = null;
    let label = null;

    if (bjRes.recordset.length > 0) {
      kodeKategori = "barangjadi";
      table = "dbo.BarangJadi";
      codeCol = "NoBJ";
      label = bjRes.recordset[0];
    } else {
      const fwRes = await new sql.Request(tx).input("Code", sql.VarChar(50), code)
        .query(`
          SELECT NoFurnitureWIP AS Code, IDFurnitureWIP AS IdJenis, ISNULL(Pcs, 0) AS Pcs, DateUsage
          FROM dbo.FurnitureWIP WITH (UPDLOCK, HOLDLOCK)
          WHERE NoFurnitureWIP = @Code
        `);
      if (fwRes.recordset.length > 0) {
        kodeKategori = "furniturewip";
        table = "dbo.FurnitureWIP";
        codeCol = "NoFurnitureWIP";
        label = fwRes.recordset[0];
      }
    }

    if (!label) throw badReq(`Label ${code} tidak ditemukan`);
    if (label.DateUsage != null) throw badReq(`Label ${code} sudah terpakai`);

    const candidatesRes = await new sql.Request(tx)
      .input("No", sql.VarChar(50), no)
      .input("KodeKategori", sql.VarChar(20), kodeKategori)
      .input("IdJenis", sql.Int, Number(label.IdJenis)).query(`
        SELECT t.IdTarget, t.IdItem, t.Pcs,
          ISNULL((SELECT SUM(tv.Pcs) FROM dbo.BJReturV3Turnover_d tv WHERE tv.IdTarget = t.IdTarget), 0) AS ScannedPcs
        FROM dbo.BJReturV3TurnoverTarget_d t WITH (UPDLOCK, HOLDLOCK)
        WHERE t.NoRetur = @No AND t.KodeKategori = @KodeKategori AND t.IdJenis = @IdJenis
        ORDER BY t.IdTarget ASC
      `);

    const candidate = (candidatesRes.recordset || []).find(
      (r) => Number(r.Pcs) - Number(r.ScannedPcs || 0) > 0,
    );

    if (!candidate) {
      throw badReq(
        `Tidak ada target pengganti di retur ini yang cocok dengan label ${code} (jenis tidak ditemukan, atau target sudah terpenuhi semua)`,
      );
    }

    const remaining = Number(candidate.Pcs) - Number(candidate.ScannedPcs || 0);
    const labelPcs = Number(label.Pcs || 0);

    if (labelPcs > remaining) {
      throw badReq(
        `Pcs label (${labelPcs}) melebihi sisa target (${remaining}). Scan ditolak seluruhnya (tidak ada partial consumption).`,
      );
    }

    await new sql.Request(tx)
      .input("NoRetur", sql.VarChar(50), no)
      .input("IdTarget", sql.Int, candidate.IdTarget)
      .input("LabelCode", sql.VarChar(50), code)
      .input("Pcs", sql.Int, labelPcs)
      .input("ScanBy", sql.VarChar(50), actorUsername).query(`
        INSERT INTO dbo.BJReturV3Turnover_d (NoRetur, IdTarget, LabelCode, Pcs, ScanBy)
        OUTPUT INSERTED.IdTurnover
        VALUES (@NoRetur, @IdTarget, @LabelCode, @Pcs, @ScanBy)
      `);

    await new sql.Request(tx)
      .input("Code", sql.VarChar(50), code)
      .query(`UPDATE ${table} SET DateUsage = SYSUTCDATETIME() WHERE ${codeCol} = @Code`);

    await tx.commit();
    return {
      noRetur: no,
      idItem: candidate.IdItem,
      idTarget: candidate.IdTarget,
      kodeKategori,
      idJenis: Number(label.IdJenis),
      labelCode: code,
      pcs: labelPcs,
      scannedPcs: Number(candidate.ScannedPcs || 0) + labelPcs,
      targetPcs: Number(candidate.Pcs),
      audit: { actorId, requestId },
    };
  } catch (e) {
    try {
      await tx.rollback();
    } catch (_) {}
    throw e;
  }
};

exports.undoScan = async (noRetur, idTurnover, ctx) => {
  const no = String(noRetur || "").trim();
  const idTurnoverNum = Number(idTurnover);
  if (!no) throw badReq("noRetur wajib diisi");
  if (!Number.isFinite(idTurnoverNum)) throw badReq("idTurnover tidak valid");

  const pool = await poolPromise;
  const tx = new sql.Transaction(pool);
  const { actorId, actorUsername, requestId } = ctx;

  try {
    await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    await applyAuditContext(new sql.Request(tx), { actorId, actorUsername, requestId });

    const headerRes = await new sql.Request(tx)
      .input("No", sql.VarChar(50), no)
      .query(
        `SELECT StatusRetur, IsComplete FROM dbo.BJReturV3_h WITH (UPDLOCK,HOLDLOCK) WHERE NoRetur=@No`,
      );
    const header = headerRes.recordset[0];
    if (!header) throw notFound(`NoRetur ${no} tidak ditemukan`);
    if (header.IsComplete) {
      throw conflict("Retur sudah ditandai selesai, tidak bisa membatalkan scan");
    }

    const turnoverRes = await new sql.Request(tx)
      .input("Id", sql.Int, idTurnoverNum)
      .input("No", sql.VarChar(50), no)
      .query(
        `SELECT tv.*, t.KodeKategori
         FROM dbo.BJReturV3Turnover_d tv WITH (UPDLOCK,HOLDLOCK)
         INNER JOIN dbo.BJReturV3TurnoverTarget_d t ON t.IdTarget = tv.IdTarget
         WHERE tv.IdTurnover=@Id AND tv.NoRetur=@No`,
      );
    const turnover = turnoverRes.recordset[0];
    if (!turnover) throw notFound(`Turnover ${idTurnoverNum} tidak ditemukan`);

    const table = turnover.KodeKategori === "barangjadi" ? "dbo.BarangJadi" : "dbo.FurnitureWIP";
    const codeCol = turnover.KodeKategori === "barangjadi" ? "NoBJ" : "NoFurnitureWIP";

    await new sql.Request(tx)
      .input("Code", sql.VarChar(50), turnover.LabelCode)
      .query(`UPDATE ${table} SET DateUsage = NULL WHERE ${codeCol} = @Code`);

    await new sql.Request(tx)
      .input("Id", sql.Int, idTurnoverNum)
      .query(`DELETE FROM dbo.BJReturV3Turnover_d WHERE IdTurnover=@Id`);

    await tx.commit();
    return { noRetur: no, idTurnover: idTurnoverNum, audit: { actorId, requestId } };
  } catch (e) {
    try {
      await tx.rollback();
    } catch (_) {}
    throw e;
  }
};

exports.getTurnover = async (noRetur) => {
  const no = String(noRetur || "").trim();
  if (!no) throw badReq("noRetur wajib diisi");
  const pool = await poolPromise;

  const itemsRes = await pool
    .request()
    .input("No", sql.VarChar(50), no).query(`
      SELECT
        it.IdItem, it.Pcs, it.KodeKategori, it.IdJenis,
        CASE
          WHEN it.KodeKategori = 'barangjadi' THEN mbj.NamaBJ
          WHEN it.KodeKategori = 'furniturewip' THEN mcw.Nama
        END AS NamaJenis
      FROM dbo.BJReturV3Item_d it
      LEFT JOIN dbo.MstBarangJadi mbj ON mbj.IdBJ = it.IdJenis AND it.KodeKategori = 'barangjadi'
      LEFT JOIN dbo.MstCabinetWIP mcw ON mcw.IdCabinetWIP = it.IdJenis AND it.KodeKategori = 'furniturewip'
      WHERE it.NoRetur=@No
      ORDER BY it.IdItem ASC
    `);
  const items = itemsRes.recordset || [];
  if (items.length === 0) return [];

  const targetsRes = await pool
    .request()
    .input("No", sql.VarChar(50), no).query(`
      SELECT
        t.IdTarget, t.IdItem, t.KodeKategori, t.IdJenis, t.Pcs,
        CASE
          WHEN t.KodeKategori = 'barangjadi' THEN mbj.NamaBJ
          WHEN t.KodeKategori = 'furniturewip' THEN mcw.Nama
        END AS NamaJenis
      FROM dbo.BJReturV3TurnoverTarget_d t
      LEFT JOIN dbo.MstBarangJadi mbj ON mbj.IdBJ = t.IdJenis AND t.KodeKategori = 'barangjadi'
      LEFT JOIN dbo.MstCabinetWIP mcw ON mcw.IdCabinetWIP = t.IdJenis AND t.KodeKategori = 'furniturewip'
      WHERE t.NoRetur=@No
      ORDER BY t.IdItem ASC, t.IdTarget ASC
    `);
  const targets = targetsRes.recordset || [];

  const scansRes = await pool
    .request()
    .input("No", sql.VarChar(50), no).query(`
      SELECT IdTurnover, IdTarget, LabelCode, Pcs, DateTimeScan
      FROM dbo.BJReturV3Turnover_d
      WHERE NoRetur=@No
      ORDER BY IdTarget ASC, IdTurnover ASC
    `);
  const scans = scansRes.recordset || [];

  return items.map((it) => {
    const itemTargets = targets.filter((t) => t.IdItem === it.IdItem);
    return {
      idItem: it.IdItem,
      kodeKategoriAsal: it.KodeKategori,
      idJenisAsal: it.IdJenis,
      namaJenisAsal: it.NamaJenis,
      pcsAsal: Number(it.Pcs),
      targets: itemTargets.map((t) => {
        const targetScans = scans.filter((s) => s.IdTarget === t.IdTarget);
        const scannedPcs = targetScans.reduce((sum, s) => sum + Number(s.Pcs || 0), 0);
        return {
          idTarget: t.IdTarget,
          kodeKategori: t.KodeKategori,
          idJenis: t.IdJenis,
          namaJenis: t.NamaJenis,
          targetPcs: Number(t.Pcs),
          scannedPcs,
          scans: targetScans.map((s) => ({
            idTurnover: s.IdTurnover,
            labelCode: s.LabelCode,
            pcs: Number(s.Pcs),
            dateTimeScan: s.DateTimeScan,
          })),
        };
      }),
    };
  });
};

// ---------------------------------------------------------------------------
// MARK COMPLETE
// ---------------------------------------------------------------------------

exports.markComplete = async (noRetur, ctx) => {
  const no = String(noRetur || "").trim();
  if (!no) throw badReq("noRetur wajib diisi");

  const pool = await poolPromise;
  const tx = new sql.Transaction(pool);
  const { actorId, actorUsername, requestId } = ctx;

  try {
    await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    await applyAuditContext(new sql.Request(tx), { actorId, actorUsername, requestId });

    const headerRes = await new sql.Request(tx)
      .input("No", sql.VarChar(50), no)
      .query(
        `SELECT StatusRetur, IsComplete FROM dbo.BJReturV3_h WITH (UPDLOCK,HOLDLOCK) WHERE NoRetur=@No`,
      );
    const header = headerRes.recordset[0];
    if (!header) throw notFound(`NoRetur ${no} tidak ditemukan`);
    if (header.StatusRetur !== "DIGANTI") {
      throw conflict("Retur hanya bisa ditandai selesai saat StatusRetur=DIGANTI");
    }
    if (header.IsComplete) {
      throw conflict("Retur sudah ditandai selesai sebelumnya");
    }

    // Item tanpa target sama sekali dianggap belum siap ditandai selesai
    // (bukan "otomatis terpenuhi" karena tidak ada baris untuk dibandingkan).
    const itemsWithoutTargetRes = await new sql.Request(tx)
      .input("No", sql.VarChar(50), no).query(`
        SELECT it.IdItem
        FROM dbo.BJReturV3Item_d it
        LEFT JOIN dbo.BJReturV3TurnoverTarget_d t ON t.IdItem = it.IdItem
        WHERE it.NoRetur = @No AND t.IdTarget IS NULL
      `);
    if (itemsWithoutTargetRes.recordset.length > 0) {
      throw conflict(
        `Tidak bisa ditandai selesai: masih ada item yang belum ditentukan target penggantinya (${itemsWithoutTargetRes.recordset.length} item)`,
      );
    }

    const unfulfilledRes = await new sql.Request(tx)
      .input("No", sql.VarChar(50), no).query(`
        SELECT t.IdTarget, t.Pcs, ISNULL(s.ScannedPcs, 0) AS ScannedPcs
        FROM dbo.BJReturV3TurnoverTarget_d t
        LEFT JOIN (
          SELECT IdTarget, SUM(Pcs) AS ScannedPcs
          FROM dbo.BJReturV3Turnover_d
          WHERE NoRetur = @No
          GROUP BY IdTarget
        ) s ON s.IdTarget = t.IdTarget
        WHERE t.NoRetur = @No
          AND ISNULL(s.ScannedPcs, 0) <> t.Pcs
      `);
    if (unfulfilledRes.recordset.length > 0) {
      throw conflict(
        `Tidak bisa ditandai selesai: masih ada target yang belum fully scanned (${unfulfilledRes.recordset.length} target)`,
      );
    }

    await new sql.Request(tx)
      .input("No", sql.VarChar(50), no)
      .input("CompletedBy", sql.Int, actorId)
      .input("CompletedByUsername", sql.VarChar(100), actorUsername).query(`
        UPDATE dbo.BJReturV3_h
        SET IsComplete=1, CompletedBy=@CompletedBy, CompletedByUsername=@CompletedByUsername, CompletedAt=SYSUTCDATETIME()
        WHERE NoRetur=@No
      `);

    await tx.commit();
    return { noRetur: no, isComplete: true, audit: { actorId, requestId } };
  } catch (e) {
    try {
      await tx.rollback();
    } catch (_) {}
    throw e;
  }
};
