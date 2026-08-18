/* ===== [dbo].[tr_Audit_GoodTransfer_h] ON [dbo].[GoodTransfer_h] ===== */
-- =============================================
-- TRIGGER: tr_Audit_GoodTransfer_h
-- AFTER INSERT, UPDATE, DELETE
-- Actor: SESSION_CONTEXT('actor_id') fallback SESSION_CONTEXT('actor') fallback SUSER_SNAME()
-- RequestId: SESSION_CONTEXT('request_id')
-- =============================================
CREATE OR ALTER TRIGGER [dbo].[tr_Audit_GoodTransfer_h]
ON [dbo].[GoodTransfer_h]
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
  INSERT dbo.AuditTrail(Action, TableName, Actor, RequestId, PK, OldData, NewData)
  SELECT
    'INSERT',
    'GoodTransfer_h',
    @actor,
    @rid,
    CONCAT('{"NoTransfer":"', i.NoTransfer, '"}'),
    NULL,
    (
      SELECT
        i.NoTransfer, i.TanggalKirim, i.IdWarehouseAsal, i.IdWarehouseTujuan,
        i.IdUsernameKirim, i.DateTimeKirim, i.Status,
        i.TanggalTerima, i.IdUsernameTerima, i.DateTimeTerima,
        i.IdUsernameCancel, i.DateTimeCancel, i.Catatan, i.AlasanTolak
      FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
    )
  FROM inserted i
  LEFT JOIN deleted d ON d.NoTransfer = i.NoTransfer
  WHERE d.NoTransfer IS NULL;

  /* =====================
     UPDATE
  ===================== */
  INSERT dbo.AuditTrail(Action, TableName, Actor, RequestId, PK, OldData, NewData)
  SELECT
    'UPDATE',
    'GoodTransfer_h',
    @actor,
    @rid,
    CONCAT('{"NoTransfer":"', i.NoTransfer, '"}'),
    (
      SELECT
        d.NoTransfer, d.TanggalKirim, d.IdWarehouseAsal, d.IdWarehouseTujuan,
        d.IdUsernameKirim, d.DateTimeKirim, d.Status,
        d.TanggalTerima, d.IdUsernameTerima, d.DateTimeTerima,
        d.IdUsernameCancel, d.DateTimeCancel, d.Catatan, d.AlasanTolak
      FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
    ),
    (
      SELECT
        i.NoTransfer, i.TanggalKirim, i.IdWarehouseAsal, i.IdWarehouseTujuan,
        i.IdUsernameKirim, i.DateTimeKirim, i.Status,
        i.TanggalTerima, i.IdUsernameTerima, i.DateTimeTerima,
        i.IdUsernameCancel, i.DateTimeCancel, i.Catatan, i.AlasanTolak
      FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
    )
  FROM inserted i
  JOIN deleted d ON d.NoTransfer = i.NoTransfer;

  /* =====================
     DELETE
  ===================== */
  INSERT dbo.AuditTrail(Action, TableName, Actor, RequestId, PK, OldData, NewData)
  SELECT
    'DELETE',
    'GoodTransfer_h',
    @actor,
    @rid,
    CONCAT('{"NoTransfer":"', d.NoTransfer, '"}'),
    (
      SELECT
        d.NoTransfer, d.TanggalKirim, d.IdWarehouseAsal, d.IdWarehouseTujuan,
        d.IdUsernameKirim, d.DateTimeKirim, d.Status,
        d.TanggalTerima, d.IdUsernameTerima, d.DateTimeTerima,
        d.IdUsernameCancel, d.DateTimeCancel, d.Catatan, d.AlasanTolak
      FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
    ),
    NULL
  FROM deleted d
  LEFT JOIN inserted i ON i.NoTransfer = d.NoTransfer
  WHERE i.NoTransfer IS NULL;
END;
