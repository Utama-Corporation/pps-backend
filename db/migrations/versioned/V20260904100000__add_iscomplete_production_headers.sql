-- Tambah kolom IsComplete ke 4 header produksi yang belum punya,
-- supaya seragam dengan BrokerProduksi_h / WashingProduksi_h /
-- MixerProduksi_h / CrusherProduksi_h / GilinganProduksi_h / InjectProduksi_h.
--
-- Dipakai oleh:
--   * endpoint PATCH /api/production/<modul>/:no/complete
--   * master-mesin-service (deteksi mesin "pending" bila produksi belum complete)

SET XACT_ABORT ON;
BEGIN TRAN;

IF COL_LENGTH('dbo.HotStamping_h', 'IsComplete') IS NULL
    ALTER TABLE dbo.HotStamping_h
        ADD IsComplete bit NOT NULL
        CONSTRAINT DF_HotStamping_h_IsComplete DEFAULT ((0));

IF COL_LENGTH('dbo.Spanner_h', 'IsComplete') IS NULL
    ALTER TABLE dbo.Spanner_h
        ADD IsComplete bit NOT NULL
        CONSTRAINT DF_Spanner_h_IsComplete DEFAULT ((0));

IF COL_LENGTH('dbo.PasangKunci_h', 'IsComplete') IS NULL
    ALTER TABLE dbo.PasangKunci_h
        ADD IsComplete bit NOT NULL
        CONSTRAINT DF_PasangKunci_h_IsComplete DEFAULT ((0));

IF COL_LENGTH('dbo.PackingProduksi_h', 'IsComplete') IS NULL
    ALTER TABLE dbo.PackingProduksi_h
        ADD IsComplete bit NOT NULL
        CONSTRAINT DF_PackingProduksi_h_IsComplete DEFAULT ((0));

COMMIT;
