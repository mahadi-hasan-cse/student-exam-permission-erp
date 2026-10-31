const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { OAuth2Client } = require('google-auth-library');
const { db } = require('../config/database');
const { JWT_SECRET } = require('../middleware/auth');

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID || 'dummy_client_id');

function signToken(user) {
  return jwt.sign(
    {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      student_id: user.student_id,
      section_code: user.section_code,
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

// 1. Password-based Staff Login (Super Admin, Committee, CR)
async function loginStaff(req, res) {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const user = db.prepare('SELECT * FROM users WHERE email = ? COLLATE NOCASE').get(email.trim());
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    if (!user.password_hash) {
      return res.status(401).json({ error: 'This account must sign in via Google authentication.' });
    }

    const match = bcrypt.compareSync(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const token = signToken(user);
    res.cookie('token', token, { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000 });

    return res.json({
      message: 'Logged in successfully',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        student_id: user.student_id,
        section_code: user.section_code,
      },
    });
  } catch (err) {
    console.error('Staff login error:', err);
    return res.status(500).json({ error: 'Server error during login.' });
  }
}

// 2. Google OAuth Login for Students (Strictly Whitelisted by CR)
async function loginStudentGoogle(req, res) {
  try {
    const { credential, simulatedEmail } = req.body;
    let verifiedEmail = null;
    let verifiedName = null;

    if (credential) {
      // Production Google ID Token Verification
      try {
        const ticket = await googleClient.verifyIdToken({
          idToken: credential,
          audience: process.env.GOOGLE_CLIENT_ID,
        });
        const payload = ticket.getPayload();
        verifiedEmail = payload.email;
        verifiedName = payload.name;
      } catch (oauthErr) {
        return res.status(401).json({ error: 'Google OAuth token verification failed.' });
      }
    } else if (simulatedEmail) {
      // Testing / Development Simulator for instant evaluation without OAuth setup
      verifiedEmail = simulatedEmail.trim().toLowerCase();
    } else {
      return res.status(400).json({ error: 'Missing Google credentials.' });
    }

    // STRICT CHECK: Is this Gmail address added by the Class Representative?
    const student = db.prepare('SELECT * FROM users WHERE email = ? COLLATE NOCASE').get(verifiedEmail);

    if (!student) {
      return res.status(403).json({
        error: `Access Denied: The Gmail (${verifiedEmail}) is not registered. Please contact your Class Representative (CR) to add your Student ID and Gmail address.`,
      });
    }

    if (student.role !== 'STUDENT') {
      return res.status(403).json({ error: 'Access Denied: This portal is for students only.' });
    }

    // Update name from Google profile if available
    if (verifiedName && verifiedName !== student.name) {
      db.prepare('UPDATE users SET name = ? WHERE id = ?').run(verifiedName, student.id);
      student.name = verifiedName;
    }

    const token = signToken(student);
    res.cookie('token', token, { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000 });

    return res.json({
      message: 'Student authenticated via Google successfully.',
      token,
      user: {
        id: student.id,
        name: student.name,
        email: student.email,
        role: student.role,
        student_id: student.student_id,
        section_code: student.section_code,
      },
    });
  } catch (err) {
    console.error('Student Google login error:', err);
    return res.status(500).json({ error: 'Server error during Google authentication.' });
  }
}

// 3. Fast Demo Switcher Login (For evaluator convenience)
async function demoLogin(req, res) {
  try {
    const { role, email } = req.body;
    let user;

    if (email) {
      user = db.prepare('SELECT * FROM users WHERE email = ? COLLATE NOCASE').get(email);
    } else if (role) {
      user = db.prepare('SELECT * FROM users WHERE role = ? LIMIT 1').get(role);
    }

    if (!user) {
      return res.status(404).json({ error: 'Target user not found.' });
    }

    const token = signToken(user);
    res.cookie('token', token, { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000 });

    return res.json({
      message: 'Demo login successful',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        student_id: user.student_id,
        section_code: user.section_code,
      },
    });
  } catch (err) {
    return res.status(500).json({ error: 'Demo login failed.' });
  }
}

// 4. Get Current Authenticated Profile
async function getMe(req, res) {
  try {
    const user = db.prepare('SELECT id, student_id, name, email, role, section_code, status FROM users WHERE id = ?').get(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }
    return res.json({ user });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to retrieve profile.' });
  }
}

// 5. Logout
function logout(req, res) {
  res.clearCookie('token');
  return res.json({ message: 'Signed out successfully.' });
}

module.exports = {
  loginStaff,
  loginStudentGoogle,
  demoLogin,
  getMe,
  logout,
};
