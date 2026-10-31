const express = require('express');
const router = express.Router();
const superAdminController = require('../controllers/superAdminController');
const { authenticate, authorizeRoles } = require('../middleware/auth');

// Public verification for QR scanner
router.get('/public/verify/:token', superAdminController.verifyAdmitCardToken);

// Protected Super Admin routes
router.use('/admin', authenticate, authorizeRoles('SUPER_ADMIN'));

router.get('/admin/dashboard', superAdminController.getSuperAdminDashboard);
router.post('/admin/committee-members', superAdminController.addCommitteeMember);
router.post('/admin/class-representatives', superAdminController.assignClassRepresentative);
router.post('/admin/sections', superAdminController.createSection);
router.post('/admin/exam-terms', superAdminController.createExamTerm);

module.exports = router;
