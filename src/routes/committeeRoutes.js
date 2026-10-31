const express = require('express');
const router = express.Router();
const committeeController = require('../controllers/committeeController');
const { authenticate, authorizeRoles } = require('../middleware/auth');

// Only COMMITTEE (or Super Admin) can access
router.use(authenticate, authorizeRoles('COMMITTEE', 'SUPER_ADMIN'));

router.get('/dashboard', committeeController.getCommitteeDashboard);
router.post('/requests/:requestId/approve', committeeController.approveRequest);
router.post('/requests/:requestId/reject', committeeController.rejectRequest);

module.exports = router;
