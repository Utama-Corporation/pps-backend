-- ================================================================
-- Migration: Create BahanPendukung
-- ================================================================
-- Entitas barang bahan pendukung yang diterima — meniru struktur label
-- dbo.FurnitureWIP (nomor sequence, print counter, status pemakaian, dst),
-- DIGABUNG dengan atribut isi barang (Supplier, Nama Barang, Qty, Satuan,
-- Keterangan) yang sebelumnya ada di PenerimaanBahanPendukung_d.
--
-- PenerimaanBahanPendukung_d sekarang HANYA jadi pengikat tipis antara
-- header penerimaan dan baris di tabel ini (lihat migration
-- V20260821160847__simplify_penerimaan_bahan_pendukung_d.sql) — analog
-- PenerimaanBahanBakuOutput yang mengikat PenerimaanBahanBaku_h ke
-- BahanBaku_h, TANPA tabel junction terpisah lagi (dihapus dari revisi
-- sebelumnya) karena satu baris _d = 1 baris BahanPendukung (1:1), tidak
-- perlu tabel mapping many-to-many.
--
-- FK item (IdCabinetMaterial) memakai master yang sudah ada,
-- dbo.MstCabinetMaterial (legacy pre-Flyway).
--
-- Kolom IdWarna/Blok/IdLokasi dipertahankan untuk paritas struktur
-- dengan FurnitureWIP meski belum tentu relevan untuk semua barang
-- bahan pendukung — nullable, boleh kosong. TIDAK ada IdWarehouse — modul
-- ini tidak melacak lokasi gudang sama sekali (beda dengan FurnitureWIP).
-- ================================================================
CREATE TABLE [dbo].[BahanPendukung] (
    [NoBahanPendukung]   VARCHAR(50)   NOT NULL,
    [DateCreate]         DATE          NOT NULL,
    [Jam]                VARCHAR(20)   NULL,
    [IdSupplier]         INT           NOT NULL,
    [IdCabinetMaterial]  INT           NOT NULL,
    [NamaBarang]         NVARCHAR(200) NOT NULL,
    [Pcs]                DECIMAL(18,3) NOT NULL,
    [Satuan]             VARCHAR(20)   NOT NULL CONSTRAINT [DF_BahanPendukung_Satuan] DEFAULT ('PCS'),
    [Keterangan]         NVARCHAR(200) NULL,
    [Berat]              DECIMAL(18,3) NULL,
    [IsPartial]          BIT           NOT NULL CONSTRAINT [DF_BahanPendukung_IsPartial] DEFAULT (0),
    [DateUsage]          DATETIME      NULL,
    [IdWarna]            INT           NULL,
    [CreateBy]           VARCHAR(100)  NULL,
    [DateTimeCreate]     DATETIME      NOT NULL CONSTRAINT [DF_BahanPendukung_DateTimeCreate] DEFAULT (GETDATE()),
    [Blok]               VARCHAR(50)   NULL,
    [IdLokasi]           INT           NULL,
    [HasBeenPrinted]     INT           NOT NULL CONSTRAINT [DF_BahanPendukung_HasBeenPrinted] DEFAULT (0),

    CONSTRAINT [PK_BahanPendukung] PRIMARY KEY CLUSTERED ([NoBahanPendukung] ASC),
    CONSTRAINT [FK_BahanPendukung_MstSupplier]
        FOREIGN KEY ([IdSupplier]) REFERENCES [dbo].[MstSupplier] ([IdSupplier]),
    CONSTRAINT [FK_BahanPendukung_MstCabinetMaterial]
        FOREIGN KEY ([IdCabinetMaterial]) REFERENCES [dbo].[MstCabinetMaterial] ([IdCabinetMaterial])
);
GO
