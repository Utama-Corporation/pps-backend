-- ================================================================
-- Migration: Create GoodTransferItem (tracking per-label status transfer)
-- ================================================================
-- Source-of-truth untuk lock label selama proses transfer berlangsung.
-- Tabel label asli (BahanBakuPallet_h, Washing_h, dst) baru diupdate
-- IdWarehouse/Blok/IdLokasi-nya saat item ini di-accept (StatusItem='RECEIVED').

CREATE TABLE [dbo].[GoodTransferItem] (
    IdTransferItem   INT IDENTITY(1,1) NOT NULL,
    NoTransfer       VARCHAR(20)  NOT NULL,
    LabelCode        VARCHAR(50)  NOT NULL,
    PrefixKategori   VARCHAR(10)  NOT NULL,
    BlokAsal         VARCHAR(50)  NULL,
    IdLokasiAsal     INT          NULL,
    BlokTujuan       VARCHAR(50)  NULL,
    IdLokasiTujuan   INT          NULL,
    StatusItem       VARCHAR(20)  NOT NULL CONSTRAINT DF_GoodTransferItem_StatusItem DEFAULT ('IN_TRANSIT'),
    CreatedAt        DATETIME     NOT NULL CONSTRAINT DF_GoodTransferItem_CreatedAt DEFAULT (GETDATE()),
    UpdatedAt        DATETIME     NULL,
    CONSTRAINT PK_GoodTransferItem PRIMARY KEY CLUSTERED (IdTransferItem),
    CONSTRAINT FK_GoodTransferItem_Header FOREIGN KEY (NoTransfer) REFERENCES dbo.GoodTransfer_h(NoTransfer),
    CONSTRAINT CK_GoodTransferItem_Status CHECK (StatusItem IN ('IN_TRANSIT','RECEIVED','REJECTED','CANCELLED'))
);
GO

CREATE INDEX IX_GoodTransferItem_LabelCode ON dbo.GoodTransferItem (LabelCode);
CREATE INDEX IX_GoodTransferItem_NoTransfer ON dbo.GoodTransferItem (NoTransfer);
GO

-- Mekanisme lock inti: 1 label hanya boleh punya 1 baris IN_TRANSIT aktif sekaligus.
CREATE UNIQUE INDEX UX_GoodTransferItem_LabelCode_Active
    ON dbo.GoodTransferItem (LabelCode)
    WHERE StatusItem = 'IN_TRANSIT';
GO
