const express = require("express");
const router = express.Router();
const authController = require("./auth-controller");

router.use(express.json()); // Middleware parsing JSON

// router.post('/login', authController.login);

//FORCE UPDATE FOR MOBILE
// Endpoint ini juga menangani gate NIK (nik_required / nik_confirm) —
// tidak ada token yang dikeluarkan selama user belum punya NIK.
router.post("/login2", authController.login);

module.exports = router;
