const crypto = require('node:crypto');
const { db } = require('../config/database');
const { generateQRCodeDataURL } = require('../utils/qrGenerator');

// 1. Get Student Dashboard data (active exam terms, eligible courses, previous requests)
async function getStudentDashboard(req, res) {
  try {
    const studentUser = req.user;

    // Get active exam terms (e.g. Mid Term Fall 2026)
    const examTerms = db.prepare('SELECT id, name FROM exam_terms WHERE is_active = 1').all();

    // Get available courses with official NUB Fall-2026 exam schedule
    const courses = db.prepare('SELECT id, code, title, credits, semester, scheduled_date, scheduled_time, program_type FROM courses ORDER BY scheduled_date ASC, scheduled_time ASC, code ASC').all();

    // Get all previous permission requests submitted by this student
    const requests = db.prepare(`
      SELECT 
        id, request_number, exam_term_name, course_code, course_title,
        exam_date, exam_time, current_due_amount, due_notes, status,
        reviewed_by_name, review_remarks, reviewed_at, admit_card_token, created_at
      FROM permission_requests
      WHERE student_user_id = ?
      ORDER BY id DESC
    `).all(studentUser.id);

    return res.json({
      student: {
        id: studentUser.id,
        name: studentUser.name,
        email: studentUser.email,
        student_id: studentUser.student_id,
        section_code: studentUser.section_code,
      },
      examTerms,
      courses,
      requests,
    });
  } catch (err) {
    console.error('Student dashboard error:', err);
    return res.status(500).json({ error: 'Failed to load student dashboard.' });
  }
}

// 2. Submit a Permission Request (Supports Multiple Courses)
async function submitPermissionRequest(req, res) {
  try {
    const studentUser = req.user;
    const { exam_term_id, course_ids, course_id, exam_date, exam_time, current_due_amount, due_notes } = req.body;

    // Validation: Current due amount is MANDATORY
    if (current_due_amount === undefined || current_due_amount === null || current_due_amount === '') {
      return res.status(400).json({
        error: 'Mandatory Requirement: You must declare your current due amount (enter 0 if you have no dues).',
      });
    }

    const numericDue = parseFloat(current_due_amount);
    if (isNaN(numericDue) || numericDue < 0) {
      return res.status(400).json({ error: 'Please enter a valid non-negative number for current due amount.' });
    }

    if (!exam_term_id) {
      return res.status(400).json({ error: 'Exam Term is required.' });
    }

    // Determine target course IDs (supports multiple or single)
    let targetCourseIds = [];
    if (Array.isArray(course_ids) && course_ids.length > 0) {
      targetCourseIds = course_ids.map(id => parseInt(id, 10)).filter(id => !isNaN(id));
    } else if (course_id) {
      targetCourseIds = [parseInt(course_id, 10)];
    }

    if (targetCourseIds.length === 0) {
      return res.status(400).json({ error: 'Please select at least one course for exam permission.' });
    }

    // Fetch Exam Term info
    const examTerm = db.prepare('SELECT id, name FROM exam_terms WHERE id = ? AND is_active = 1').get(exam_term_id);
    if (!examTerm) {
      return res.status(400).json({ error: 'Selected exam term is invalid or inactive.' });
    }

    // Fetch all selected courses from database
    const placeholders = targetCourseIds.map(() => '?').join(',');
    const courses = db.prepare(`SELECT * FROM courses WHERE id IN (${placeholders}) ORDER BY scheduled_date ASC, scheduled_time ASC, code ASC`).all(...targetCourseIds);

    if (courses.length === 0) {
      return res.status(400).json({ error: 'None of the selected courses were found.' });
    }

    const courseList = courses.map(c => ({
      id: c.id,
      code: c.code,
      title: c.title,
      credits: c.credits,
      semester: c.semester,
      exam_date: c.scheduled_date || exam_date || 'TBD',
      exam_time: c.scheduled_time || exam_time || '10:30 AM - 12:00 PM',
    }));

    const primaryCourse = courseList[0];
    const combinedCodes = courseList.map(c => c.code).join(', ');
    const combinedTitles = courseList.length === 1 ? primaryCourse.title : `${courseList.length} Courses Selected (${combinedCodes})`;
    const combinedDates = courseList.length === 1 ? primaryCourse.exam_date : courseList.map(c => `${c.code}: ${c.exam_date}`).join('; ');
    const combinedTimes = courseList.length === 1 ? primaryCourse.exam_time : 'Per Course Routine';
    const coursesJson = JSON.stringify(courseList);

    // Generate unique Request Number
    const count = db.prepare('SELECT COUNT(*) as count FROM permission_requests').get().count;
    const requestNumber = `REQ-2026-${String(count + 1001).padStart(5, '0')}`;

    // Insert permission request with multiple courses
    const insertStmt = db.prepare(`
      INSERT INTO permission_requests (
        request_number, student_user_id, student_id, student_name, student_email,
        section_code, exam_term_id, exam_term_name, course_id, course_code, course_title,
        exam_date, exam_time, current_due_amount, due_notes, status, courses_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?)
    `);

    const result = insertStmt.run(
      requestNumber,
      studentUser.id,
      studentUser.student_id,
      studentUser.name,
      studentUser.email,
      studentUser.section_code || '10/A',
      examTerm.id,
      examTerm.name,
      primaryCourse.id,
      combinedCodes,
      combinedTitles,
      combinedDates,
      combinedTimes,
      numericDue,
      due_notes ? due_notes.trim() : null,
      coursesJson
    );

    const createdRequest = db.prepare('SELECT * FROM permission_requests WHERE id = ?').get(result.lastInsertRowid);

    return res.status(201).json({
      message: `Permission request for ${courseList.length} course(s) submitted successfully. It will be reviewed by the Permission Granting Committee.`,
      request: createdRequest,
      selectedCourses: courseList,
    });
  } catch (err) {
    console.error('Submit request error:', err);
    return res.status(500).json({ error: 'Failed to submit permission request.' });
  }
}

// 3. Get Admit Card Data (Only if APPROVED)
async function getAdmitCardData(req, res) {
  try {
    const studentUser = req.user;
    const requestId = req.params.requestId;

    const request = db.prepare(`
      SELECT * FROM permission_requests 
      WHERE id = ? AND student_user_id = ?
    `).get(requestId, studentUser.id);

    if (!request) {
      return res.status(404).json({ error: 'Permission request not found.' });
    }

    if (request.status !== 'APPROVED') {
      return res.status(403).json({
        error: `Cannot generate admit card: Permission status is currently '${request.status}'.`,
      });
    }

    // Parse all approved courses
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

    // Build verification URL for QR Code
    const host = req.get('host') || 'localhost:3000';
    const protocol = req.protocol || 'http';
    const verifyUrl = `${protocol}://${host}/verify.html?token=${request.admit_card_token}`;

    const qrDataUrl = await generateQRCodeDataURL(verifyUrl);

    return res.json({
      admitCard: {
        token: request.admit_card_token,
        requestNumber: request.request_number,
        studentName: request.student_name,
        studentId: request.student_id,
        studentEmail: request.student_email,
        sectionCode: request.section_code,
        examTerm: request.exam_term_name,
        courseCode: request.course_code,
        courseTitle: request.course_title,
        examDate: request.exam_date,
        examTime: request.exam_time,
        courses: coursesList,
        approvedBy: request.reviewed_by_name || 'Permission Granting Committee',
        approvedAt: request.reviewed_at,
        committeeRemarks: request.review_remarks,
        currentDueDeclared: request.current_due_amount,
        verificationUrl: verifyUrl,
        qrCodeImage: qrDataUrl,
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error('Admit card data error:', err);
    return res.status(500).json({ error: 'Failed to retrieve admit card data.' });
  }
}

module.exports = {
  getStudentDashboard,
  submitPermissionRequest,
  getAdmitCardData,
};
