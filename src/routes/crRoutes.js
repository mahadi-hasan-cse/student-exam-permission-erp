const express = require('express');
const router = express.Router();
const crController = require('../controllers/crController');
const { authenticate, authorizeRoles } = require('../middleware/auth');

// Only CRs (or Super Admin) can access CR endpoints
router.use(authenticate, authorizeRoles('CR_ADMIN', 'SUPER_ADMIN'));

router.get('/dashboard', crController.getCRDashboard);
router.post('/students', crController.addStudent);
router.post('/students/bulk', crController.bulkAddStudents);
router.delete('/students/:id', crController.deleteStudent);

module.exports = router;
