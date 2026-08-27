-- ================================================================
-- Migration: Create PenerimaanBarangDagang_h
-- Header dokumen Penerimaan Barang Dagang — mirror struktur FINAL
-- PenerimaanBahanPendukung_h (sudah termasuk IsComplete + TglComplete,
-- tanpa Shift/Hour/DateTimeCreate legacy). Satu dokumen = satu tim,
-- satu tanggal, bisa diisi barang berkali-kali (fase 2).
-- ================================================================
CREATE TABLE [dbo].[PenerimaanBarangDagang_h] (
    [NoPenerimaan]  VARCHAR(20)   NOT NULL,
    [TglPenerimaan] DATE          NOT NULL,
    [IdTim]         INT           NOT NULL,
    [CreateBy]      VARCHAR(100)  NULL,
    [IsComplete]    BIT           NOT NULL CONSTRAINT [DF_PenerimaanBarangDagang_h_IsComplete] DEFAULT (0),
    [TglComplete]   DATETIME      NULL,

    CONSTRAINT [PK_PenerimaanBarangDagang_h] PRIMARY KEY CLUSTERED ([NoPenerimaan] ASC),
    CONSTRAINT [FK_PenerimaanBarangDagang_h_MstTimPenerimaan]
        FOREIGN KEY ([IdTim]) REFERENCES [dbo].[MstTimPenerimaan] ([IdTim])
);
GO
