ALTER TABLE dbo.InjectProduksi_QC ADD
    Keterangan nvarchar(500) NULL,
    IsDowntime bit NOT NULL CONSTRAINT DF_InjectProduksi_QC_IsDowntime DEFAULT (0);
GO
