SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

/* ===== [dbo].[tr_Audit_BJReturV3_h] ON [dbo].[BJReturV3_h] ===== */
-- =============================================
-- TRIGGER: tr_Audit_BJReturV3_h
-- AFTER INSERT, UPDATE, DELETE
-- Actor: SESSION_CONTEXT('actor_id') fallback SESSION_CONTEXT('actor') fallback SUSER_SNAME()
-- RequestId: SESSION_CONTEXT('request_id')
-- PK: {"NoRetur":"..."}
-- =============================================
CREATE OR ALTER TRIGGER [dbo].[tr_Audit_BJReturV3_h]
ON [dbo].[BJReturV3_h]
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
        'BJReturV3_h',
        @actor,
        @rid,
        CONCAT('{"NoRetur":"', i.NoRetur, '"}'),
        NULL,
        (
            SELECT
                i.NoRetur,
                i.Tanggal,
                i.IdPembeli,
                i.Keterangan,
                i.StatusRetur,
                i.DecisionBy,
                i.DecisionByUsername,
                i.DecisionAt,
                i.IsComplete,
                i.CompletedBy,
                i.CompletedByUsername,
                i.CompletedAt
            FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
        )
    FROM inserted i
    LEFT JOIN deleted d ON d.NoRetur = i.NoRetur
    WHERE d.NoRetur IS NULL;

    /* =====================
       UPDATE
    ===================== */
    INSERT dbo.AuditTrail (Action, TableName, Actor, RequestId, PK, OldData, NewData)
    SELECT
        'UPDATE',
        'BJReturV3_h',
        @actor,
        @rid,
        CONCAT('{"NoRetur":"', i.NoRetur, '"}'),
        (
            SELECT
                d.NoRetur,
                d.Tanggal,
                d.IdPembeli,
                d.Keterangan,
                d.StatusRetur,
                d.DecisionBy,
                d.DecisionByUsername,
                d.DecisionAt,
                d.IsComplete,
                d.CompletedBy,
                d.CompletedByUsername,
                d.CompletedAt
            FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
        ),
        (
            SELECT
                i.NoRetur,
                i.Tanggal,
                i.IdPembeli,
                i.Keterangan,
                i.StatusRetur,
                i.DecisionBy,
                i.DecisionByUsername,
                i.DecisionAt,
                i.IsComplete,
                i.CompletedBy,
                i.CompletedByUsername,
                i.CompletedAt
            FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
        )
    FROM inserted i
    JOIN deleted d ON d.NoRetur = i.NoRetur;

    /* =====================
       DELETE
    ===================== */
    INSERT dbo.AuditTrail (Action, TableName, Actor, RequestId, PK, OldData, NewData)
    SELECT
        'DELETE',
        'BJReturV3_h',
        @actor,
        @rid,
        CONCAT('{"NoRetur":"', d.NoRetur, '"}'),
        (
            SELECT
                d.NoRetur,
                d.Tanggal,
                d.IdPembeli,
                d.Keterangan,
                d.StatusRetur,
                d.DecisionBy,
                d.DecisionByUsername,
                d.DecisionAt,
                d.IsComplete,
                d.CompletedBy,
                d.CompletedByUsername,
                d.CompletedAt
            FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
        ),
        NULL
    FROM deleted d
    LEFT JOIN inserted i ON i.NoRetur = d.NoRetur
    WHERE i.NoRetur IS NULL;
END;
GO
