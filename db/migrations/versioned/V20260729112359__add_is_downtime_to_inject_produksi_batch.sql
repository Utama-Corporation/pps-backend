ALTER TABLE dbo.InjectProduksiBatch ADD
    IsDowntime bit NOT NULL CONSTRAINT DF_InjectProduksiBatch_IsDowntime DEFAULT (0);
GO
