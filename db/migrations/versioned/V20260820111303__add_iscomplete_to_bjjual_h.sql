-- ================================================================
-- Migration: Add IsComplete/DateComplete flag to BJJual_h
-- ================================================================
-- Dipakai oleh modul "penjualan" (scan label untuk memenuhi turnover
-- BJJualItem_d). Header ditandai complete otomatis oleh backend saat
-- semua baris BJJualItem_d sudah terpenuhi via BJJualScanLabel_d.
-- Begitu IsComplete = 1, header tidak lagi muncul di list "belum complete"
-- dan endpoint scan menolak scan lanjutan untuk header tsb.

ALTER TABLE dbo.BJJual_h
    ADD IsComplete BIT NOT NULL CONSTRAINT DF_BJJual_h_IsComplete DEFAULT (0),
        DateComplete DATETIME NULL;
GO
