-- Retur v3: header + item + turnover (scan tukar barang) + output label mapping tables.
-- Lihat AGENTS.md / task spec fitur "Retur v3" untuk alur bisnis lengkap.
--
-- Catatan: NoBJ/NoFurnitureWIP/NoReject di tabel legacy adalah VARCHAR(13)
-- (prefix 3 char + 10 digit kode urut, mis. 'BA.0000000001'), bukan VARCHAR(50)
-- seperti asumsi awal — kolom FK di bawah disesuaikan supaya length/scale-nya sama persis.
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

IF OBJECT_ID('[dbo].[BJReturV3OutputLabelBarangJadi]', 'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[BJReturV3OutputLabelBarangJadi] (
        [NoRetur] VARCHAR(50) NOT NULL,
        [NoBJ]    VARCHAR(13) NOT NULL,
        [IdItem]  INT         NOT NULL,

        CONSTRAINT [PK_BJReturV3OutputLabelBarangJadi] PRIMARY KEY CLUSTERED ([NoRetur] ASC, [NoBJ] ASC),
        CONSTRAINT [FK_BJReturV3OutputLabelBarangJadi_BJReturV3_h]
            FOREIGN KEY ([NoRetur]) REFERENCES [dbo].[BJReturV3_h] ([NoRetur]),
        CONSTRAINT [FK_BJReturV3OutputLabelBarangJadi_BarangJadi]
            FOREIGN KEY ([NoBJ]) REFERENCES [dbo].[BarangJadi] ([NoBJ]),
        CONSTRAINT [FK_BJReturV3OutputLabelBarangJadi_BJReturV3Item_d]
            FOREIGN KEY ([IdItem]) REFERENCES [dbo].[BJReturV3Item_d] ([IdItem])
    );
END
GO

IF OBJECT_ID('[dbo].[BJReturV3OutputLabelFurnitureWIP]', 'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[BJReturV3OutputLabelFurnitureWIP] (
        [NoRetur]        VARCHAR(50) NOT NULL,
        [NoFurnitureWIP] VARCHAR(13) NOT NULL,
        [IdItem]         INT         NOT NULL,

        CONSTRAINT [PK_BJReturV3OutputLabelFurnitureWIP] PRIMARY KEY CLUSTERED ([NoRetur] ASC, [NoFurnitureWIP] ASC),
        CONSTRAINT [FK_BJReturV3OutputLabelFurnitureWIP_BJReturV3_h]
            FOREIGN KEY ([NoRetur]) REFERENCES [dbo].[BJReturV3_h] ([NoRetur]),
        CONSTRAINT [FK_BJReturV3OutputLabelFurnitureWIP_FurnitureWIP]
            FOREIGN KEY ([NoFurnitureWIP]) REFERENCES [dbo].[FurnitureWIP] ([NoFurnitureWIP]),
        CONSTRAINT [FK_BJReturV3OutputLabelFurnitureWIP_BJReturV3Item_d]
            FOREIGN KEY ([IdItem]) REFERENCES [dbo].[BJReturV3Item_d] ([IdItem])
    );
END
GO

IF OBJECT_ID('[dbo].[BJReturV3OutputLabelReject]', 'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[BJReturV3OutputLabelReject] (
        [NoRetur]  VARCHAR(50) NOT NULL,
        [NoReject] VARCHAR(13) NOT NULL,
        [IdItem]   INT         NOT NULL,

        CONSTRAINT [PK_BJReturV3OutputLabelReject] PRIMARY KEY CLUSTERED ([NoRetur] ASC, [NoReject] ASC),
        CONSTRAINT [FK_BJReturV3OutputLabelReject_BJReturV3_h]
            FOREIGN KEY ([NoRetur]) REFERENCES [dbo].[BJReturV3_h] ([NoRetur]),
        CONSTRAINT [FK_BJReturV3OutputLabelReject_RejectV2]
            FOREIGN KEY ([NoReject]) REFERENCES [dbo].[RejectV2] ([NoReject]),
        CONSTRAINT [FK_BJReturV3OutputLabelReject_BJReturV3Item_d]
            FOREIGN KEY ([IdItem]) REFERENCES [dbo].[BJReturV3Item_d] ([IdItem])
    );
END
GO
