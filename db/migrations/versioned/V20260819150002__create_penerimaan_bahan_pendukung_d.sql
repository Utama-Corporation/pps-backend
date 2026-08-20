-- ================================================================
-- Migration: Create PenerimaanBahanPendukung_d
-- Detail barang (= "label") Penerimaan Bahan Pendukung — dibuat sederhana
-- (Nama Barang + Qty + Satuan), TIDAK pakai struktur pallet/sak seperti
-- bahan baku, karena barang pendukung (baut/pipa/plat/dll) dihitung PCS,
-- bukan ditimbang per sak. Supplier & Keterangan per baris (bisa beda-beda
-- supplier dalam satu NoPenerimaan yang sama), mengikuti pola bahan baku
-- yang menaruh atribut isi di level detail, bukan header.
-- Satu kategori saja — tidak ada split Pakai/Proses seperti bahan baku.
-- ================================================================
CREATE TABLE [dbo].[PenerimaanBahanPendukung_d] (
    [NoPenerimaan]    VARCHAR(20)   NOT NULL,
    [NoUrut]          INT           NOT NULL,
    [IdSupplier]      INT           NOT NULL,
    [NamaBarang]      NVARCHAR(200) NOT NULL,
    [Qty]             DECIMAL(18,3) NOT NULL,
    [Satuan]          VARCHAR(20)   NOT NULL CONSTRAINT [DF_PenerimaanBahanPendukung_d_Satuan] DEFAULT ('PCS'),
    [Keterangan]      NVARCHAR(200) NULL,
    [CreateBy]        VARCHAR(100)  NULL,
    [DateTimeCreate]  DATETIME      NOT NULL CONSTRAINT [DF_PenerimaanBahanPendukung_d_DateTimeCreate] DEFAULT (GETDATE()),

    CONSTRAINT [PK_PenerimaanBahanPendukung_d] PRIMARY KEY CLUSTERED ([NoPenerimaan] ASC, [NoUrut] ASC),
    CONSTRAINT [FK_PenerimaanBahanPendukung_d_PenerimaanBahanPendukung_h]
        FOREIGN KEY ([NoPenerimaan]) REFERENCES [dbo].[PenerimaanBahanPendukung_h] ([NoPenerimaan]),
    CONSTRAINT [FK_PenerimaanBahanPendukung_d_MstSupplier]
        FOREIGN KEY ([IdSupplier]) REFERENCES [dbo].[MstSupplier] ([IdSupplier])
);
GO
