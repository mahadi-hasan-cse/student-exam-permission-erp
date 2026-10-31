const express = require('express');
const router = express.Router();
const studentController = require('../controllers/studentController');
const { authenticate, authorizeRoles } = require('../middleware/auth');

// Only STUDENTS can access student endpoints
router.use(authenticate, authorizeRoles('STUDENT'));

router.get('/dashboard', studentController.getStudentDashboard);
router.post('/requests', studentController.submitPermissionRequest);
router.get('/requests/:requestId/admit-card', studentController.getAdmitCardData);

module.exports = router;
