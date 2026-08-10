-- ================================================================
-- Migration: Create PenerimaanBahanBaku_h
-- Header transaksi penerimaan bahan baku. Setiap penerimaan langsung
-- menghasilkan label bahan baku baru (BahanBaku_h/Pallet_h/_d), linknya
-- ada di PenerimaanBahanBakuOutput.
-- ================================================================
CREATE TABLE [dbo].[PenerimaanBahanBaku_h] (
    [NoPenerimaan]    VARCHAR(20)   NOT NULL,
    [TglPenerimaan]   DATE          NOT NULL,
    [IdTim]           INT           NOT NULL,
    [IdSupplier]      INT           NOT NULL,
    [NoPlat]          VARCHAR(20)   NULL,
    [CreateBy]        VARCHAR(100)  NULL,
    [DateTimeCreate]  DATETIME      NOT NULL CONSTRAINT [DF_PenerimaanBahanBaku_h_DateTimeCreate] DEFAULT (GETDATE()),

    CONSTRAINT [PK_PenerimaanBahanBaku_h] PRIMARY KEY CLUSTERED ([NoPenerimaan] ASC),
    CONSTRAINT [FK_PenerimaanBahanBaku_h_MstTimPenerimaanBB]
        FOREIGN KEY ([IdTim]) REFERENCES [dbo].[MstTimPenerimaanBB] ([IdTim]),
    CONSTRAINT [FK_PenerimaanBahanBaku_h_MstSupplier]
        FOREIGN KEY ([IdSupplier]) REFERENCES [dbo].[MstSupplier] ([IdSupplier])
);
GO
