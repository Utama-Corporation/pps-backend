-- Retur v3: header + item + turnover (scan tukar barang).
-- Lihat AGENTS.md / task spec fitur "Retur v3" untuk alur bisnis lengkap.
--
-- Label yang digenerate (BarangJadi/FurnitureWIP/RejectV2) DILACAK LEWAT
-- BJReturV3Item_d.GeneratedLabelCode saja — sengaja tidak ada tabel mapping
-- output terpisah (lihat V<lebih baru>__drop_bjreturv3_output_label_tables.sql
-- untuk alasan & cara query-nya kalau tabel itu sempat kebuat di percobaan
-- sebelumnya).
-- Setiap CREATE TABLE dibungkus IF OBJECT_ID(...) IS NULL supaya script ini aman
-- dijalankan ulang meski sebagian tabel sudah sempat dibuat di percobaan sebelumnya.

IF OBJECT_ID('[dbo].[BJReturV3_h]', 'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[BJReturV3_h] (
        [NoRetur]             VARCHAR(50)   NOT NULL,
        [Tanggal]             DATE          NOT NULL,
        [IdPembeli]           INT           NOT NULL,
        [Keterangan]          NVARCHAR(500) NULL,
        [StatusRetur]         VARCHAR(20)   NOT NULL
            CONSTRAINT [DF_BJReturV3_h_StatusRetur] DEFAULT ('PENDING'),
        [DecisionBy]          INT           NULL,
        [DecisionByUsername]  VARCHAR(100)  NULL,
        [DecisionAt]          DATETIME2     NULL,
        [FlagKirim]           BIT           NOT NULL
            CONSTRAINT [DF_BJReturV3_h_FlagKirim] DEFAULT (0),
        [FlagKirimBy]         INT           NULL,
        [FlagKirimByUsername] VARCHAR(100)  NULL,
        [FlagKirimAt]         DATETIME2     NULL,
        [CreateBy]            VARCHAR(50)   NULL,
        [DateTimeCreate]      DATETIME2     NOT NULL
            CONSTRAINT [DF_BJReturV3_h_DateTimeCreate] DEFAULT (SYSUTCDATETIME()),

        CONSTRAINT [PK_BJReturV3_h] PRIMARY KEY CLUSTERED ([NoRetur] ASC),
        CONSTRAINT [FK_BJReturV3_h_MstPembeli]
            FOREIGN KEY ([IdPembeli]) REFERENCES [dbo].[MstPembeli] ([IdPembeli]),
        CONSTRAINT [CK_BJReturV3_h_StatusRetur]
            CHECK ([StatusRetur] IN ('PENDING', 'DIGANTI', 'TIDAK_DIGANTI'))
    );
END
GO

IF OBJECT_ID('[dbo].[BJReturV3Item_d]', 'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[BJReturV3Item_d] (
        [IdItem]            INT IDENTITY(1,1) NOT NULL,
        [NoRetur]           VARCHAR(50)   NOT NULL,
        [KodeKategori]      VARCHAR(20)   NOT NULL,
        [IdJenis]           INT           NOT NULL,
        [Pcs]               INT           NOT NULL,
        [KategoriInput]     VARCHAR(10)   NOT NULL,
        [Berat]             DECIMAL(18,3) NULL,
        [IdReject]          INT           NULL,
        [GeneratedLabelCode] VARCHAR(50)  NULL,
        [CreateBy]          VARCHAR(50)   NULL,
        [DateTimeCreate]    DATETIME2     NOT NULL
            CONSTRAINT [DF_BJReturV3Item_d_DateTimeCreate] DEFAULT (SYSUTCDATETIME()),

        CONSTRAINT [PK_BJReturV3Item_d] PRIMARY KEY CLUSTERED ([IdItem] ASC),
        CONSTRAINT [FK_BJReturV3Item_d_BJReturV3_h]
            FOREIGN KEY ([NoRetur]) REFERENCES [dbo].[BJReturV3_h] ([NoRetur]),
        CONSTRAINT [FK_BJReturV3Item_d_MstReject]
            FOREIGN KEY ([IdReject]) REFERENCES [dbo].[MstReject] ([IdReject]),
        CONSTRAINT [CK_BJReturV3Item_d_KodeKategori]
            CHECK ([KodeKategori] IN ('barangjadi', 'furniturewip')),
        CONSTRAINT [CK_BJReturV3Item_d_KategoriInput]
            CHECK ([KategoriInput] IN ('BAGUS', 'REJECT')),
        CONSTRAINT [CK_BJReturV3Item_d_Pcs_Positive]
            CHECK ([Pcs] > 0)
    );
END
GO

IF OBJECT_ID('[dbo].[BJReturV3Turnover_d]', 'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[BJReturV3Turnover_d] (
        [IdTurnover]      INT IDENTITY(1,1) NOT NULL,
        [NoRetur]         VARCHAR(50)   NOT NULL,
        [IdItem]          INT           NOT NULL,
        [LabelCode]       VARCHAR(50)   NOT NULL,
        [Pcs]             INT           NOT NULL,
        [ScanBy]          VARCHAR(50)   NULL,
        [DateTimeScan]    DATETIME2     NOT NULL
            CONSTRAINT [DF_BJReturV3Turnover_d_DateTimeScan] DEFAULT (SYSUTCDATETIME()),

        CONSTRAINT [PK_BJReturV3Turnover_d] PRIMARY KEY CLUSTERED ([IdTurnover] ASC),
        CONSTRAINT [FK_BJReturV3Turnover_d_BJReturV3_h]
            FOREIGN KEY ([NoRetur]) REFERENCES [dbo].[BJReturV3_h] ([NoRetur]),
        CONSTRAINT [FK_BJReturV3Turnover_d_BJReturV3Item_d]
            FOREIGN KEY ([IdItem]) REFERENCES [dbo].[BJReturV3Item_d] ([IdItem]),
        CONSTRAINT [CK_BJReturV3Turnover_d_Pcs_Positive]
            CHECK ([Pcs] > 0)
    );
END
GO

