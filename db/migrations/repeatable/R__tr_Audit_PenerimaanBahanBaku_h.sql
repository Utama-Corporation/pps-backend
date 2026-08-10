SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

/* ===== [dbo].[tr_Audit_PenerimaanBahanBaku_h] ON [dbo].[PenerimaanBahanBaku_h] ===== */
-- =============================================
-- TRIGGER: tr_Audit_PenerimaanBahanBaku_h
-- AFTER INSERT, UPDATE, DELETE
-- Actor: SESSION_CONTEXT('actor_id') fallback SESSION_CONTEXT('actor') fallback SUSER_SNAME()
-- RequestId: SESSION_CONTEXT('request_id')
-- PK: {"NoPenerimaan":"..."}
-- =============================================
CREATE OR ALTER TRIGGER [dbo].[tr_Audit_PenerimaanBahanBaku_h]
ON [dbo].[PenerimaanBahanBaku_h]
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
        'PenerimaanBahanBaku_h',
        @actor,
        @rid,
        CONCAT('{"NoPenerimaan":"', i.NoPenerimaan, '"}'),
        NULL,
        (
            SELECT
                i.NoPenerimaan,
                i.TglPenerimaan,
                i.IdTim,
                i.IdSupplier,
                i.NoPlat,
                i.CreateBy,
                i.DateTimeCreate
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
        'PenerimaanBahanBaku_h',
        @actor,
        @rid,
        CONCAT('{"NoPenerimaan":"', i.NoPenerimaan, '"}'),
        (
            SELECT
                d.NoPenerimaan,
                d.TglPenerimaan,
                d.IdTim,
                d.IdSupplier,
                d.NoPlat,
                d.CreateBy,
                d.DateTimeCreate
            FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
        ),
        (
            SELECT
                i.NoPenerimaan,
                i.TglPenerimaan,
                i.IdTim,
                i.IdSupplier,
                i.NoPlat,
                i.CreateBy,
                i.DateTimeCreate
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
        'PenerimaanBahanBaku_h',
        @actor,
        @rid,
        CONCAT('{"NoPenerimaan":"', d.NoPenerimaan, '"}'),
        (
            SELECT
                d.NoPenerimaan,
                d.TglPenerimaan,
                d.IdTim,
                d.IdSupplier,
                d.NoPlat,
                d.CreateBy,
                d.DateTimeCreate
            FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
        ),
        NULL
    FROM deleted d
    LEFT JOIN inserted i ON i.NoPenerimaan = d.NoPenerimaan
    WHERE i.NoPenerimaan IS NULL;

END;
GO
