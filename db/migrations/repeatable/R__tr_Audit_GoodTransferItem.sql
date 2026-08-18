/* ===== [dbo].[tr_Audit_GoodTransferItem] ON [dbo].[GoodTransferItem] ===== */
-- =============================================
-- TRIGGER: tr_Audit_GoodTransferItem
-- AFTER INSERT, UPDATE, DELETE
-- Actor: SESSION_CONTEXT('actor_id') fallback SESSION_CONTEXT('actor') fallback SUSER_SNAME()
-- RequestId: SESSION_CONTEXT('request_id')
-- =============================================
CREATE OR ALTER TRIGGER [dbo].[tr_Audit_GoodTransferItem]
ON [dbo].[GoodTransferItem]
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
    'GoodTransferItem',
    @actor,
    @rid,
    CONCAT('{"IdTransferItem":"', i.IdTransferItem, '"}'),
    NULL,
    (
      SELECT
        i.IdTransferItem, i.NoTransfer, i.LabelCode, i.PrefixKategori,
        i.BlokAsal, i.IdLokasiAsal, i.BlokTujuan, i.IdLokasiTujuan, i.StatusItem
      FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
    )
  FROM inserted i
  LEFT JOIN deleted d ON d.IdTransferItem = i.IdTransferItem
  WHERE d.IdTransferItem IS NULL;

  /* =====================
     UPDATE
  ===================== */
  INSERT dbo.AuditTrail(Action, TableName, Actor, RequestId, PK, OldData, NewData)
  SELECT
    'UPDATE',
    'GoodTransferItem',
    @actor,
    @rid,
    CONCAT('{"IdTransferItem":"', i.IdTransferItem, '"}'),
    (
      SELECT
        d.IdTransferItem, d.NoTransfer, d.LabelCode, d.PrefixKategori,
        d.BlokAsal, d.IdLokasiAsal, d.BlokTujuan, d.IdLokasiTujuan, d.StatusItem
      FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
    ),
    (
      SELECT
        i.IdTransferItem, i.NoTransfer, i.LabelCode, i.PrefixKategori,
        i.BlokAsal, i.IdLokasiAsal, i.BlokTujuan, i.IdLokasiTujuan, i.StatusItem
      FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
    )
  FROM inserted i
  JOIN deleted d ON d.IdTransferItem = i.IdTransferItem;

  /* =====================
     DELETE
  ===================== */
  INSERT dbo.AuditTrail(Action, TableName, Actor, RequestId, PK, OldData, NewData)
  SELECT
    'DELETE',
    'GoodTransferItem',
    @actor,
    @rid,
    CONCAT('{"IdTransferItem":"', d.IdTransferItem, '"}'),
    (
      SELECT
        d.IdTransferItem, d.NoTransfer, d.LabelCode, d.PrefixKategori,
        d.BlokAsal, d.IdLokasiAsal, d.BlokTujuan, d.IdLokasiTujuan, d.StatusItem
      FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
    ),
    NULL
  FROM deleted d
  LEFT JOIN inserted i ON i.IdTransferItem = d.IdTransferItem
  WHERE i.IdTransferItem IS NULL;
END;
