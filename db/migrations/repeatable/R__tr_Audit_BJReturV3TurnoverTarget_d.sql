SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

/* ===== [dbo].[tr_Audit_BJReturV3TurnoverTarget_d] ON [dbo].[BJReturV3TurnoverTarget_d] ===== */
-- =============================================
-- TRIGGER: tr_Audit_BJReturV3TurnoverTarget_d
-- AFTER INSERT, UPDATE, DELETE
-- Actor: SESSION_CONTEXT('actor_id') fallback SESSION_CONTEXT('actor') fallback SUSER_SNAME()
-- RequestId: SESSION_CONTEXT('request_id')
-- PK: {"IdTarget":...}
-- =============================================
CREATE OR ALTER TRIGGER [dbo].[tr_Audit_BJReturV3TurnoverTarget_d]
ON [dbo].[BJReturV3TurnoverTarget_d]
AFTER INSERT, UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @actor nvarchar(128) =
        COALESCE(
            CONVERT(nvarchar(128), TRY_CONVERT(int, SESSION_CONTEXT(N'actor_id'))),
            CAST(SESSION_CONTEXT(N'actor') AS nvarchar(128)),
            SUSER_SNAME()
        );

    DECLARE @rid nvarchar(64) =
        CAST(SESSION_CONTEXT(N'request_id') AS nvarchar(64));

    /* =====================
       INSERT
    ===================== */
    INSERT dbo.AuditTrail (Action, TableName, Actor, RequestId, PK, OldData, NewData)
    SELECT
        'INSERT',
        'BJReturV3TurnoverTarget_d',
        @actor,
        @rid,
        CONCAT('{"IdTarget":', i.IdTarget, '}'),
        NULL,
        (
            SELECT
                i.IdTarget,
                i.NoRetur,
                i.IdItem,
                i.KodeKategori,
                i.IdJenis,
                i.Pcs
            FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
        )
    FROM inserted i
    LEFT JOIN deleted d ON d.IdTarget = i.IdTarget
    WHERE d.IdTarget IS NULL;

    /* =====================
       UPDATE
    ===================== */
    INSERT dbo.AuditTrail (Action, TableName, Actor, RequestId, PK, OldData, NewData)
    SELECT
        'UPDATE',
        'BJReturV3TurnoverTarget_d',
        @actor,
        @rid,
        CONCAT('{"IdTarget":', i.IdTarget, '}'),
        (
            SELECT
                d.IdTarget,
                d.NoRetur,
                d.IdItem,
                d.KodeKategori,
                d.IdJenis,
                d.Pcs
            FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
        ),
        (
            SELECT
                i.IdTarget,
                i.NoRetur,
                i.IdItem,
                i.KodeKategori,
                i.IdJenis,
                i.Pcs
            FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
        )
    FROM inserted i
    JOIN deleted d ON d.IdTarget = i.IdTarget;

    /* =====================
       DELETE
    ===================== */
    INSERT dbo.AuditTrail (Action, TableName, Actor, RequestId, PK, OldData, NewData)
    SELECT
        'DELETE',
        'BJReturV3TurnoverTarget_d',
        @actor,
        @rid,
        CONCAT('{"IdTarget":', d.IdTarget, '}'),
        (
            SELECT
                d.IdTarget,
                d.NoRetur,
                d.IdItem,
                d.KodeKategori,
                d.IdJenis,
                d.Pcs
            FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
        ),
        NULL
    FROM deleted d
    LEFT JOIN inserted i ON i.IdTarget = d.IdTarget
    WHERE i.IdTarget IS NULL;
END;
GO
