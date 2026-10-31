const { db } = require('../config/database');

// Get CR Dashboard data (section details like 10/A, list of registered students, request stats)
async function getCRDashboard(req, res) {
  try {
    const crUser = req.user;
    const sectionCode = crUser.section_code || '10/A';

    // Get section information
    const section = db.prepare('SELECT * FROM sections WHERE code = ?').get(sectionCode);

    // Get all students whitelisted in this section
    const students = db.prepare(`
      SELECT id, student_id, name, email, section_code, status, created_at 
      FROM users 
      WHERE role = 'STUDENT' AND section_code = ? 
      ORDER BY student_id ASC
    `).all(sectionCode);

    // Get request statistics for this section
    const stats = db.prepare(`
      SELECT 
        COUNT(*) as total_requests,
        SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) as pending_requests,
        SUM(CASE WHEN status = 'APPROVED' THEN 1 ELSE 0 END) as approved_requests,
        SUM(CASE WHEN status = 'REJECTED' THEN 1 ELSE 0 END) as rejected_requests
      FROM permission_requests
      WHERE section_code = ?
    `).get(sectionCode);

    return res.json({
      section: section || { code: sectionCode, semester: 10, section_letter: 'A', department: 'CSE' },
      students,
      stats: {
        total_students: students.length,
        total_requests: stats.total_requests || 0,
        pending_requests: stats.pending_requests || 0,
        approved_requests: stats.approved_requests || 0,
        rejected_requests: stats.rejected_requests || 0,
      },
    });
  } catch (err) {
    console.error('CR Dashboard error:', err);
    return res.status(500).json({ error: 'Failed to fetch CR dashboard data.' });
  }
}

// Add / Whitelist a new Student by Student ID and Gmail address
async function addStudent(req, res) {
  try {
    const crUser = req.user;
    const sectionCode = crUser.section_code || '10/A';
    const { student_id, name, email } = req.body;

    if (!student_id || !email) {
      return res.status(400).json({ error: 'Student ID and Gmail address are mandatory.' });
    }

    const trimmedEmail = email.trim().toLowerCase();
    const trimmedStudentId = student_id.trim();
    const studentName = (name && name.trim()) || `Student ${trimmedStudentId}`;

    // Validate email format
    if (!trimmedEmail.includes('@') || !trimmedEmail.endsWith('@gmail.com')) {
      return res.status(400).json({ error: 'Please provide a valid Gmail address (@gmail.com).' });
    }

    // Check if email already exists
    const existingEmail = db.prepare('SELECT id, student_id, section_code FROM users WHERE email = ? COLLATE NOCASE').get(trimmedEmail);
    if (existingEmail) {
      return res.status(400).json({
        error: `Gmail address ${trimmedEmail} is already registered under ID ${existingEmail.student_id} (Section: ${existingEmail.section_code}).`,
      });
    }

    // Check if student_id already exists
    const existingId = db.prepare('SELECT id, email FROM users WHERE student_id = ?').get(trimmedStudentId);
    if (existingId) {
      return res.status(400).json({
        error: `Student ID ${trimmedStudentId} is already registered with email ${existingId.email}.`,
      });
    }

    // Insert student
    const result = db.prepare(`
      INSERT INTO users (student_id, name, email, role, section_code, status)
      VALUES (?, ?, ?, 'STUDENT', ?, 'ACTIVE')
    `).run(trimmedStudentId, studentName, trimmedEmail, sectionCode);

    const newStudent = db.prepare('SELECT id, student_id, name, email, section_code, status, created_at FROM users WHERE id = ?').get(result.lastInsertRowid);

    return res.status(201).json({
      message: `Student ${studentName} (${trimmedStudentId}) whitelisted successfully for Section ${sectionCode}.`,
      student: newStudent,
    });
  } catch (err) {
    console.error('Add student error:', err);
    return res.status(500).json({ error: 'Failed to add student.' });
  }
}

// Bulk upload students (for rapid batch entry)
async function bulkAddStudents(req, res) {
  try {
    const crUser = req.user;
    const sectionCode = crUser.section_code || '10/A';
    const { students } = req.body; // Array of { student_id, name, email }

    if (!Array.isArray(students) || students.length === 0) {
      return res.status(400).json({ error: 'An array of student objects is required.' });
    }

    let addedCount = 0;
    const errors = [];

    const insertStmt = db.prepare(`
      INSERT INTO users (student_id, name, email, role, section_code, status)
      VALUES (?, ?, ?, 'STUDENT', ?, 'ACTIVE')
    `);

    for (const item of students) {
      const email = item.email ? item.email.trim().toLowerCase() : null;
      const studentId = item.student_id ? item.student_id.trim() : null;
      const name = item.name ? item.name.trim() : `Student ${studentId}`;

      if (!email || !studentId) {
        errors.push(`Row missing ID or email: ${JSON.stringify(item)}`);
        continue;
      }

      try {
        insertStmt.run(studentId, name, email, sectionCode);
        addedCount++;
      } catch (insertErr) {
        errors.push(`Failed for ${studentId} (${email}): ${insertErr.message}`);
      }
    }

    return res.json({
      message: `Successfully whitelisted ${addedCount} students for Section ${sectionCode}.`,
      addedCount,
      errors,
    });
  } catch (err) {
    console.error('Bulk add error:', err);
    return res.status(500).json({ error: 'Bulk upload failed.' });
  }
}

// Delete / remove whitelisted student
async function deleteStudent(req, res) {
  try {
    const studentId = req.params.id;
    const crUser = req.user;
    const sectionCode = crUser.section_code || '10/A';

    const student = db.prepare('SELECT * FROM users WHERE id = ? AND section_code = ? AND role = "STUDENT"').get(studentId, sectionCode);
    if (!student) {
      return res.status(404).json({ error: 'Student not found in your section.' });
    }

    db.prepare('DELETE FROM users WHERE id = ?').run(studentId);
    return res.json({ message: `Student ${student.student_id} removed from whitelist.` });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to delete student.' });
  }
}

module.exports = {
  getCRDashboard,
  addStudent,
  bulkAddStudents,
  deleteStudent,
};
