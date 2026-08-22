-- ================================================================
-- Migration: Create MstTimPenerimaan (GLOBAL)
-- Master tim penerimaan generik — beda dengan MstTimPenerimaanBB yang
-- khusus bahan baku, tabel ini dimaksudkan dipakai bersama oleh banyak
-- modul penerimaan (mis. Penerimaan Bahan Pendukung, dan modul penerimaan
-- lain di masa depan), bukan cuma satu modul.
-- ================================================================
CREATE TABLE [dbo].[MstTimPenerimaan] (
    [IdTim]       INT IDENTITY(1,1) NOT NULL,
    [NamaTim]     VARCHAR(100) NOT NULL,
    [KepalaTim]   INT NULL,
    [Keterangan]  VARCHAR(255) NULL,
    [Aktif]       BIT NOT NULL CONSTRAINT [DF_MstTimPenerimaan_Aktif] DEFAULT (1),

    CONSTRAINT [PK_MstTimPenerimaan] PRIMARY KEY CLUSTERED ([IdTim] ASC),
    CONSTRAINT [FK_MstTimPenerimaan_MstOperator]
        FOREIGN KEY ([KepalaTim]) REFERENCES [dbo].[MstOperator] ([IdOperator])
);
GO
