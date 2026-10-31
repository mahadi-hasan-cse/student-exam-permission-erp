const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');

router.post('/login-staff', authController.loginStaff);
router.post('/login-student-google', authController.loginStudentGoogle);
router.post('/demo-login', authController.demoLogin);
router.get('/me', authenticate, authController.getMe);
router.post('/logout', authController.logout);

module.exports = router;
