-- ================================================================
-- Migration: Create PenerimaanBahanPendukung_h
-- Header dokumen Penerimaan Bahan Pendukung — mengikuti pola
-- PenerimaanBahanBaku_h: HANYA atribut dokumen (siapa yang menerima, kapan)
-- yang diketahui di fase 1 (dialog header). Atribut isi tiap barang
-- (Supplier, Nama Barang, Qty) ada di PenerimaanBahanPendukung_d (fase 2),
-- karena bisa beda-beda per barang dalam satu dokumen yang sama.
-- ================================================================
CREATE TABLE [dbo].[PenerimaanBahanPendukung_h] (
    [NoPenerimaan]    VARCHAR(20)   NOT NULL,
    [TglPenerimaan]   DATE          NOT NULL,
    [IdTim]           INT           NOT NULL,
    [IdRegu]          INT           NULL,
    [Shift]           INT           NOT NULL,
    [HourStart]       TIME(7)       NULL,
    [HourEnd]         TIME(7)       NULL,
    [CreateBy]        VARCHAR(100)  NULL,
    [DateTimeCreate]  DATETIME      NOT NULL CONSTRAINT [DF_PenerimaanBahanPendukung_h_DateTimeCreate] DEFAULT (GETDATE()),

    CONSTRAINT [PK_PenerimaanBahanPendukung_h] PRIMARY KEY CLUSTERED ([NoPenerimaan] ASC),
    CONSTRAINT [FK_PenerimaanBahanPendukung_h_MstTimPenerimaan]
        FOREIGN KEY ([IdTim]) REFERENCES [dbo].[MstTimPenerimaan] ([IdTim]),
    CONSTRAINT [FK_PenerimaanBahanPendukung_h_MstRegu]
        FOREIGN KEY ([IdRegu]) REFERENCES [dbo].[MstRegu] ([IdRegu])
);
GO
