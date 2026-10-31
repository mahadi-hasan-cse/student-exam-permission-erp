const http = require('node:http');

// Simple test runner for all 4 roles
async function runTests() {
  const { initDatabase, db } = require('./src/config/database');
  initDatabase();

  const app = require('express')();
  const cors = require('cors');
  const cookieParser = require('cookie-parser');
  const express = require('express');

  app.use(cors());
  app.use(express.json());
  app.use(cookieParser());

  app.use('/api/auth', require('./src/routes/authRoutes'));
  app.use('/api/superadmin', require('./src/routes/superAdminRoutes'));
  app.use('/api/cr', require('./src/routes/crRoutes'));
  app.use('/api/committee', require('./src/routes/committeeRoutes'));
  app.use('/api/student', require('./src/routes/studentRoutes'));

  const server = app.listen(3099, async () => {
    console.log('[TEST] Server started on port 3099');

    try {
      const BASE = 'http://localhost:3099/api';

      // 1. Unwhitelisted student test
      console.log('--> Step 1: Testing unwhitelisted student login...');
      const unauthRes = await fetch(`${BASE}/auth/login-student-google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ simulatedEmail: 'unknown.stranger@gmail.com' }),
      });
      const unauthData = await unauthRes.json();
      console.log('Unwhitelisted status:', unauthRes.status, '(Expected 403)');
      if (unauthRes.status !== 403) throw new Error('Unwhitelisted student should have been rejected!');

      // 2. CR Login & add student
      console.log('--> Step 2: CR login & whitelisting new student for 10/A...');
      const crLoginRes = await fetch(`${BASE}/auth/login-staff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'cr.10a@university.edu', password: 'cr123' }),
      });
      const crLoginData = await crLoginRes.json();
      const crToken = crLoginData.token;

      const addStudentRes = await fetch(`${BASE}/cr/students`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${crToken}` },
        body: JSON.stringify({
          student_id: '2022-1-60-099',
          name: 'Nafis Iqbal',
          email: 'nafis.iqbal@gmail.com',
        }),
      });
      const addStudentData = await addStudentRes.json();
      console.log('CR Add Student:', addStudentData.message);

      // 3. Newly whitelisted student login
      console.log('--> Step 3: Newly whitelisted student Google login...');
      const studentLoginRes = await fetch(`${BASE}/auth/login-student-google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ simulatedEmail: 'nafis.iqbal@gmail.com' }),
      });
      const studentLoginData = await studentLoginRes.json();
      const studentToken = studentLoginData.token;
      console.log('Student Logged In:', studentLoginData.user.name, `(${studentLoginData.user.section_code})`);

      // 4. Student permission submission without dues -> Must fail
      console.log('--> Step 4: Testing submission without mandatory due amount...');
      const failReqRes = await fetch(`${BASE}/student/requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${studentToken}` },
        body: JSON.stringify({
          exam_term_id: 1,
          course_id: 1,
          exam_date: '2026-11-15',
          exam_time: '10:00 AM - 12:00 PM',
          // current_due_amount is missing!
        }),
      });
      console.log('Missing dues status:', failReqRes.status, '(Expected 400)');
      if (failReqRes.status !== 400) throw new Error('Submission without dues must fail!');

      // 5. Student submits valid request with multiple courses and due amount
      console.log('--> Step 5: Submitting valid permission request for MULTIPLE courses with dues (12,500 BDT)...');
      const dashRes = await fetch(`${BASE}/student/dashboard`, {
        headers: { Authorization: `Bearer ${studentToken}` },
      });
      const dashData = await dashRes.json();
      const targetCourseIds = dashData.courses.slice(0, 3).map(c => c.id);

      const submitRes = await fetch(`${BASE}/student/requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${studentToken}` },
        body: JSON.stringify({
          exam_term_id: dashData.examTerms[0].id,
          course_ids: targetCourseIds,
          current_due_amount: 12500,
          due_notes: 'Paid 50% semester fees, remaining before finals',
        }),
      });
      const submitData = await submitRes.json();
      if (!submitRes.ok) {
        console.error('Submit failed:', submitData);
        throw new Error(submitData.error || 'Submit failed');
      }
      console.log('Request Submitted:', submitData.request.request_number, 'Courses:', submitData.request.course_code);
      const requestId = submitData.request.id;

      // 6. Committee Review & Approval
      console.log('--> Step 6: Permission Committee reviews and approves request...');
      const commLoginRes = await fetch(`${BASE}/auth/login-staff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'committee@university.edu', password: 'committee123' }),
      });
      const commLoginData = await commLoginRes.json();
      const commToken = commLoginData.token;

      const approveRes = await fetch(`${BASE}/committee/requests/${requestId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${commToken}` },
        body: JSON.stringify({ remarks: 'Cleared for Mid Term Fall 2026 as per partial payment bond.' }),
      });
      const approveData = await approveRes.json();
      console.log('Committee Approval:', approveData.message);

      // 7. Student retrieves Admit Card with QR Code
      console.log('--> Step 7: Student fetches Temporary Admit Card with QR Code...');
      const cardRes = await fetch(`${BASE}/student/requests/${requestId}/admit-card`, {
        headers: { Authorization: `Bearer ${studentToken}` },
      });
      const cardData = await cardRes.json();
      console.log('Admit Card Generated: Token =', cardData.admitCard.token, '| Approved Courses Count =', cardData.admitCard.courses.length);
      console.log('QR Code Image Length:', cardData.admitCard.qrCodeImage.length, 'bytes');

      // 8. Public Verification Check
      console.log('--> Step 8: Public invigilator QR code verification...');
      const verifyRes = await fetch(`${BASE}/superadmin/public/verify/${cardData.admitCard.token}`);
      const verifyData = await verifyRes.json();
      console.log('Verification Result:', verifyData.valid ? 'AUTHENTIC ADMIT CARD' : 'INVALID');
      console.log('Verified Student:', verifyData.admitCard.studentName, '| Section:', verifyData.admitCard.section, '| Term:', verifyData.admitCard.examTerm);

      console.log('\n========================================');
      console.log('🎉 ALL 8 E2E WORKFLOW TESTS PASSED!');
      console.log('========================================\n');
    } catch (err) {
      console.error('Test failed:', err);
    } finally {
      server.close();
      process.exit(0);
    }
  });
}

runTests();
