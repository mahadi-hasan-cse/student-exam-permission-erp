const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const bcrypt = require('bcryptjs');

const dbPath = path.resolve(__dirname, '../../erp.db');
const db = new DatabaseSync(dbPath);

db.exec('PRAGMA foreign_keys = ON;');

function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      semester INTEGER NOT NULL,
      section_letter TEXT NOT NULL,
      code TEXT NOT NULL UNIQUE,
      department TEXT DEFAULT 'Department of Computer Science & Engineering (CSE)',
      cr_user_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id TEXT UNIQUE,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT,
      role TEXT NOT NULL CHECK(role IN ('SUPER_ADMIN', 'CR_ADMIN', 'COMMITTEE', 'STUDENT')),
      section_code TEXT,
      status TEXT DEFAULT 'ACTIVE',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS exam_terms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS courses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      credits INTEGER DEFAULT 3,
      semester INTEGER DEFAULT 10,
      scheduled_date TEXT,
      scheduled_time TEXT,
      program_type TEXT DEFAULT 'Day Program'
    );
  `);

  // Column migrations if table already existed
  try { db.exec('ALTER TABLE courses ADD COLUMN scheduled_date TEXT;'); } catch (e) {}
  try { db.exec('ALTER TABLE courses ADD COLUMN scheduled_time TEXT;'); } catch (e) {}
  try { db.exec('ALTER TABLE courses ADD COLUMN program_type TEXT DEFAULT "Day Program";'); } catch (e) {}

  db.exec(`

    CREATE TABLE IF NOT EXISTS permission_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_number TEXT UNIQUE,
      student_user_id INTEGER NOT NULL,
      student_id TEXT NOT NULL,
      student_name TEXT NOT NULL,
      student_email TEXT NOT NULL,
      section_code TEXT NOT NULL,
      exam_term_id INTEGER NOT NULL,
      exam_term_name TEXT NOT NULL,
      course_id INTEGER NOT NULL,
      course_code TEXT NOT NULL,
      course_title TEXT NOT NULL,
      exam_date TEXT NOT NULL,
      exam_time TEXT NOT NULL,
      current_due_amount REAL NOT NULL,
      due_notes TEXT,
      status TEXT DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'APPROVED', 'REJECTED')),
      reviewed_by_id INTEGER,
      reviewed_by_name TEXT,
      review_remarks TEXT,
      reviewed_at DATETIME,
      admit_card_token TEXT UNIQUE,
      courses_json TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  try { db.exec('ALTER TABLE permission_requests ADD COLUMN courses_json TEXT;'); } catch (e) {}

  seedInitialData();
}

function seedInitialData() {
  // Check if Northern University data is already populated
  const existingCourses = db.prepare('SELECT COUNT(*) as count FROM courses').get().count;
  if (existingCourses > 10) return;

  console.log('[DB] Seeding Northern University Bangladesh (NUB) Fall-2026 data...');

  // Reset and populate courses with exact official exam schedules
  db.exec('DELETE FROM courses;');

  const insertCourse = db.prepare(`
    INSERT INTO courses (code, title, credits, semester, scheduled_date, scheduled_time, program_type)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  // --- 10th Semester Courses (e.g. for Section 10/A) ---
  insertCourse.run('CSE 4241', 'VLSI Design', 3, 10, '2026-11-01', '10:30 AM - 12:00 PM', 'Day Program');
  insertCourse.run('CSE 4349', 'Management Information System', 3, 10, '2026-11-02', '10:30 AM - 12:00 PM', 'Day Program');
  insertCourse.run('CSE 4355', 'Artificial Intelligence and Expert Systems', 3, 10, '2026-11-03', '02:00 PM - 03:30 PM', 'Day Program');

  // --- Official Fall 2026 Midterm Schedule: Day Program ---
  // Wednesday 28-10-2026
  insertCourse.run('MATH 2103', 'Mathematics III (Matrices, Vectors & Coordinate Geometry)', 3, 5, '2026-10-28', '10:30 AM - 12:00 PM', 'Day Program');
  insertCourse.run('CSE 3124', 'Microprocessor and Assembly Language Programming', 3, 7, '2026-10-28', '10:30 AM - 12:00 PM', 'Day Program');
  insertCourse.run('CSE 4136', 'Computer Networks', 3, 9, '2026-10-28', '10:30 AM - 12:00 PM', 'Day Program');
  insertCourse.run('CSE 1307', 'Object-Oriented Programming I (C++)', 3, 4, '2026-10-28', '02:00 PM - 03:30 PM', 'Day Program');
  insertCourse.run('MATH 2305', 'Mathematics V (Statistics and Probability)', 3, 6, '2026-10-28', '02:00 PM - 03:30 PM', 'Day Program');
  insertCourse.run('CSE 3333', 'Object-Oriented Programming II (Java)', 3, 8, '2026-10-28', '02:00 PM - 03:30 PM', 'Day Program');

  // Thursday 29-10-2026
  insertCourse.run('MATH 1302', 'Mathematics II (Differential Equations and Fourier Analysis)', 3, 2, '2026-10-29', '10:30 AM - 12:00 PM', 'Day Program');
  insertCourse.run('CSE 3170', 'Computer Architecture', 3, 7, '2026-10-29', '10:30 AM - 12:00 PM', 'Day Program');
  insertCourse.run('CSE 3226', 'Mathematical Analysis for Computer Science', 3, 9, '2026-10-29', '10:30 AM - 12:00 PM', 'Day Program');
  insertCourse.run('CSE 4351', 'Image Processing and Computer Vision', 3, 11, '2026-10-29', '10:30 AM - 12:00 PM', 'Day Program');
  insertCourse.run('CSE 2317', 'Digital Electronic and Pulse Technique', 3, 6, '2026-10-29', '02:00 PM - 03:30 PM', 'Day Program');
  insertCourse.run('CSE 3228', 'Compiler Design', 3, 8, '2026-10-29', '02:00 PM - 03:30 PM', 'Day Program');

  // Sunday 01-11-2026
  insertCourse.run('CSE 1101', 'Introduction to Computers', 3, 1, '2026-11-01', '10:30 AM - 12:00 PM', 'Day Program');
  insertCourse.run('PHY 1201', 'Physics I (Heat, Thermodynamics, Waves & Oscillations)', 3, 3, '2026-11-01', '10:30 AM - 12:00 PM', 'Day Program');
  insertCourse.run('CSE 1102', 'Structured Programming Language', 3, 2, '2026-11-01', '02:00 PM - 03:30 PM', 'Day Program');
  insertCourse.run('CSE 3227', 'Data Communication', 3, 7, '2026-11-01', '02:00 PM - 03:30 PM', 'Day Program');
  insertCourse.run('CSE 3230', 'Software Engineering', 3, 9, '2026-11-01', '02:00 PM - 03:30 PM', 'Day Program');

  // Monday 02-11-2026
  insertCourse.run('ENG 1203', 'Reading and Writing', 3, 3, '2026-11-02', '10:30 AM - 12:00 PM', 'Day Program');
  insertCourse.run('CHE 2103', 'Chemistry', 3, 8, '2026-11-02', '10:30 AM - 12:00 PM', 'Day Program');
  insertCourse.run('GED 1202', 'Emergence of Bangladesh', 3, 1, '2026-11-02', '10:30 AM - 12:00 PM', 'Day Program');
  insertCourse.run('CSE 2215', 'Digital Logic Design', 3, 4, '2026-11-02', '02:00 PM - 03:30 PM', 'Day Program');
  insertCourse.run('CSE 2319', 'Database Management System', 3, 6, '2026-11-02', '02:00 PM - 03:30 PM', 'Day Program');

  // Tuesday 03-11-2026
  insertCourse.run('CSE 1258', 'Discrete Mathematics', 3, 2, '2026-11-03', '10:30 AM - 12:00 PM', 'Day Program');
  insertCourse.run('PHY 1302', 'Physics II (Electromagnetism and Optics)', 3, 4, '2026-11-03', '10:30 AM - 12:00 PM', 'Day Program');
  insertCourse.run('BANG 1101', 'Bangla Language and Literature', 3, 6, '2026-11-03', '10:30 AM - 12:00 PM', 'Day Program');
  insertCourse.run('ENG 1100', 'Sentences and Their Elements', 3, 1, '2026-11-03', '10:30 AM - 12:00 PM', 'Day Program');
  insertCourse.run('CSE 1205', 'Electrical Engineering and Circuit Analysis', 3, 3, '2026-11-03', '02:00 PM - 03:30 PM', 'Day Program');
  insertCourse.run('CSE 2109', 'Electronic Engineering', 3, 5, '2026-11-03', '02:00 PM - 03:30 PM', 'Day Program');
  insertCourse.run('HUM 3302', 'Financial and Management Accounting', 3, 11, '2026-11-03', '02:00 PM - 03:30 PM', 'Day Program');

  // Wednesday 04-11-2026
  insertCourse.run('MATH 1101', 'Mathematics I (Differential Calculus & Integral Calculus)', 3, 1, '2026-11-04', '10:30 AM - 12:00 PM', 'Day Program');
  insertCourse.run('CSE 2111', 'Data Structure', 3, 3, '2026-11-04', '10:30 AM - 12:00 PM', 'Day Program');
  insertCourse.run('CSE 4138', 'Computer Peripherals and Interfacing', 3, 12, '2026-11-04', '10:30 AM - 12:00 PM', 'Day Program');
  insertCourse.run('ENG 1102', 'English Language II: Listening and Speaking', 3, 2, '2026-11-04', '02:00 PM - 03:30 PM', 'Day Program');
  insertCourse.run('HUM 1301', 'Economics', 3, 4, '2026-11-04', '02:00 PM - 03:30 PM', 'Day Program');

  // Update Exam Term to official name
  db.prepare("UPDATE exam_terms SET name = 'Midterm Examination, Fall-2026' WHERE id = 1;").run();

  // Update default users with official names from the notification
  db.prepare(`
    UPDATE users 
    SET name = 'Md. Raihan-ul-Masood (Head, CSE)' 
    WHERE role = 'SUPER_ADMIN';
  `).run();

  db.prepare(`
    UPDATE users 
    SET name = 'Muhammed Samsuddoha Alam (Coordinator, CSE)' 
    WHERE role = 'COMMITTEE';
  `).run();

  console.log('[DB] Northern University Bangladesh Fall-2026 Schedule successfully seeded.');
}

module.exports = {
  db,
  initDatabase,
};
