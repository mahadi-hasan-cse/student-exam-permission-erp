const bcrypt = require('bcryptjs');
const { db } = require('../config/database');

// 1. Get Super Admin Overview
async function getSuperAdminDashboard(req, res) {
  try {
    const stats = db.prepare(`
      SELECT 
        (SELECT COUNT(*) FROM users WHERE role = 'STUDENT') as total_students,
        (SELECT COUNT(*) FROM users WHERE role = 'CR_ADMIN') as total_crs,
        (SELECT COUNT(*) FROM users WHERE role = 'COMMITTEE') as total_committee_members,
        (SELECT COUNT(*) FROM sections) as total_sections,
        (SELECT COUNT(*) FROM permission_requests) as total_requests,
        (SELECT COUNT(*) FROM permission_requests WHERE status = 'APPROVED') as approved_requests,
        (SELECT COUNT(*) FROM permission_requests WHERE status = 'PENDING') as pending_requests,
        (SELECT COUNT(*) FROM permission_requests WHERE status = 'REJECTED') as rejected_requests
    `).get();

    const sections = db.prepare(`
      SELECT s.*, u.name as cr_name, u.email as cr_email 
      FROM sections s 
      LEFT JOIN users u ON s.cr_user_id = u.id
      ORDER BY s.semester DESC, s.section_letter ASC
    `).all();

    const committeeMembers = db.prepare(`
      SELECT id, name, email, status, created_at 
      FROM users 
      WHERE role = 'COMMITTEE' 
      ORDER BY id ASC
    `).all();

    const classRepresentatives = db.prepare(`
      SELECT id, student_id, name, email, section_code, status, created_at 
      FROM users 
      WHERE role = 'CR_ADMIN' 
      ORDER BY section_code ASC
    `).all();

    const examTerms = db.prepare('SELECT * FROM exam_terms ORDER BY id DESC').all();
    const courses = db.prepare('SELECT * FROM courses ORDER BY code ASC').all();

    return res.json({
      stats,
      sections,
      committeeMembers,
      classRepresentatives,
      examTerms,
      courses,
    });
  } catch (err) {
    console.error('Super Admin Dashboard error:', err);
    return res.status(500).json({ error: 'Failed to fetch Super Admin dashboard data.' });
  }
}

// 2. Assign / Create a new Permission Granting Committee Member
async function addCommitteeMember(req, res) {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required.' });
    }

    const trimmedEmail = email.trim().toLowerCase();
    const existing = db.prepare('SELECT id FROM users WHERE email = ? COLLATE NOCASE').get(trimmedEmail);
    if (existing) {
      return res.status(400).json({ error: `User with email ${trimmedEmail} already exists.` });
    }

    const salt = bcrypt.genSaltSync(10);
    const hash = bcrypt.hashSync(password, salt);

    const result = db.prepare(`
      INSERT INTO users (name, email, password_hash, role, status)
      VALUES (?, ?, ?, 'COMMITTEE', 'ACTIVE')
    `).run(name.trim(), trimmedEmail, hash);

    const newMember = db.prepare('SELECT id, name, email, role, status FROM users WHERE id = ?').get(result.lastInsertRowid);
    return res.status(201).json({
      message: 'Committee member assigned successfully.',
      member: newMember,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to assign committee member.' });
  }
}

// 3. Assign / Appoint a Class Representative (Admin for Section like 10/A)
async function assignClassRepresentative(req, res) {
  try {
    const { student_id, name, email, password, section_code } = req.body;
    if (!name || !email || !password || !section_code) {
      return res.status(400).json({ error: 'Name, email, password, and section code (e.g. 10/A) are required.' });
    }

    const trimmedEmail = email.trim().toLowerCase();
    const trimmedSection = section_code.trim().toUpperCase();

    // Check if section exists
    const section = db.prepare('SELECT * FROM sections WHERE code = ?').get(trimmedSection);
    if (!section) {
      return res.status(400).json({ error: `Section ${trimmedSection} does not exist. Please create the section first.` });
    }

    const existingUser = db.prepare('SELECT id FROM users WHERE email = ? COLLATE NOCASE').get(trimmedEmail);
    if (existingUser) {
      return res.status(400).json({ error: `User with email ${trimmedEmail} already exists.` });
    }

    const salt = bcrypt.genSaltSync(10);
    const hash = bcrypt.hashSync(password, salt);

    const result = db.prepare(`
      INSERT INTO users (student_id, name, email, password_hash, role, section_code, status)
      VALUES (?, ?, ?, ?, 'CR_ADMIN', ?, 'ACTIVE')
    `).run(student_id ? student_id.trim() : null, name.trim(), trimmedEmail, hash, trimmedSection);

    const crUserId = result.lastInsertRowid;

    // Link CR to section
    db.prepare('UPDATE sections SET cr_user_id = ? WHERE code = ?').run(crUserId, trimmedSection);

    const newCR = db.prepare('SELECT id, student_id, name, email, section_code, role FROM users WHERE id = ?').get(crUserId);

    return res.status(201).json({
      message: `Class Representative for Section ${trimmedSection} assigned successfully.`,
      cr: newCR,
    });
  } catch (err) {
    console.error('Assign CR error:', err);
    return res.status(500).json({ error: 'Failed to assign Class Representative.' });
  }
}

// 4. Create Section (e.g. 10th Semester, Section A -> 10/A)
async function createSection(req, res) {
  try {
    const { semester, section_letter, department } = req.body;
    if (!semester || !section_letter) {
      return res.status(400).json({ error: 'Semester number (e.g. 10) and Section letter (e.g. A) are required.' });
    }

    const semNum = parseInt(semester, 10);
    const letter = section_letter.trim().toUpperCase();
    const code = `${semNum}/${letter}`;

    const existing = db.prepare('SELECT id FROM sections WHERE code = ?').get(code);
    if (existing) {
      return res.status(400).json({ error: `Section ${code} already exists.` });
    }

    const dept = department ? department.trim() : 'Computer Science & Engineering';

    const result = db.prepare(`
      INSERT INTO sections (semester, section_letter, code, department)
      VALUES (?, ?, ?, ?)
    `).run(semNum, letter, code, dept);

    const newSection = db.prepare('SELECT * FROM sections WHERE id = ?').get(result.lastInsertRowid);
    return res.status(201).json({
      message: `Section ${code} created successfully.`,
      section: newSection,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to create section.' });
  }
}

// 5. Create / Manage Exam Terms (e.g. Mid Term Fall 2026)
async function createExamTerm(req, res) {
  try {
    const { name, is_active } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Exam term title is required (e.g., Mid Term Fall 2026).' });
    }

    const trimmedName = name.trim();
    const existing = db.prepare('SELECT id FROM exam_terms WHERE name = ?').get(trimmedName);
    if (existing) {
      return res.status(400).json({ error: `Exam term "${trimmedName}" already exists.` });
    }

    const result = db.prepare('INSERT INTO exam_terms (name, is_active) VALUES (?, ?)').run(trimmedName, is_active ? 1 : 0);

    const newTerm = db.prepare('SELECT * FROM exam_terms WHERE id = ?').get(result.lastInsertRowid);
    return res.status(201).json({
      message: `Exam term "${trimmedName}" created successfully.`,
      examTerm: newTerm,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to create exam term.' });
  }
}

// 6. Public verification endpoint for QR code check
async function verifyAdmitCardToken(req, res) {
  try {
    const { token } = req.params;
    if (!token) {
      return res.status(400).json({ valid: false, error: 'Token missing.' });
    }

    const request = db.prepare(`
      SELECT 
        pr.*, 
        s.department 
      FROM permission_requests pr
      LEFT JOIN sections s ON pr.section_code = s.code
      WHERE pr.admit_card_token = ? AND pr.status = 'APPROVED'
    `).get(token);

    if (!request) {
      return res.status(404).json({
        valid: false,
        message: 'INVALID ADMIT CARD: No approved exam permission corresponds to this QR verification token.',
      });
    }

    let coursesList = [];
    if (request.courses_json) {
      try { coursesList = JSON.parse(request.courses_json); } catch (e) {}
    }
    if (!coursesList || coursesList.length === 0) {
      coursesList = [{
        id: request.course_id,
        code: request.course_code,
        title: request.course_title,
        exam_date: request.exam_date,
        exam_time: request.exam_time,
      }];
    }

    return res.json({
      valid: true,
      admitCard: {
        requestNumber: request.request_number,
        studentName: request.student_name,
        studentId: request.student_id,
        section: request.section_code,
        examTerm: request.exam_term_name,
        courseCode: request.course_code,
        courseTitle: request.course_title,
        examDate: request.exam_date,
        examTime: request.exam_time,
        courses: coursesList,
        approvedBy: request.reviewed_by_name,
        approvedAt: request.reviewed_at,
        remarks: request.review_remarks,
      },
    });
  } catch (err) {
    return res.status(500).json({ valid: false, error: 'Verification failed.' });
  }
}

module.exports = {
  getSuperAdminDashboard,
  addCommitteeMember,
  assignClassRepresentative,
  createSection,
  createExamTerm,
  verifyAdmitCardToken,
};
