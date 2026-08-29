-- ================================================================
-- Migration: Document dbo.GoodsTransferItem_d (Ascend-owned demand lines)
-- ================================================================
-- Sejak Goods Transfer beralih ke model "digenerate ERP Ascend":
--   * dbo.GoodsTransfer_h        -> di-INSERT langsung oleh Ascend ke DB PPS.
--   * dbo.GoodsTransferItem_d    -> baris permintaan / "turnover" per item:
--                                  berapa pcs jenis apa yang harus dipindah.
-- PPS memperlakukan KEDUANYA sebagai READ-ONLY. PPS tidak pernah
-- INSERT/UPDATE/DELETE tabel ini (termasuk GoodsTransfer_h.Status).
--
-- GoodsTransferItem_d dibuat out-of-band (lihat
-- V20260827120000__rename_good_transfer_to_goods_transfer.sql). Skema NYATA
-- di DB produksi (diverifikasi via INFORMATION_SCHEMA):
--
--   NoTransfer          VARCHAR(13)  NOT NULL   -- FK logis -> GoodsTransfer_h
--   KodeKategori        VARCHAR(20)  NOT NULL   -- 'barangjadi' | 'furniturewip'
--   IdJenis            INT          NOT NULL   -- = MstBarangJadi.IdBJ / MstCabinetWIP.IdCabinetWIP
--   Pcs                INT          NOT NULL   -- jumlah diminta
--   GeneratedLabelCode VARCHAR(50)  NULL
--   CreateBy           VARCHAR(50)  NULL
--   DateTimeCreate     DATETIME2    NOT NULL   DEFAULT (SYSUTCDATETIME())
--   PK komposit: (NoTransfer, KodeKategori, IdJenis) -- TIDAK ada surrogate key
--
-- Kode PPS mencocokkan baris permintaan lewat triple PK tsb (pola sama dengan
-- dbo.BJJualItem_d di modul Penjualan).
--
-- Migration ini HANYA menyediakan fallback CREATE untuk DB dev yang belum
-- punya feed Ascend. Kalau tabel sudah ada -> no-op (JANGAN ALTER).
-- ================================================================

IF OBJECT_ID('[dbo].[GoodsTransferItem_d]', 'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[GoodsTransferItem_d] (
        [NoTransfer]         VARCHAR(13)  NOT NULL,
        [KodeKategori]       VARCHAR(20)  NOT NULL,
        [IdJenis]            INT          NOT NULL,
        [Pcs]                INT          NOT NULL,
        [GeneratedLabelCode] VARCHAR(50)  NULL,
        [CreateBy]           VARCHAR(50)  NULL,
        [DateTimeCreate]     DATETIME2    NOT NULL
            CONSTRAINT [DF_GoodsTransferItem_d_DateTimeCreate] DEFAULT (SYSUTCDATETIME()),

        CONSTRAINT [PK_GoodsTransferItem_d]
            PRIMARY KEY CLUSTERED ([NoTransfer] ASC, [KodeKategori] ASC, [IdJenis] ASC),
        CONSTRAINT [CK_GoodsTransferItem_d_KodeKategori]
            CHECK ([KodeKategori] IN ('barangjadi', 'furniturewip')),
        CONSTRAINT [CK_GoodsTransferItem_d_Pcs_Positive]
            CHECK ([Pcs] > 0)
    );
END
GO
