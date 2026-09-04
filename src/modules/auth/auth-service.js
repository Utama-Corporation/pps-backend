const { sql, poolPromise } = require("../../core/config/db");
const { hashPassword } = require("../../core/utils/crypto-helper");

/**
 * ✅ Verifikasi user dan kembalikan data lengkapnya dengan error detail
 * 🔒 Security: Jangan berikan info apakah username ada atau tidak, hanya "credentials invalid"
 *
 * [loginId] bisa berupa Username ATAU Nik (login fleksibel). Kalau cocok di
 * keduanya, baris dengan Username yang persis diprioritaskan.
 */
async function verifyUser(loginId, password) {
  const pool = await poolPromise;
  const hashedPassword = hashPassword(password);
  const login = String(loginId ?? "").trim();

  // 🔹 Cocokkan berdasarkan Username ATAU Nik, lalu password
  const result = await pool
    .request()
    .input("login", sql.VarChar, login)
    .input("password", sql.VarChar, hashedPassword).query(`
      SELECT TOP 1
        IdUsername,
        Username,
        FName,
        LName,
        Status,
        IsEnable,
        EmployeeID,
        CompanyID,
        Nik
      FROM dbo.MstUsername
      WHERE (Username = @login OR Nik = @login) AND Password = @password
      ORDER BY CASE WHEN Username = @login THEN 0 ELSE 1 END
    `);

  // 🔹 Kalau tidak ditemukan (bisa username/nik salah ATAU password salah)
  // Security best practice: jangan bedakan "user not found" vs "wrong password"
  if (result.recordset.length === 0) {
    return {
      success: false,
      errorType: "invalid_credentials",
      message: "Username atau password salah",
    };
  }

  const user = result.recordset[0];

  // 🔹 Credentials valid -> BARU cek status akun.
  // Aman diungkap di sini: pemilik akun tahu password-nya sendiri, jadi tidak
  // membocorkan keberadaan username ke orang lain.
  if (!user.IsEnable) {
    return {
      success: false,
      errorType: "user_inactive",
      message:
        "Akun Anda telah dinonaktifkan. Hubungi kepala divisi atau IT untuk mengaktifkan kembali.",
    };
  }

  // 🔹 Sukses - return data user
  return {
    success: true,
    user: {
      IdUsername: user.IdUsername,
      Username: user.Username,
      FName: user.FName,
      LName: user.LName,
      Status: user.Status,
      IsEnable: user.IsEnable,
      EmployeeID: user.EmployeeID,
      CompanyID: user.CompanyID,
      Nik: user.Nik,
    },
  };
}

// 🔹 Database Ascend yang dicek untuk lookup NIK. CompanyID = nama database.
// Urutan = prioritas: match pertama yang ditemukan yang dipakai.
const NIK_LOOKUP_DATABASES = ["AS_GSU", "AS_UC_2017", "AS_RU"];

/**
 * ✅ Cari karyawan berdasarkan EmployeeCode (NIK) di ketiga database Ascend
 * (AS_GSU, AS_UC_2017, AS_RU). Karyawan yang sudah pensiun (ada di
 * HRM_Retirements) diabaikan. CompanyID mengikuti nama database tempat NIK
 * ditemukan.
 * @returns {Promise<{EmployeeID:number, FullName:string, EmployeeCode:string, CompanyID:string} | null>}
 */
async function findEmployeeByCode(nik) {
  const pool = await poolPromise;
  const trimmed = String(nik).trim();

  for (const db of NIK_LOOKUP_DATABASES) {
    const result = await pool
      .request()
      .input("nik", sql.VarChar, trimmed).query(`
        SELECT TOP 1
          e.EmployeeID,
          e.FullName,
          e.EmployeeCode
        FROM [${db}].[dbo].[HRM_Employees] e
        WHERE e.EmployeeCode = @nik
          AND NOT EXISTS (
            SELECT 1
            FROM [${db}].[dbo].[HRM_Retirements] r
            WHERE r.EmployeeID = e.EmployeeID
          )
      `);

    const row = result.recordset[0];
    if (row) {
      return { ...row, CompanyID: db };
    }
  }

  return null;
}

/**
 * ✅ Simpan EmployeeID + CompanyID + NIK ke MstUsername milik user login.
 * CompanyID mengikuti nama database Ascend tempat NIK ditemukan
 * (AS_GSU / AS_UC_2017 / AS_RU).
 */
async function bindUserNik({ username, nik, employeeId, companyId }) {
  const pool = await poolPromise;

  const result = await pool
    .request()
    .input("username", sql.VarChar, username)
    .input("nik", sql.VarChar, String(nik).trim())
    .input("employeeId", sql.Int, employeeId)
    .input("companyId", sql.VarChar, companyId).query(`
      UPDATE dbo.MstUsername
      SET EmployeeID = @employeeId,
          CompanyID = @companyId,
          Nik = @nik
      WHERE Username = @username
    `);

  return result.rowsAffected[0] > 0;
}

module.exports = { verifyUser, findEmployeeByCode, bindUserNik };
