// penerimaan-bahan-baku-service.js
const { sql, poolPromise } = require("../../../core/config/db");
const { generateNextCode } = require("../../../core/utils/sequence-code-helper");
const { badReq, notFound, conflict } = require("../../../core/utils/http-error");
const { applyAuditContext } = require("../../../core/utils/db-audit-context");
const {
  assertNotLocked,
  loadDocDateOnlyFromConfig,
  toDateOnly,
} = require("../../../core/shared/tutup-transaksi-guard");

// Kode kategori bahan baku yang didukung modul Penerimaan Bahan Baku,
// dan prefix label-nya di-resolve dinamis dari dbo.MstKategori (bukan
// di-hardcode) — lihat resolveKategoriPrefix(). Berdasarkan data MstKategori
// aktual: KodeKategori "bahanbaku" (NamaKategori "Bahan Baku", generik —
// dipakai sebagai alur "Proses") punya PrefixLabel "A.", sedangkan
// "bahanbakupakai" ("Bahan Baku Pakai") punya PrefixLabel "AB.".
const SUPPORTED_KODE_KATEGORI = new Set(["bahanbaku", "bahanbakupakai"]);

/// Ambil PrefixLabel dari dbo.MstKategori untuk sebuah KodeKategori.
/// [runner] boleh berupa pool (read-only, mis. saat list) atau transaksi
/// (mis. saat create, supaya ikut serialisasi transaksi yang sama).
async function resolveKategoriPrefix(runner, kodeKategori) {
  const result = await new sql.Request(runner)
    .input("KodeKategori", sql.VarChar(50), kodeKategori)
    .query(`
      SELECT PrefixLabel
      FROM dbo.MstKategori
      WHERE KodeKategori = @KodeKategori AND ISNULL(Enable, 1) = 1
    `);

  const prefix = result.recordset[0]?.PrefixLabel;
  if (!prefix) {
    throw badReq(`Kategori "${kodeKategori}" tidak ditemukan atau tidak aktif di MstKategori`);
  }
  return prefix;
}

function normalizeSaks(saks, palletIndex) {
  if (!Array.isArray(saks) || saks.length === 0) {
    throw badReq(`pallets[${palletIndex}].saks wajib berisi minimal 1 sak`);
  }

  const seen = new Set();
  return saks.map((sak, sakIndex) => {
    const noSak = Number.parseInt(sak?.noSak, 10);
    const berat = Number(sak?.berat);

    if (!Number.isFinite(noSak) || noSak <= 0) {
      throw badReq(`pallets[${palletIndex}].saks[${sakIndex}].noSak wajib valid`);
    }
    if (!Number.isFinite(berat) || berat <= 0) {
      throw badReq(`pallets[${palletIndex}].saks[${sakIndex}].berat wajib valid`);
    }

    const key = String(noSak);
    if (seen.has(key)) {
      throw badReq(`noSak duplikat di pallets[${palletIndex}]: ${sak.noSak}`);
    }
    seen.add(key);

    return { NoSak: Math.trunc(noSak), Berat: berat };
  });
}

function normalizePallets(pallets) {
  if (!Array.isArray(pallets) || pallets.length === 0) {
    throw badReq("pallets wajib berisi minimal 1 pallet");
  }

  return pallets.map((p, i) => {
    const idJenisPlastik = Number(p?.idJenisPlastik);
    if (!Number.isInteger(idJenisPlastik) || idJenisPlastik <= 0) {
      throw badReq(`pallets[${i}].idJenisPlastik wajib diisi`);
    }

    return {
      idJenisPlastik,
      idWarehouse: p.idWarehouse != null ? Number(p.idWarehouse) : null,
      keterangan: p.keterangan != null ? String(p.keterangan).trim() || null : null,
      idStatus: p.idStatus != null ? Number(p.idStatus) : 1,
      moisture: p.moisture != null ? Number(p.moisture) : null,
      meltingIndex: p.meltingIndex != null ? Number(p.meltingIndex) : null,
      elasticity: p.elasticity != null ? Number(p.elasticity) : null,
      tenggelam: p.tenggelam != null ? Number(p.tenggelam) : null,
      density: p.density != null ? Number(p.density) : null,
      density2: p.density2 != null ? Number(p.density2) : null,
      density3: p.density3 != null ? Number(p.density3) : null,
      blok: p.blok ? String(p.blok).trim() : "BSS",
      idLokasi: p.idLokasi != null ? Number(p.idLokasi) : 1,
      saks: normalizeSaks(p.saks, i),
    };
  });
}

function validateCreatePayload(payload) {
  const tglPenerimaan = String(payload?.tglPenerimaan || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tglPenerimaan)) {
    throw badReq("tglPenerimaan wajib diisi dengan format YYYY-MM-DD");
  }

  const idTim = Number(payload?.idTim);
  if (!Number.isInteger(idTim) || idTim <= 0) {
    throw badReq("idTim wajib diisi");
  }

  const idSupplier = Number(payload?.idSupplier);
  if (!Number.isInteger(idSupplier) || idSupplier <= 0) {
    throw badReq("idSupplier wajib diisi");
  }

  const noPlat = payload?.noPlat ? String(payload.noPlat).trim() || null : null;

  const kodeKategori = String(payload?.kodeKategori || payload?.kategori || "")
    .trim()
    .toLowerCase();
  if (!SUPPORTED_KODE_KATEGORI.has(kodeKategori)) {
    throw badReq(
      `kodeKategori tidak valid: ${payload?.kodeKategori}. Gunakan salah satu dari: ${[...SUPPORTED_KODE_KATEGORI].join(", ")}`,
    );
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

  const pallets = normalizePallets(payload?.pallets);

  return {
    tglPenerimaan,
    idTim,
    idSupplier,
    noPlat,
    kodeKategori,
    shift,
    hourStart,
    hourEnd,
    pallets,
  };
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
    .query(`SELECT Aktif FROM dbo.MstTimPenerimaanBB WHERE IdTim = @IdTim`);

  const row = result.recordset[0];
  if (!row) {
    throw badReq(`IdTim ${idTim} tidak ditemukan`);
  }
  if (!row.Aktif) {
    throw badReq(`Tim penerimaan bahan baku dengan IdTim ${idTim} sedang tidak aktif`);
  }
}

async function createPenerimaanBahanBaku(payload, ctx) {
  const v = validateCreatePayload(payload);
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
      action: "create PenerimaanBahanBaku",
      useLock: true,
    });

    await assertTimAktif(tx, v.idTim);

    const prefix = await resolveKategoriPrefix(tx, v.kodeKategori);

    const noPenerimaan = await generateUniqueCode(tx, {
      tableName: "dbo.PenerimaanBahanBaku_h",
      columnName: "NoPenerimaan",
      prefix: "R.",
      width: 10,
    });

    const noBahanBaku = await generateUniqueCode(tx, {
      tableName: "dbo.BahanBaku_h",
      columnName: "NoBahanBaku",
      prefix,
      width: 10,
    });

    const nowDate = new Date();

    await new sql.Request(tx)
      .input("NoPenerimaan", sql.VarChar(20), noPenerimaan)
      .input("TglPenerimaan", sql.Date, v.tglPenerimaan)
      .input("IdTim", sql.Int, v.idTim)
      .input("IdSupplier", sql.Int, v.idSupplier)
      .input("NoPlat", sql.VarChar(20), v.noPlat)
      .input("Shift", sql.Int, v.shift)
      .input("HourStart", sql.VarChar(20), v.hourStart)
      .input("HourEnd", sql.VarChar(20), v.hourEnd)
      .input("CreateBy", sql.VarChar(100), actorUsername || null)
      .query(`
        INSERT INTO dbo.PenerimaanBahanBaku_h
          (NoPenerimaan, TglPenerimaan, IdTim, IdSupplier, NoPlat, Shift, HourStart, HourEnd, CreateBy)
        VALUES
          (
            @NoPenerimaan, @TglPenerimaan, @IdTim, @IdSupplier, @NoPlat,
            @Shift,
            CASE WHEN @HourStart IS NULL OR LTRIM(RTRIM(@HourStart)) = '' THEN NULL ELSE CAST(@HourStart AS time(7)) END,
            CASE WHEN @HourEnd IS NULL OR LTRIM(RTRIM(@HourEnd)) = '' THEN NULL ELSE CAST(@HourEnd AS time(7)) END,
            @CreateBy
          )
      `);

    await new sql.Request(tx)
      .input("NoBahanBaku", sql.VarChar(50), noBahanBaku)
      .input("IdSupplier", sql.Int, v.idSupplier)
      .input("NoPlat", sql.VarChar(20), v.noPlat)
      .input("DateCreate", sql.Date, v.tglPenerimaan)
      .input("CreateBy", sql.VarChar(100), actorUsername || null)
      .input("DateTimeCreate", sql.DateTime, nowDate)
      .query(`
        INSERT INTO dbo.BahanBaku_h
          (NoBahanBaku, IdSupplier, NoPlat, DateCreate, CreateBy, DateTimeCreate)
        VALUES
          (@NoBahanBaku, @IdSupplier, @NoPlat, @DateCreate, @CreateBy, @DateTimeCreate)
      `);

    const createdOutputs = [];
    let noPallet = 1;

    for (const pallet of v.pallets) {
      const saksJson = JSON.stringify(pallet.saks);

      await new sql.Request(tx)
        .input("NoBahanBaku", sql.VarChar(50), noBahanBaku)
        .input("NoPallet", sql.Int, noPallet)
        .input("IdJenisPlastik", sql.Int, pallet.idJenisPlastik)
        .input("IdWarehouse", sql.Int, pallet.idWarehouse)
        .input("Keterangan", sql.NVarChar(200), pallet.keterangan)
        .input("IdStatus", sql.Int, pallet.idStatus)
        .input("Moisture", sql.Decimal(10, 3), pallet.moisture)
        .input("MeltingIndex", sql.Decimal(10, 3), pallet.meltingIndex)
        .input("Elasticity", sql.Decimal(10, 3), pallet.elasticity)
        .input("Tenggelam", sql.Decimal(10, 3), pallet.tenggelam)
        .input("Density", sql.Decimal(10, 3), pallet.density)
        .input("Density2", sql.Decimal(10, 3), pallet.density2)
        .input("Density3", sql.Decimal(10, 3), pallet.density3)
        .input("HasBeenPrinted", sql.Int, 0)
        .input("Blok", sql.VarChar(50), pallet.blok)
        .input("IdLokasi", sql.Int, pallet.idLokasi)
        .query(`
          INSERT INTO dbo.BahanBakuPallet_h (
            NoBahanBaku, NoPallet, IdJenisPlastik, IdWarehouse, Keterangan,
            IdStatus, Moisture, MeltingIndex, Elasticity, Tenggelam,
            Density, Density2, Density3, HasBeenPrinted, Blok, IdLokasi
          )
          VALUES (
            @NoBahanBaku, @NoPallet, @IdJenisPlastik, @IdWarehouse, @Keterangan,
            @IdStatus, @Moisture, @MeltingIndex, @Elasticity, @Tenggelam,
            @Density, @Density2, @Density3, @HasBeenPrinted, @Blok, @IdLokasi
          )
        `);

      await new sql.Request(tx)
        .input("NoBahanBaku", sql.VarChar(50), noBahanBaku)
        .input("NoPallet", sql.Int, noPallet)
        .input("TimeCreate", sql.DateTime, nowDate)
        .input("IdLokasi", sql.Int, pallet.idLokasi)
        .input("SaksJson", sql.NVarChar(sql.MAX), saksJson)
        .query(`
          INSERT INTO dbo.BahanBaku_d (
            NoBahanBaku, NoPallet, NoSak, Berat, DateUsage,
            IsPartial, BeratAct, TimeCreate, IdLokasi, IsLembab
          )
          SELECT
            @NoBahanBaku, @NoPallet, j.NoSak, j.Berat, NULL,
            0, NULL, @TimeCreate, @IdLokasi, 0
          FROM OPENJSON(@SaksJson)
          WITH (
            NoSak int '$.NoSak',
            Berat decimal(18,3) '$.Berat'
          ) AS j
        `);

      await new sql.Request(tx)
        .input("NoPenerimaan", sql.VarChar(20), noPenerimaan)
        .input("NoBahanBaku", sql.VarChar(50), noBahanBaku)
        .input("NoPallet", sql.Int, noPallet)
        .input("SaksJson", sql.NVarChar(sql.MAX), saksJson)
        .query(`
          INSERT INTO dbo.PenerimaanBahanBakuOutput (NoPenerimaan, NoBahanBaku, NoPallet, NoSak)
          SELECT @NoPenerimaan, @NoBahanBaku, @NoPallet, j.NoSak
          FROM OPENJSON(@SaksJson)
          WITH (NoSak int '$.NoSak') AS j
        `);

      createdOutputs.push({
        noBahanBaku,
        noPallet,
        idJenisPlastik: pallet.idJenisPlastik,
        jumlahSak: pallet.saks.length,
        totalBerat: pallet.saks.reduce((sum, sak) => sum + sak.Berat, 0),
      });

      noPallet += 1;
    }

    await tx.commit();

    return {
      noPenerimaan,
      tglPenerimaan: v.tglPenerimaan,
      idTim: v.idTim,
      idSupplier: v.idSupplier,
      noPlat: v.noPlat,
      shift: v.shift,
      hourStart: v.hourStart,
      hourEnd: v.hourEnd,
      kodeKategori: v.kodeKategori,
      prefix,
      noBahanBaku,
      outputs: createdOutputs,
      audit: { actorId: audit.actorId, requestId: audit.requestId },
    };
  } catch (err) {
    try {
      await tx.rollback();
    } catch (_) {}
    throw err;
  }
}

async function listPenerimaanBahanBaku({ page = 1, pageSize = 20, filter = "", kodeKategori = "" } = {}) {
  const pool = await poolPromise;

  const p = Math.max(1, Number(page) || 1);
  const ps = Math.max(1, Math.min(200, Number(pageSize) || 20));
  const offset = (p - 1) * ps;
  const filterTerm = String(filter || "").trim();
  const kodeKategoriTerm = String(kodeKategori || "").trim().toLowerCase();

  let prefixTerm = "";
  if (kodeKategoriTerm) {
    if (!SUPPORTED_KODE_KATEGORI.has(kodeKategoriTerm)) {
      throw badReq(`kodeKategori tidak valid: ${kodeKategori}`);
    }
    prefixTerm = await resolveKategoriPrefix(pool, kodeKategoriTerm);
  }

  // NoBahanBaku 1:1 dengan NoPenerimaan (dibuat sekaligus saat create), jadi
  // filter kategori cukup dicek lewat salah satu output-nya.
  const whereClause = `
    WHERE 1 = 1
      AND (
        @Filter = ''
        OR h.NoPenerimaan LIKE '%' + @Filter + '%'
        OR ISNULL(sup.NmSupplier, '') LIKE '%' + @Filter + '%'
        OR ISNULL(t.NamaTim, '') LIKE '%' + @Filter + '%'
      )
      AND (
        @PrefixTerm = ''
        OR EXISTS (
          SELECT 1 FROM dbo.PenerimaanBahanBakuOutput po
          WHERE po.NoPenerimaan = h.NoPenerimaan AND po.NoBahanBaku LIKE @PrefixTerm + '%'
        )
      )
  `;

  const countReq = pool.request();
  countReq.input("Filter", sql.VarChar(100), filterTerm);
  countReq.input("PrefixTerm", sql.VarChar(20), prefixTerm);
  const countRes = await countReq.query(`
    SELECT COUNT(1) AS total
    FROM dbo.PenerimaanBahanBaku_h h WITH (NOLOCK)
    LEFT JOIN dbo.MstSupplier sup WITH (NOLOCK) ON sup.IdSupplier = h.IdSupplier
    LEFT JOIN dbo.MstTimPenerimaanBB t WITH (NOLOCK) ON t.IdTim = h.IdTim
    ${whereClause};
  `);
  const total = countRes.recordset?.[0]?.total || 0;
  if (total === 0) return { data: [], total: 0 };

  const dataReq = pool.request();
  dataReq.input("Filter", sql.VarChar(100), filterTerm);
  dataReq.input("PrefixTerm", sql.VarChar(20), prefixTerm);
  dataReq.input("offset", sql.Int, offset);
  dataReq.input("limit", sql.Int, ps);
  const dataRes = await dataReq.query(`
    SELECT
      h.NoPenerimaan,
      CONVERT(varchar(10), h.TglPenerimaan, 23) AS TglPenerimaan,
      h.IdTim,
      t.NamaTim,
      h.IdSupplier,
      sup.NmSupplier AS NamaSupplier,
      h.NoPlat,
      h.Shift,
      CONVERT(VARCHAR(8), h.HourStart, 108) AS HourStart,
      CONVERT(VARCHAR(8), h.HourEnd, 108) AS HourEnd,
      h.CreateBy,
      h.DateTimeCreate,
      agg.NoBahanBaku,
      agg.JumlahPallet,
      agg.TotalBerat
    FROM dbo.PenerimaanBahanBaku_h h WITH (NOLOCK)
    LEFT JOIN dbo.MstSupplier sup WITH (NOLOCK) ON sup.IdSupplier = h.IdSupplier
    LEFT JOIN dbo.MstTimPenerimaanBB t WITH (NOLOCK) ON t.IdTim = h.IdTim
    OUTER APPLY (
      SELECT TOP 1
        o.NoBahanBaku,
        COUNT(DISTINCT o.NoPallet) AS JumlahPallet,
        SUM(ISNULL(d.Berat, 0)) AS TotalBerat
      FROM dbo.PenerimaanBahanBakuOutput o
      LEFT JOIN dbo.BahanBaku_d d
        ON d.NoBahanBaku = o.NoBahanBaku AND d.NoPallet = o.NoPallet AND d.NoSak = o.NoSak
      WHERE o.NoPenerimaan = h.NoPenerimaan
      GROUP BY o.NoBahanBaku
    ) agg
    ${whereClause}
    ORDER BY h.NoPenerimaan DESC
    OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY;
  `);

  return { data: dataRes.recordset || [], total };
}

async function getDetailPenerimaanBahanBaku(noPenerimaan) {
  const pool = await poolPromise;
  const request = pool.request();
  request.input("NoPenerimaan", sql.VarChar(20), String(noPenerimaan));

  const headerResult = await request.query(`
    SELECT
      h.NoPenerimaan,
      CONVERT(varchar(10), h.TglPenerimaan, 23) AS TglPenerimaan,
      h.IdTim,
      t.NamaTim,
      h.IdSupplier,
      sup.NmSupplier AS NamaSupplier,
      h.NoPlat,
      h.Shift,
      CONVERT(VARCHAR(8), h.HourStart, 108) AS HourStart,
      CONVERT(VARCHAR(8), h.HourEnd, 108) AS HourEnd,
      h.CreateBy,
      h.DateTimeCreate
    FROM dbo.PenerimaanBahanBaku_h h
    LEFT JOIN dbo.MstSupplier sup ON sup.IdSupplier = h.IdSupplier
    LEFT JOIN dbo.MstTimPenerimaanBB t ON t.IdTim = h.IdTim
    WHERE h.NoPenerimaan = @NoPenerimaan
  `);

  const header = headerResult.recordset[0];
  if (!header) return null;

  const outputResult = await request.query(`
    SELECT
      o.NoBahanBaku,
      o.NoPallet,
      o.NoSak,
      p.IdJenisPlastik,
      d.Berat
    FROM dbo.PenerimaanBahanBakuOutput o
    LEFT JOIN dbo.BahanBakuPallet_h p
      ON p.NoBahanBaku = o.NoBahanBaku AND p.NoPallet = o.NoPallet
    LEFT JOIN dbo.BahanBaku_d d
      ON d.NoBahanBaku = o.NoBahanBaku AND d.NoPallet = o.NoPallet AND d.NoSak = o.NoSak
    WHERE o.NoPenerimaan = @NoPenerimaan
    ORDER BY o.NoBahanBaku, o.NoPallet, o.NoSak
  `);

  return { ...header, outputs: outputResult.recordset || [] };
}

async function deletePenerimaanBahanBaku(noPenerimaan, ctx) {
  const pool = await poolPromise;
  const tx = new sql.Transaction(pool);

  try {
    await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    await applyAuditContext(new sql.Request(tx), ctx || {});

    const { docDateOnly } = await loadDocDateOnlyFromConfig({
      entityKey: "penerimaanBahanBaku",
      codeValue: noPenerimaan,
      runner: tx,
      useLock: true,
      throwIfNotFound: false,
    });

    if (!docDateOnly) {
      throw notFound("Data PenerimaanBahanBaku tidak ditemukan");
    }

    await assertNotLocked({
      date: docDateOnly,
      runner: tx,
      action: "delete PenerimaanBahanBaku",
      useLock: true,
    });

    const outputRows = await new sql.Request(tx)
      .input("NoPenerimaan", sql.VarChar(20), String(noPenerimaan))
      .query(`
        SELECT NoBahanBaku, NoPallet, NoSak
        FROM dbo.PenerimaanBahanBakuOutput WITH (UPDLOCK, HOLDLOCK)
        WHERE NoPenerimaan = @NoPenerimaan
      `);

    const usedRows = await new sql.Request(tx)
      .input("NoPenerimaan", sql.VarChar(20), String(noPenerimaan))
      .query(`
        SELECT 1
        FROM dbo.PenerimaanBahanBakuOutput o
        INNER JOIN dbo.BahanBaku_d d
          ON d.NoBahanBaku = o.NoBahanBaku AND d.NoPallet = o.NoPallet AND d.NoSak = o.NoSak
        WHERE o.NoPenerimaan = @NoPenerimaan AND d.DateUsage IS NOT NULL
      `);

    if (usedRows.recordset.length > 0) {
      throw conflict(
        "Tidak bisa menghapus PenerimaanBahanBaku: sebagian label bahan baku sudah terpakai di proses lain",
      );
    }

    const noBahanBaku = outputRows.recordset[0]?.NoBahanBaku || null;

    await new sql.Request(tx)
      .input("NoPenerimaan", sql.VarChar(20), String(noPenerimaan))
      .query(`DELETE FROM dbo.PenerimaanBahanBakuOutput WHERE NoPenerimaan = @NoPenerimaan`);

    if (noBahanBaku) {
      await new sql.Request(tx)
        .input("NoBahanBaku", sql.VarChar(50), noBahanBaku)
        .query(`DELETE FROM dbo.BahanBaku_d WHERE NoBahanBaku = @NoBahanBaku`);

      await new sql.Request(tx)
        .input("NoBahanBaku", sql.VarChar(50), noBahanBaku)
        .query(`DELETE FROM dbo.BahanBakuPallet_h WHERE NoBahanBaku = @NoBahanBaku`);

      await new sql.Request(tx)
        .input("NoBahanBaku", sql.VarChar(50), noBahanBaku)
        .query(`DELETE FROM dbo.BahanBaku_h WHERE NoBahanBaku = @NoBahanBaku`);
    }

    await new sql.Request(tx)
      .input("NoPenerimaan", sql.VarChar(20), String(noPenerimaan))
      .query(`DELETE FROM dbo.PenerimaanBahanBaku_h WHERE NoPenerimaan = @NoPenerimaan`);

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
//  STATUS TIM (untuk grid ala mesin washing)
//  Analog GET /api/mst-mesin/washing: satu baris = satu tim, dengan info
//  NoPenerimaan yang dibuat HARI INI (jika ada). Tim tanpa NoPenerimaan
//  hari ini dianggap "belum aktif" di layar tablet.
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
      CONVERT(VARCHAR(8), today.HourEnd, 108) AS HourEnd
    FROM dbo.MstTimPenerimaanBB t WITH (NOLOCK)
    OUTER APPLY (
      SELECT TOP 1
        h.NoPenerimaan, h.TglPenerimaan, h.Shift, h.HourStart, h.HourEnd
      FROM dbo.PenerimaanBahanBaku_h h WITH (NOLOCK)
      WHERE h.IdTim = t.IdTim
        AND CONVERT(date, h.TglPenerimaan) = CONVERT(date, GETDATE())
      ORDER BY h.DateTimeCreate DESC
    ) today
    ORDER BY t.NamaTim ASC;
  `);

  return result.recordset || [];
}

module.exports = {
  createPenerimaanBahanBaku,
  listPenerimaanBahanBaku,
  getDetailPenerimaanBahanBaku,
  deletePenerimaanBahanBaku,
  getTimStatus,
};
