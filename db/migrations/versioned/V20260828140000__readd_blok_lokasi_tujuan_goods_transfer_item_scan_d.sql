-- ================================================================
-- Migration: tambah kembali BlokTujuan / IdLokasiTujuan di
--            dbo.GoodsTransferItemScan_d
-- ================================================================
-- Kedua kolom sempat di-drop (V20260828120000 versi awal) dengan asumsi
-- redundan dengan tabel label fisik. Ternyata tetap dibutuhkan: diisi saat
-- langkah terima supaya baris scan mencatat ke blok/lokasi mana label
-- diletakkan di warehouse tujuan (tanpa perlu join balik ke tabel label).
--
-- Idempotent: guard COL_LENGTH. Env fresh sudah punya kolom ini dari
-- V20260828100100, jadi migration ini no-op di sana.
-- ================================================================

IF COL_LENGTH('dbo.GoodsTransferItemScan_d', 'BlokTujuan') IS NULL
    ALTER TABLE dbo.GoodsTransferItemScan_d ADD [BlokTujuan] VARCHAR(50) NULL;
GO

IF COL_LENGTH('dbo.GoodsTransferItemScan_d', 'IdLokasiTujuan') IS NULL
    ALTER TABLE dbo.GoodsTransferItemScan_d ADD [IdLokasiTujuan] INT NULL;
GO
