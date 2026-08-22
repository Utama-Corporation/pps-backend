SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

/* ===== [dbo].[tr_Audit_PenerimaanBahanBakuOutput]
         ON [dbo].[PenerimaanBahanBakuOutput] ===== */
-- =============================================
-- TRIGGER: tr_Audit_PenerimaanBahanBakuOutput
-- PK     : NoPenerimaan + NoBahanBaku + NoPallet
-- MODE   : AGGREGATED
-- EXTRA  : Join BahanBaku_d untuk ambil Berat
-- =============================================
CREATE OR ALTER TRIGGER [dbo].[tr_Audit_PenerimaanBahanBakuOutput]
ON [dbo].[PenerimaanBahanBakuOutput]
AFTER INSERT, DELETE
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @actor NVARCHAR(128) =
        COALESCE(
            CONVERT(NVARCHAR(128), TRY_CONVERT(INT, SESSION_CONTEXT(N'actor_id'))),
            CAST(SESSION_CONTEXT(N'actor') AS NVARCHAR(128)),
            SUSER_SNAME()
        );

    DECLARE @rid NVARCHAR(64) =
        CAST(SESSION_CONTEXT(N'request_id') AS NVARCHAR(64));

    /* =========================================================
       PRODUCE (INSERT ONLY, AGGREGATED)
       ========================================================= */
    IF EXISTS (SELECT 1 FROM inserted)
       AND NOT EXISTS (SELECT 1 FROM deleted)
    BEGIN
        INSERT dbo.AuditTrail
            (Action, TableName, Actor, RequestId, PK, OldData, NewData)
        SELECT
            'PRODUCE',
            'PenerimaanBahanBakuOutput',
            @actor,
            @rid,
            (
                SELECT
                    i.NoPenerimaan,
                    i.NoBahanBaku,
                    i.NoPallet
                FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
            ),
            NULL,
            (
                SELECT
                    i.NoPenerimaan,
                    i.NoBahanBaku,
                    i.NoPallet,
                    i.NoSak,
                    bb.Berat
                FROM inserted i
                LEFT JOIN dbo.BahanBaku_d bb
                       ON bb.NoBahanBaku = i.NoBahanBaku
                      AND bb.NoPallet    = i.NoPallet
                      AND bb.NoSak       = i.NoSak
                FOR JSON PATH
            )
        FROM inserted i
        GROUP BY i.NoPenerimaan, i.NoBahanBaku, i.NoPallet;
    END;

    /* =========================================================
       UNPRODUCE (DELETE ONLY, AGGREGATED)
       ========================================================= */
    IF EXISTS (SELECT 1 FROM deleted)
       AND NOT EXISTS (SELECT 1 FROM inserted)
    BEGIN
        INSERT dbo.AuditTrail
            (Action, TableName, Actor, RequestId, PK, OldData, NewData)
        SELECT
            'UNPRODUCE',
            'PenerimaanBahanBakuOutput',
            @actor,
            @rid,
            (
                SELECT
                    d.NoPenerimaan,
                    d.NoBahanBaku,
                    d.NoPallet
                FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
            ),
            (
                SELECT
                    d.NoPenerimaan,
                    d.NoBahanBaku,
                    d.NoPallet,
                    d.NoSak,
                    bb.Berat
                FROM deleted d
                LEFT JOIN dbo.BahanBaku_d bb
                       ON bb.NoBahanBaku = d.NoBahanBaku
                      AND bb.NoPallet    = d.NoPallet
                      AND bb.NoSak       = d.NoSak
                FOR JSON PATH
            ),
            NULL
        FROM deleted d
        GROUP BY d.NoPenerimaan, d.NoBahanBaku, d.NoPallet;
    END;
END;
GO
