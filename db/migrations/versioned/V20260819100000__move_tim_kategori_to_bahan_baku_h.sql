-- ================================================================
-- Migration: Pindahkan IdTim & KodeKategori dari PenerimaanBahanBaku_h
-- ke BahanBaku_h, lalu drop IdTim/IdSupplier/NoPlat dari
-- PenerimaanBahanBaku_h.
--
-- Alasan: header transaksi (PenerimaanBahanBaku_h) semestinya hanya
-- menyimpan atribut dokumen (NoPenerimaan, TglPenerimaan, Shift,
-- HourStart, HourEnd, CreateBy, DateTimeCreate) — bukan atribut ISI
-- (siapa tim-nya, dari supplier mana, plat berapa, kategori apa).
-- Atribut ISI itu sudah 1:1 dengan NoBahanBaku (satu panggilan create()
-- = satu NoPenerimaan = satu NoBahanBaku, lihat
-- penerimaan-bahan-baku-service.js#createPenerimaanBahanBaku), jadi
-- tempatnya di BahanBaku_h — persis seperti Washing_h yang menyimpan
-- IdJenisPlastik/IdWarehouse (atribut isi), bukan di WashingProduksi_h.
--
-- IdSupplier & NoPlat SUDAH ada di BahanBaku_h sejak awal (INSERT di
-- createPenerimaanBahanBaku selalu mengisi keduanya di BahanBaku_h juga)
-- — jadi kolom itu di PenerimaanBahanBaku_h murni duplikat & tinggal
-- di-drop, tidak perlu backfill. Yang perlu backfill hanya IdTim &
-- KodeKategori (kategori diturunkan dari prefix NoBahanBaku vs
-- dbo.MstKategori.PrefixLabel, prefix terpanjang yang cocok).
-- ================================================================

-- 1) Tambah kolom baru di BahanBaku_h (nullable dulu untuk backfill)
IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.BahanBaku_h') AND name = 'IdTim'
)
    ALTER TABLE dbo.BahanBaku_h ADD IdTim int NULL;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.BahanBaku_h') AND name = 'KodeKategori'
)
    ALTER TABLE dbo.BahanBaku_h ADD KodeKategori varchar(50) NULL;
GO

-- 2) Backfill IdTim dari PenerimaanBahanBaku_h (via link PenerimaanBahanBakuOutput)
UPDATE bb
    SET bb.IdTim = h.IdTim
FROM dbo.BahanBaku_h bb
INNER JOIN (
    SELECT DISTINCT o.NoBahanBaku, o.NoPenerimaan
    FROM dbo.PenerimaanBahanBakuOutput o
) link ON link.NoBahanBaku = bb.NoBahanBaku
INNER JOIN dbo.PenerimaanBahanBaku_h h ON h.NoPenerimaan = link.NoPenerimaan
WHERE bb.IdTim IS NULL;
GO

-- 3) Backfill KodeKategori dari prefix NoBahanBaku vs MstKategori.PrefixLabel
--    (prefix terpanjang yang cocok, supaya "AB." tidak salah ke-match "A.")
UPDATE bb
    SET bb.KodeKategori = mk.KodeKategori
FROM dbo.BahanBaku_h bb
CROSS APPLY (
    SELECT TOP 1 k.KodeKategori
    FROM dbo.MstKategori k
    WHERE bb.NoBahanBaku LIKE k.PrefixLabel + '%'
      AND ISNULL(k.Enable, 1) = 1
    ORDER BY LEN(k.PrefixLabel) DESC
) mk
WHERE bb.KodeKategori IS NULL;
GO

-- 4) FK IdTim -> MstTimPenerimaanBB di BahanBaku_h
IF NOT EXISTS (
    SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_BahanBaku_h_MstTimPenerimaanBB'
)
    ALTER TABLE dbo.BahanBaku_h
        ADD CONSTRAINT FK_BahanBaku_h_MstTimPenerimaanBB
        FOREIGN KEY (IdTim) REFERENCES dbo.MstTimPenerimaanBB (IdTim);
GO

-- 5) Drop FK & kolom IdTim/IdSupplier/NoPlat dari PenerimaanBahanBaku_h
IF EXISTS (
    SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_PenerimaanBahanBaku_h_MstTimPenerimaanBB'
)
    ALTER TABLE dbo.PenerimaanBahanBaku_h DROP CONSTRAINT FK_PenerimaanBahanBaku_h_MstTimPenerimaanBB;
GO

IF EXISTS (
    SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_PenerimaanBahanBaku_h_MstSupplier'
)
    ALTER TABLE dbo.PenerimaanBahanBaku_h DROP CONSTRAINT FK_PenerimaanBahanBaku_h_MstSupplier;
GO

IF EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.PenerimaanBahanBaku_h') AND name = 'IdTim'
)
    ALTER TABLE dbo.PenerimaanBahanBaku_h DROP COLUMN IdTim;
GO

IF EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.PenerimaanBahanBaku_h') AND name = 'IdSupplier'
)
    ALTER TABLE dbo.PenerimaanBahanBaku_h DROP COLUMN IdSupplier;
GO

IF EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.PenerimaanBahanBaku_h') AND name = 'NoPlat'
)
    ALTER TABLE dbo.PenerimaanBahanBaku_h DROP COLUMN NoPlat;
GO
