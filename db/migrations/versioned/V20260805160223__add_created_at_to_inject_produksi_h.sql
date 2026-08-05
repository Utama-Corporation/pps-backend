ALTER TABLE dbo.InjectProduksi_h ADD
    CreatedAt DATETIME NOT NULL CONSTRAINT DF_InjectProduksi_h_CreatedAt DEFAULT (GETDATE());
GO
