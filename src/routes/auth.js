const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuid } = require('uuid');
const db = require('../config/db');
const auth = require('../middleware/auth');

function signAccess(user) {
  return jwt.sign(
    { id: user.id, role: user.role, name: user.name, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '15m' }
  );
}
function signRefresh(userId) {
  return jwt.sign({ id: userId }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  });
}

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { name, email, phone, password, parent_name, parent_phone, date_of_birth, address } = req.body;
    if (!name || !email || !phone || !password)
      return res.status(400).json({ error: 'Required fields missing' });

    const exists = await db.query('SELECT id FROM users WHERE email=$1', [email]);
    if (exists.rows.length) return res.status(409).json({ error: 'Email already registered' });

    const hash = await bcrypt.hash(password, 10);
    const { rows } = await db.query(
      `INSERT INTO users (name,email,phone,password_hash,role,status,parent_name,parent_phone,date_of_birth,address)
       VALUES ($1,$2,$3,$4,'student','pending',$5,$6,$7,$8) RETURNING id,name,email,status`,
      [name, email, phone, hash, parent_name, parent_phone, date_of_birth, address]
    );

    // Create student profile
    await db.query('INSERT INTO student_profiles (user_id) VALUES ($1)', [rows[0].id]);

    // Notify admins
    await db.query(
      `INSERT INTO notifications (user_id, type, title, body)
       SELECT id, 'registration', 'New Registration', $1 FROM users WHERE role='admin'`,
      [`New student registration: ${name} (${email}). Pending approval.`]
    );

    res.status(201).json({ message: 'Registration submitted. Await admin approval.', user: rows[0] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const { rows } = await db.query(
      'SELECT id,name,email,phone,role,status,password_hash FROM users WHERE email=$1',
      [email]
    );
    const user = rows[0];
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    if (user.status === 'pending')
      return res.status(403).json({ error: 'Account pending admin approval' });
    if (user.status === 'suspended')
      return res.status(403).json({ error: 'Account suspended' });

    // LOCAL DEVELOPMENT: Bypass password check
    if (process.env.ENV_TYPE !== 'local') {
      const valid = await bcrypt.compare(password, user.password_hash);
      if (!valid) return res.status(401).json({ error: 'Invalid credentials' });
    } else {
      console.warn('⚠️ LOCAL MODE: Password check bypassed. Accept any password.');
    }

    const accessToken = signAccess(user);
    const refreshToken = signRefresh(user.id);

    await db.query(
      `INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1,$2,NOW()+INTERVAL '7 days')`,
      [user.id, refreshToken]
    );

    const { password_hash, ...safeUser } = user;
    res.json({ accessToken, refreshToken, user: safeUser });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/auth/refresh
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(401).json({ error: 'No refresh token' });

    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    const { rows } = await db.query(
      'SELECT * FROM refresh_tokens WHERE user_id=$1 AND token=$2 AND expires_at > NOW()',
      [decoded.id, refreshToken]
    );
    if (!rows.length) return res.status(401).json({ error: 'Invalid refresh token' });

    const { rows: users } = await db.query(
      'SELECT id,name,email,role,status FROM users WHERE id=$1',
      [decoded.id]
    );
    const accessToken = signAccess(users[0]);
    res.json({ accessToken });
  } catch (e) {
    res.status(401).json({ error: 'Invalid refresh token' });
  }
});

// POST /api/auth/logout
router.post('/logout', auth(), async (req, res) => {
  await db.query('DELETE FROM refresh_tokens WHERE user_id=$1', [req.user.id]);
  res.json({ message: 'Logged out' });
});

// GET /api/auth/me
router.get('/me', auth(), async (req, res) => {
  const { rows } = await db.query(
    `SELECT u.id,u.name,u.email,u.phone,u.role,u.status,u.parent_name,u.parent_phone,u.address,u.date_of_birth,
            sp.level_id,sp.batch_time,sp.enrollment_date,l.name as level_name
     FROM users u
     LEFT JOIN student_profiles sp ON sp.user_id=u.id
     LEFT JOIN levels l ON l.id=sp.level_id
     WHERE u.id=$1`,
    [req.user.id]
  );
  res.json(rows[0]);
});

module.exports = router;
