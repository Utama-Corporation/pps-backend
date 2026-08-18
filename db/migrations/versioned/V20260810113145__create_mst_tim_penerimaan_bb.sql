-- ================================================================
-- Migration: Create MstTimPenerimaanBB
-- Master tim penerimaan bahan baku, dipakai saat pembuatan label bahan-baku.
-- ================================================================
CREATE TABLE [dbo].[MstTimPenerimaanBB] (
    [IdTim]       INT IDENTITY(1,1) NOT NULL,
    [NamaTim]     VARCHAR(100) NOT NULL,
    [KepalaTim]   INT NULL,
    [Keterangan]  VARCHAR(255) NULL,
    [Aktif]       BIT NOT NULL CONSTRAINT [DF_MstTimPenerimaanBB_Aktif] DEFAULT (1),

    CONSTRAINT [PK_MstTimPenerimaanBB] PRIMARY KEY CLUSTERED ([IdTim] ASC),
    CONSTRAINT [FK_MstTimPenerimaanBB_MstOperator]
        FOREIGN KEY ([KepalaTim]) REFERENCES [dbo].[MstOperator] ([IdOperator])
);
GO
