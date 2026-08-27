SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

/* ===== [dbo].[tr_Audit_PenerimaanBahanPendukung_h] ON [dbo].[PenerimaanBahanPendukung_h] ===== */
-- =============================================
-- TRIGGER: tr_Audit_PenerimaanBahanPendukung_h
-- AFTER INSERT, UPDATE, DELETE
-- Actor: SESSION_CONTEXT('actor_id') fallback SESSION_CONTEXT('actor') fallback SUSER_SNAME()
-- RequestId: SESSION_CONTEXT('request_id')
-- PK: {"NoPenerimaan":"..."}
-- =============================================
CREATE OR ALTER TRIGGER [dbo].[tr_Audit_PenerimaanBahanPendukung_h]
ON [dbo].[PenerimaanBahanPendukung_h]
AFTER INSERT, UPDATE, DELETE
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

    /* =====================
       INSERT
    ===================== */
    INSERT dbo.AuditTrail
        (Action, TableName, Actor, RequestId, PK, OldData, NewData)
    SELECT
        'INSERT',
        'PenerimaanBahanPendukung_h',
        @actor,
        @rid,
        CONCAT('{"NoPenerimaan":"', i.NoPenerimaan, '"}'),
        NULL,
        (
            SELECT
                i.NoPenerimaan,
                i.TglPenerimaan,
                i.IdTim,
                i.IsComplete,
                i.CreateBy,
                i.TglComplete
            FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
        )
    FROM inserted i
    LEFT JOIN deleted d ON d.NoPenerimaan = i.NoPenerimaan
    WHERE d.NoPenerimaan IS NULL;

    /* =====================
       UPDATE
    ===================== */
    INSERT dbo.AuditTrail
        (Action, TableName, Actor, RequestId, PK, OldData, NewData)
    SELECT
        'UPDATE',
        'PenerimaanBahanPendukung_h',
        @actor,
        @rid,
        CONCAT('{"NoPenerimaan":"', i.NoPenerimaan, '"}'),
        (
            SELECT
                d.NoPenerimaan,
                d.TglPenerimaan,
                d.IdTim,
                d.IsComplete,
                d.CreateBy,
                d.TglComplete
            FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
        ),
        (
            SELECT
                i.NoPenerimaan,
                i.TglPenerimaan,
                i.IdTim,
                i.IsComplete,
                i.CreateBy,
                i.TglComplete
            FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
        )
    FROM inserted i
    JOIN deleted d ON d.NoPenerimaan = i.NoPenerimaan;

    /* =====================
       DELETE
    ===================== */
    INSERT dbo.AuditTrail
        (Action, TableName, Actor, RequestId, PK, OldData, NewData)
    SELECT
        'DELETE',
        'PenerimaanBahanPendukung_h',
        @actor,
        @rid,
        CONCAT('{"NoPenerimaan":"', d.NoPenerimaan, '"}'),
        (
            SELECT
                d.NoPenerimaan,
                d.TglPenerimaan,
                d.IdTim,
                d.IsComplete,
                d.CreateBy,
                d.TglComplete
            FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
        ),
        NULL
    FROM deleted d
    LEFT JOIN inserted i ON i.NoPenerimaan = d.NoPenerimaan
    WHERE i.NoPenerimaan IS NULL;

END;
GO
