const router = require('express').Router();
const db = require('../config/db');
const auth = require('../middleware/auth');
const { sendWhatsApp, sendApprovalNotification } = require('../services/whatsapp');
const { generateTestFromBank, getAvailableDifficulties, canGenerateTest } = require('../services/testGenerator');

const adminAuth = auth(['admin', 'superadmin']);

// GET /api/admin/dashboard
router.get('/dashboard', adminAuth, async (req, res) => {
  try {
    const [students, pending, fees, revenue] = await Promise.all([
      db.query(`SELECT COUNT(*) FROM users WHERE role='student' AND status='active'`),
      db.query(`SELECT COUNT(*) FROM users WHERE role='student' AND status='pending'`),
      db.query(`SELECT COALESCE(SUM(amount_due-amount_paid),0) AS total_pending FROM fee_records WHERE status IN ('pending','overdue','partial')`),
      db.query(`SELECT
        DATE_TRUNC('month', paid_date) AS month,
        SUM(amount_paid) AS revenue
        FROM fee_records WHERE paid_date IS NOT NULL
        GROUP BY 1 ORDER BY 1 DESC LIMIT 12`),
    ]);
    const levelStats = await db.query(`
      SELECT l.name as level, COUNT(sp.user_id) as count
      FROM levels l LEFT JOIN student_profiles sp ON sp.level_id=l.id
      LEFT JOIN users u ON u.id=sp.user_id AND u.status='active'
      GROUP BY l.id,l.name ORDER BY l.sort_order`);

    res.json({
      totalStudents: +students.rows[0].count,
      pendingApprovals: +pending.rows[0].count,
      totalFeePending: +fees.rows[0].total_pending,
      revenueByMonth: revenue.rows,
      levelDistribution: levelStats.rows,
    });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});

// GET /api/admin/students
router.get('/students', adminAuth, async (req, res) => {
  try {
    const { status, level_id, search, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    let where = [`u.role='student'`];
    const params = [];
    if (status) { params.push(status); where.push(`u.status=$${params.length}`); }
    if (level_id) { params.push(level_id); where.push(`sp.level_id=$${params.length}`); }
    if (search) { params.push(`%${search}%`); where.push(`(u.name ILIKE $${params.length} OR u.phone ILIKE $${params.length} OR u.email ILIKE $${params.length})`); }

    const whereStr = where.join(' AND ');
    params.push(limit, offset);

    const { rows } = await db.query(`
      SELECT u.id,u.name,u.email,u.phone,u.status,u.created_at,
             sp.level_id,sp.batch_time,sp.enrollment_date,l.name as level_name,
             COALESCE(SUM(fr.amount_paid),0) as total_paid,
             COALESCE(SUM(CASE WHEN fr.status IN ('pending','overdue','partial') THEN fr.amount_due-fr.amount_paid ELSE 0 END),0) as total_pending
      FROM users u
      LEFT JOIN student_profiles sp ON sp.user_id=u.id
      LEFT JOIN levels l ON l.id=sp.level_id
      LEFT JOIN fee_records fr ON fr.student_id=u.id
      WHERE ${whereStr}
      GROUP BY u.id,sp.level_id,sp.batch_time,sp.enrollment_date,l.name
      ORDER BY u.created_at DESC
      LIMIT $${params.length-1} OFFSET $${params.length}`,
      params
    );

    const total = await db.query(`SELECT COUNT(*) FROM users u LEFT JOIN student_profiles sp ON sp.user_id=u.id WHERE ${whereStr}`,
      params.slice(0, -2));

    res.json({ students: rows, total: +total.rows[0].count, page: +page, limit: +limit });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});

// GET /api/admin/students/:id
router.get('/students/:id', adminAuth, async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT u.*,sp.level_id,sp.batch_time,sp.enrollment_date,l.name as level_name
      FROM users u
      LEFT JOIN student_profiles sp ON sp.user_id=u.id
      LEFT JOIN levels l ON l.id=sp.level_id
      WHERE u.id=$1`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });

    const fees = await db.query(`SELECT * FROM fee_records WHERE student_id=$1 ORDER BY month_year DESC`, [req.params.id]);
    const attempts = await db.query(`
      SELECT ta.*,t.title,t.total_marks FROM test_attempts ta
      JOIN tests t ON t.id=ta.test_id WHERE ta.student_id=$1 ORDER BY ta.submitted_at DESC`, [req.params.id]);

    res.json({ student: rows[0], fees: fees.rows, testAttempts: attempts.rows });
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// PATCH /api/admin/students/:id/approve
router.patch('/students/:id/approve', adminAuth, async (req, res) => {
  try {
    const { level_id, batch_time, course_id } = req.body;
    await db.query(`UPDATE users SET status='active' WHERE id=$1`, [req.params.id]);
    await db.query(
      `UPDATE student_profiles SET level_id=$1,batch_time=$2,approved_by=$3,approved_at=NOW() WHERE user_id=$4`,
      [level_id, batch_time, req.user.id, req.params.id]
    );
    if (course_id) {
      await db.query(
        `INSERT INTO student_courses (student_id,course_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
        [req.params.id, course_id]
      );
    }
    // Notify student
    await db.query(
      `INSERT INTO notifications (user_id,type,title,body) VALUES ($1,'approval','Registration Approved','Your account has been approved! You can now login.')`,
      [req.params.id]
    );
    const { rows } = await db.query('SELECT name,phone FROM users WHERE id=$1', [req.params.id]);
    await sendApprovalNotification(rows[0]);

    res.json({ message: 'Student approved' });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});

// PATCH /api/admin/students/:id/suspend
router.patch('/students/:id/suspend', adminAuth, async (req, res) => {
  await db.query(`UPDATE users SET status='suspended' WHERE id=$1`, [req.params.id]);
  res.json({ message: 'Student suspended' });
});

// PUT /api/admin/students/:id/level
router.put('/students/:id/level', adminAuth, async (req, res) => {
  const { level_id, batch_time } = req.body;
  await db.query(`UPDATE student_profiles SET level_id=$1,batch_time=$2 WHERE user_id=$3`, [level_id, batch_time, req.params.id]);
  res.json({ message: 'Level updated' });
});

// === FEE MANAGEMENT ===

// GET /api/admin/fees
router.get('/fees', adminAuth, async (req, res) => {
  try {
    const { status, month_year, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    let where = ['1=1'];
    const params = [];
    if (status) { params.push(status); where.push(`fr.status=$${params.length}`); }
    if (month_year) { params.push(month_year); where.push(`fr.month_year=$${params.length}`); }

    const { rows } = await db.query(`
      SELECT fr.*,u.name,u.phone,u.email,l.name as level_name
      FROM fee_records fr
      JOIN users u ON u.id=fr.student_id
      LEFT JOIN student_profiles sp ON sp.user_id=u.id
      LEFT JOIN levels l ON l.id=sp.level_id
      WHERE ${where.join(' AND ')}
      ORDER BY fr.due_date DESC
      LIMIT $${params.length+1} OFFSET $${params.length+2}`,
      [...params, limit, offset]
    );
    res.json({ fees: rows });
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// POST /api/admin/fees
router.post('/fees', adminAuth, async (req, res) => {
  try {
    const { student_id, course_id, month_year, amount_due, due_date } = req.body;
    const { rows } = await db.query(
      `INSERT INTO fee_records (student_id,course_id,month_year,amount_due,due_date) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [student_id, course_id, month_year, amount_due, due_date]
    );
    await db.query(
      `INSERT INTO notifications (user_id,type,title,body) VALUES ($1,'fee_reminder','Fee Due','Your fee of ₹${amount_due} is due on ${due_date}')`,
      [student_id]
    );
    res.status(201).json(rows[0]);
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// PATCH /api/admin/fees/:id/collect
router.patch('/fees/:id/collect', adminAuth, async (req, res) => {
  try {
    const { amount_paid, payment_mode, transaction_ref } = req.body;
    const { rows: existing } = await db.query('SELECT * FROM fee_records WHERE id=$1', [req.params.id]);
    if (!existing.length) return res.status(404).json({ error: 'Not found' });
    const fee = existing[0];
    const newPaid = +fee.amount_paid + +amount_paid;
    const status = newPaid >= fee.amount_due ? 'paid' : 'partial';

    const { rows } = await db.query(
      `UPDATE fee_records SET amount_paid=$1,status=$2,paid_date=CURRENT_DATE,payment_mode=$3,transaction_ref=$4 WHERE id=$5 RETURNING *`,
      [newPaid, status, payment_mode, transaction_ref, req.params.id]
    );
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// POST /api/admin/fees/whatsapp-reminder
router.post('/fees/whatsapp-reminder', adminAuth, async (req, res) => {
  try {
    const { student_id, message } = req.body;
    const { rows } = await db.query('SELECT name,phone FROM users WHERE id=$1', [student_id]);
    if (!rows.length) return res.status(404).json({ error: 'Student not found' });
    const result = await sendWhatsApp(rows[0].phone, message || `Dear ${rows[0].name}, you have pending fees. Please contact the academy.`);
    res.json(result);
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// === SCHEDULES ===
router.get('/schedules', adminAuth, async (req, res) => {
  const { rows } = await db.query(
    `SELECT cs.*,l.name as level_name FROM class_schedules cs LEFT JOIN levels l ON l.id=cs.level_id ORDER BY cs.scheduled_at DESC`
  );
  res.json(rows);
});

router.post('/schedules', adminAuth, async (req, res) => {
  try {
    const { title, description, level_id, scheduled_at, duration_minutes, meeting_link } = req.body;
    const { rows } = await db.query(
      `INSERT INTO class_schedules (title,description,level_id,scheduled_at,duration_minutes,meeting_link,created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [title, description, level_id || null, scheduled_at, duration_minutes, meeting_link, req.user.id]
    );
    // Notify students of the level (or all)
    const studentQ = level_id
      ? `SELECT u.id FROM users u JOIN student_profiles sp ON sp.user_id=u.id WHERE sp.level_id=$1 AND u.status='active'`
      : `SELECT id FROM users WHERE role='student' AND status='active'`;
    const { rows: students } = await db.query(studentQ, level_id ? [level_id] : []);
    for (const s of students) {
      await db.query(
        `INSERT INTO notifications (user_id,type,title,body) VALUES ($1,'schedule',$2,$3)`,
        [s.id, `Class Scheduled: ${title}`, `A class "${title}" is scheduled for ${new Date(scheduled_at).toLocaleString('en-IN')}.`]
      );
    }
    res.status(201).json(rows[0]);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});

// === TESTS (admin side) ===
router.get('/tests', adminAuth, async (req, res) => {
  const { rows } = await db.query(
    `SELECT t.*,l.name as level_name,
      (SELECT COUNT(*) FROM test_attempts ta WHERE ta.test_id=t.id AND ta.status='submitted') as submitted_count,
      (SELECT COUNT(*) FROM test_attempts ta WHERE ta.test_id=t.id) as total_attempts
     FROM tests t LEFT JOIN levels l ON l.id=t.level_id ORDER BY t.created_at DESC`
  );
  res.json(rows);
});

router.post('/tests', adminAuth, async (req, res) => {
  try {
    const { title, description, level_id, duration_minutes, total_marks, pass_marks, start_time, end_time, questions } = req.body;
    const { rows } = await db.query(
      `INSERT INTO tests (title,description,level_id,duration_minutes,total_marks,pass_marks,start_time,end_time,created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [title, description, level_id || null, duration_minutes, total_marks, pass_marks, start_time || null, end_time || null, req.user.id]
    );
    const test = rows[0];
    if (questions?.length) {
      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        await db.query(
          `INSERT INTO test_questions (test_id,question_text,option_a,option_b,option_c,option_d,correct_answer,marks,sort_order)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [test.id, q.question_text, q.option_a, q.option_b, q.option_c, q.option_d, q.correct_answer, q.marks || 1, i]
        );
      }
    }
    res.status(201).json(test);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});

router.get('/tests/:id/results', adminAuth, async (req, res) => {
  const { rows } = await db.query(`
    SELECT ta.*,u.name,u.phone,l.name as level_name,sp.level_id
    FROM test_attempts ta
    JOIN users u ON u.id=ta.student_id
    LEFT JOIN student_profiles sp ON sp.user_id=u.id
    LEFT JOIN levels l ON l.id=sp.level_id
    WHERE ta.test_id=$1 ORDER BY ta.score DESC NULLS LAST`,
    [req.params.id]
  );
  res.json(rows);
});

// GET /api/admin/levels
router.get('/levels', adminAuth, async (req, res) => {
  const { rows } = await db.query('SELECT * FROM levels ORDER BY sort_order');
  res.json(rows);
});

// GET /api/admin/courses
router.get('/courses', adminAuth, async (req, res) => {
  const { rows } = await db.query('SELECT c.*,l.name as level_name FROM courses c LEFT JOIN levels l ON l.id=c.level_id ORDER BY c.created_at');
  res.json(rows);
});

// === MOCK TEST GENERATION ===

// GET /api/admin/mock-tests/difficulties/:level_id
router.get('/mock-tests/difficulties/:level_id', adminAuth, async (req, res) => {
  try {
    const difficulties = await getAvailableDifficulties(parseInt(req.params.level_id));
    res.json(difficulties);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/admin/mock-tests/generate
// Request body: { title, description, level_id, difficulty, num_questions, duration_minutes, is_mock }
router.post('/mock-tests/generate', adminAuth, async (req, res) => {
  try {
    const { level_id, num_questions, duration_minutes } = req.body;

    if (!level_id || !num_questions || num_questions < 1) {
      return res.status(400).json({ error: 'Invalid input' });
    }

    // -------------------------------
    // 🔥 QUESTION GENERATOR
    // -------------------------------
    function generateMathQuestion(level) {
      let a, b, question, answer;

      if (level == 1) {
        a = Math.floor(Math.random() * 10);
        b = Math.floor(Math.random() * 10);
        question = `${a} + ${b} = ?`;
        answer = a + b;
      } else if (level == 2) {
        a = Math.floor(Math.random() * 50);
        b = Math.floor(Math.random() * 20);
        question = `${a} - ${b} = ?`;
        answer = a - b;
      } else {
        a = Math.floor(Math.random() * 20);
        b = Math.floor(Math.random() * 10);
        question = `${a} × ${b} = ?`;
        answer = a * b;
      }

      return { question, answer };
    }

    function generateOptions(correct) {
      const options = new Set();
      options.add(correct);

      while (options.size < 4) {
        const fake = correct + Math.floor(Math.random() * 10) - 5;
        options.add(fake);
      }

      const arr = Array.from(options);
      arr.sort(() => Math.random() - 0.5);

      const correctIndex = arr.indexOf(correct);

      return {
        option_a: String(arr[0]),
        option_b: String(arr[1]),
        option_c: String(arr[2]),
        option_d: String(arr[3]),
        correct_answer: ['A', 'B', 'C', 'D'][correctIndex],
      };
    }

    // -------------------------------
    // 🔥 GENERATE QUESTIONS
    // -------------------------------
    let questions = [];

    for (let i = 0; i < num_questions; i++) {
      const q = generateMathQuestion(level_id);
      const options = generateOptions(q.answer);

      questions.push({
        question_text: q.question,
        ...options,
        marks: 1,
      });
    }

    const totalMarks = num_questions;

    // -------------------------------
    // 🔥 CREATE TEST
    // -------------------------------
    const { rows } = await db.query(
  `INSERT INTO tests 
   (title, level_id, total_marks, pass_marks, auto_generated, num_questions, duration_minutes, created_by)
   VALUES ($1,$2,$3,$4,true,$5,$6,$7)
   RETURNING *`,
  [
    `Auto Generated Level ${level_id}`,
    level_id,
    totalMarks,
    Math.ceil(totalMarks * 0.6),
    num_questions,
    duration_minutes || 30,
    req.user.id,
  ]
);
    const test = rows[0];

    // -------------------------------
    // 🔥 INSERT QUESTIONS
    // -------------------------------
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];

      await db.query(
        `INSERT INTO test_questions 
         (test_id, question_text, option_a, option_b, option_c, option_d, correct_answer, marks, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          test.id,
          q.question_text,
          q.option_a,
          q.option_b,
          q.option_c,
          q.option_d,
          q.correct_answer,
          q.marks,
          i,
        ]
      );
    }

    // -------------------------------
    // ✅ RESPONSE
    // -------------------------------
    res.status(201).json({
      message: 'Auto-generated test created successfully',
      test,
      questionsGenerated: questions.length,
      totalMarks,
    });

  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || 'Server error' });
  }
});
// GET /api/admin/mock-tests
// Get all mock tests (created by admin)
router.get('/mock-tests', adminAuth, async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT t.*,l.name as level_name,
             (SELECT COUNT(*) FROM test_attempts ta WHERE ta.test_id=t.id AND ta.status='submitted') as submitted_count,
             (SELECT COUNT(*) FROM test_attempts ta WHERE ta.test_id=t.id) as total_attempts
      FROM tests t 
      LEFT JOIN levels l ON l.id=t.level_id
      WHERE t.auto_generated = true
      ORDER BY t.created_at DESC
    `);
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/admin/mock-tests/:id
router.delete('/mock-tests/:id', adminAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      'DELETE FROM tests WHERE id=$1 AND auto_generated=true RETURNING id',
      [req.params.id]
    );
    if (!rows.length) {
      return res.status(404).json({ error: 'Mock test not found' });
    }
    res.json({ message: 'Mock test deleted' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
