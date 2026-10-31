const crypto = require('node:crypto');
const { db } = require('../config/database');

// 1. Get Committee Dashboard and incoming permission requests
async function getCommitteeDashboard(req, res) {
  try {
    const { section, status, term, search } = req.query;

    let query = `
      SELECT 
        pr.*, 
        s.department 
      FROM permission_requests pr
      LEFT JOIN sections s ON pr.section_code = s.code
      WHERE 1=1
    `;
    const params = [];

    if (section && section !== 'ALL') {
      query += ` AND pr.section_code = ?`;
      params.push(section);
    }

    if (status && status !== 'ALL') {
      query += ` AND pr.status = ?`;
      params.push(status);
    }

    if (term && term !== 'ALL') {
      query += ` AND pr.exam_term_name = ?`;
      params.push(term);
    }

    if (search && search.trim() !== '') {
      query += ` AND (pr.student_id LIKE ? OR pr.student_name LIKE ? OR pr.course_code LIKE ? OR pr.request_number LIKE ?)`;
      const s = `%${search.trim()}%`;
      params.push(s, s, s, s);
    }

    query += ` ORDER BY pr.id DESC`;

    const requests = db.prepare(query).all(...params);

    // Aggregate statistics
    const stats = db.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'APPROVED' THEN 1 ELSE 0 END) as approved,
        SUM(CASE WHEN status = 'REJECTED' THEN 1 ELSE 0 END) as rejected,
        SUM(current_due_amount) as total_dues_declared
      FROM permission_requests
    `).get();

    // Distinct filter lists
    const sections = db.prepare('SELECT DISTINCT code FROM sections ORDER BY code ASC').all();
    const terms = db.prepare('SELECT DISTINCT name FROM exam_terms WHERE is_active = 1').all();

    return res.json({
      requests,
      stats: {
        total: stats.total || 0,
        pending: stats.pending || 0,
        approved: stats.approved || 0,
        rejected: stats.rejected || 0,
        total_dues_declared: stats.total_dues_declared || 0,
      },
      filters: {
        sections: sections.map((s) => s.code),
        terms: terms.map((t) => t.name),
      },
    });
  } catch (err) {
    console.error('Committee dashboard error:', err);
    return res.status(500).json({ error: 'Failed to load committee dashboard.' });
  }
}

// 2. Approve Request -> Auto-generates Admit Card Token
async function approveRequest(req, res) {
  try {
    const committeeUser = req.user;
    const { requestId } = req.params;
    const { remarks } = req.body;

    const request = db.prepare('SELECT * FROM permission_requests WHERE id = ?').get(requestId);
    if (!request) {
      return res.status(404).json({ error: 'Permission request not found.' });
    }

    if (request.status === 'APPROVED') {
      return res.status(400).json({ error: 'This request is already approved.' });
    }

    // Auto-generate unique secure token for the Admit Card QR verification
    const admitCardToken = crypto.randomUUID();
    const reviewedAt = new Date().toISOString();
    const finalRemarks = remarks && remarks.trim() ? remarks.trim() : 'Approved for examination by Committee.';

    db.prepare(`
      UPDATE permission_requests 
      SET 
        status = 'APPROVED',
        reviewed_by_id = ?,
        reviewed_by_name = ?,
        review_remarks = ?,
        reviewed_at = ?,
        admit_card_token = ?
      WHERE id = ?
    `).run(committeeUser.id, committeeUser.name, finalRemarks, reviewedAt, admitCardToken, requestId);

    const updated = db.prepare('SELECT * FROM permission_requests WHERE id = ?').get(requestId);

    return res.json({
      message: `Request ${request.request_number} APPROVED. Temporary Admit Card has been generated.`,
      request: updated,
    });
  } catch (err) {
    console.error('Approve request error:', err);
    return res.status(500).json({ error: 'Failed to approve request.' });
  }
}

// 3. Reject Request
async function rejectRequest(req, res) {
  try {
    const committeeUser = req.user;
    const { requestId } = req.params;
    const { remarks } = req.body;

    if (!remarks || !remarks.trim()) {
      return res.status(400).json({ error: 'Rejection requires a reason/remark for the student.' });
    }

    const request = db.prepare('SELECT * FROM permission_requests WHERE id = ?').get(requestId);
    if (!request) {
      return res.status(404).json({ error: 'Permission request not found.' });
    }

    const reviewedAt = new Date().toISOString();

    db.prepare(`
      UPDATE permission_requests 
      SET 
        status = 'REJECTED',
        reviewed_by_id = ?,
        reviewed_by_name = ?,
        review_remarks = ?,
        reviewed_at = ?,
        admit_card_token = NULL
      WHERE id = ?
    `).run(committeeUser.id, committeeUser.name, remarks.trim(), reviewedAt, requestId);

    const updated = db.prepare('SELECT * FROM permission_requests WHERE id = ?').get(requestId);

    return res.json({
      message: `Request ${request.request_number} has been rejected.`,
      request: updated,
    });
  } catch (err) {
    console.error('Reject request error:', err);
    return res.status(500).json({ error: 'Failed to reject request.' });
  }
}

module.exports = {
  getCommitteeDashboard,
  approveRequest,
  rejectRequest,
};
