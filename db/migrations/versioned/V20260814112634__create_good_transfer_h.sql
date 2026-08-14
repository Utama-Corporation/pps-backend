-- ================================================================
-- Migration: Create GoodTransfer_h (header transaksi transfer antar warehouse)
-- ================================================================
-- 1 header = 1 pengiriman batch label dari IdWarehouseAsal ke IdWarehouseTujuan.
-- Status lifecycle: IN_TRANSIT -> RECEIVED | REJECTED | CANCELLED

CREATE TABLE [dbo].[GoodTransfer_h] (
    NoTransfer          VARCHAR(20)   NOT NULL,
    TanggalKirim        DATE          NOT NULL,
    IdWarehouseAsal     INT           NOT NULL,
    IdWarehouseTujuan   INT           NOT NULL,
    IdUsernameKirim     INT           NOT NULL,
    DateTimeKirim       DATETIME      NOT NULL CONSTRAINT DF_GoodTransfer_h_DateTimeKirim DEFAULT (GETDATE()),
    Status               VARCHAR(20)   NOT NULL CONSTRAINT DF_GoodTransfer_h_Status DEFAULT ('IN_TRANSIT'),
    TanggalTerima        DATE          NULL,
    IdUsernameTerima     INT           NULL,
    DateTimeTerima       DATETIME      NULL,
    IdUsernameCancel     INT           NULL,
    DateTimeCancel       DATETIME      NULL,
    Catatan              VARCHAR(500)  NULL,
    AlasanTolak          VARCHAR(500)  NULL,
    CreatedAt            DATETIME      NOT NULL CONSTRAINT DF_GoodTransfer_h_CreatedAt DEFAULT (GETDATE()),
    UpdatedAt            DATETIME      NULL,
    CONSTRAINT PK_GoodTransfer_h PRIMARY KEY CLUSTERED (NoTransfer),
    CONSTRAINT FK_GoodTransfer_h_WhAsal FOREIGN KEY (IdWarehouseAsal) REFERENCES dbo.MstWarehouse(IdWarehouse),
    CONSTRAINT FK_GoodTransfer_h_WhTujuan FOREIGN KEY (IdWarehouseTujuan) REFERENCES dbo.MstWarehouse(IdWarehouse),
    CONSTRAINT CK_GoodTransfer_h_Status CHECK (Status IN ('IN_TRANSIT','RECEIVED','REJECTED','CANCELLED')),
    CONSTRAINT CK_GoodTransfer_h_WhBeda CHECK (IdWarehouseAsal <> IdWarehouseTujuan)
);
GO

CREATE INDEX IX_GoodTransfer_h_WhAsal_Status ON dbo.GoodTransfer_h (IdWarehouseAsal, Status);
CREATE INDEX IX_GoodTransfer_h_WhTujuan_Status ON dbo.GoodTransfer_h (IdWarehouseTujuan, Status);
GO
