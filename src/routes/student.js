const router = require('express').Router();
const db = require('../config/db');
const auth = require('../middleware/auth');

const studentAuth = auth(['student']);

// GET /api/student/dashboard
router.get('/dashboard', studentAuth, async (req, res) => {
  try {
    const sid = req.user.id;
    const [profile, fees, tests, notifs] = await Promise.all([
      db.query(`SELECT u.*,sp.level_id,sp.batch_time,l.name as level_name FROM users u
                LEFT JOIN student_profiles sp ON sp.user_id=u.id
                LEFT JOIN levels l ON l.id=sp.level_id WHERE u.id=$1`, [sid]),
      db.query(`SELECT COALESCE(SUM(amount_paid),0) as paid,
                COALESCE(SUM(CASE WHEN status IN ('pending','overdue','partial') THEN amount_due-amount_paid ELSE 0 END),0) as pending
                FROM fee_records WHERE student_id=$1`, [sid]),
      db.query(`SELECT t.id,t.title,t.level_id,t.duration_minutes,t.total_marks,t.start_time,t.end_time,
                ta.status as attempt_status,ta.score,ta.percentage
                FROM tests t
                LEFT JOIN test_attempts ta ON ta.test_id=t.id AND ta.student_id=$1
                LEFT JOIN student_profiles sp ON sp.user_id=$1
                WHERE t.is_active=true AND (t.level_id IS NULL OR t.level_id=sp.level_id)
                ORDER BY t.created_at DESC LIMIT 5`, [sid]),
      db.query(`SELECT * FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 10`, [sid]),
    ]);
    res.json({
      profile: profile.rows[0],
      feeSummary: fees.rows[0],
      recentTests: tests.rows,
      notifications: notifs.rows,
    });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});

// GET /api/student/courses
router.get('/courses', studentAuth, async (req, res) => {
  const { rows } = await db.query(
    `SELECT c.*,l.name as level_name,sc.status as enrollment_status,sc.enrolled_at
     FROM courses c
     LEFT JOIN levels l ON l.id=c.level_id
     LEFT JOIN student_courses sc ON sc.course_id=c.id AND sc.student_id=$1
     WHERE c.is_active=true ORDER BY l.sort_order`,
    [req.user.id]
  );
  res.json(rows);
});

// GET /api/student/fees
router.get('/fees', studentAuth, async (req, res) => {
  const { rows } = await db.query(
    `SELECT fr.*,c.name as course_name FROM fee_records fr
     LEFT JOIN courses c ON c.id=fr.course_id
     WHERE fr.student_id=$1 ORDER BY fr.month_year DESC`,
    [req.user.id]
  );
  const summary = await db.query(
    `SELECT COALESCE(SUM(amount_paid),0) as total_paid,
            COALESCE(SUM(amount_due),0) as total_due,
            COALESCE(SUM(CASE WHEN status IN ('pending','overdue','partial') THEN amount_due-amount_paid ELSE 0 END),0) as total_pending
     FROM fee_records WHERE student_id=$1`, [req.user.id]
  );
  res.json({ fees: rows, summary: summary.rows[0] });
});

// GET /api/student/tests
router.get('/tests', studentAuth, async (req, res) => {
  const { rows } = await db.query(`
    SELECT t.*,l.name as level_name,
           ta.id as attempt_id,ta.status as attempt_status,ta.score,ta.percentage,ta.submitted_at
    FROM tests t
    LEFT JOIN levels l ON l.id=t.level_id
    LEFT JOIN test_attempts ta ON ta.test_id=t.id AND ta.student_id=$1
    LEFT JOIN student_profiles sp ON sp.user_id=$1
    WHERE t.is_active=true AND (t.level_id IS NULL OR t.level_id=sp.level_id)
    ORDER BY t.created_at DESC`,
    [req.user.id]
  );
  res.json(rows);
});

// GET /api/student/tests/:id — get test with questions (no answers)
router.get('/tests/:id', studentAuth, async (req, res) => {
  try {
    const { rows: tests } = await db.query(
      `SELECT t.*,l.name as level_name FROM tests t LEFT JOIN levels l ON l.id=t.level_id WHERE t.id=$1 AND t.is_active=true`,
      [req.params.id]
    );
    if (!tests.length) return res.status(404).json({ error: 'Test not found' });

    // Check existing attempt
    const { rows: attempts } = await db.query(
      'SELECT * FROM test_attempts WHERE test_id=$1 AND student_id=$2',
      [req.params.id, req.user.id]
    );
    if (attempts[0]?.status === 'submitted') {
      return res.json({ test: tests[0], attempt: attempts[0], submitted: true });
    }

    const { rows: questions } = await db.query(
      `SELECT id,question_text,option_a,option_b,option_c,option_d,marks,sort_order
       FROM test_questions WHERE test_id=$1 ORDER BY sort_order`,
      [req.params.id]
    );

    let attempt = attempts[0];
    if (!attempt) {
      const { rows: newAttempt } = await db.query(
        `INSERT INTO test_attempts (test_id,student_id,status) VALUES ($1,$2,'in_progress') RETURNING *`,
        [req.params.id, req.user.id]
      );
      attempt = newAttempt[0];
    }

    res.json({ test: tests[0], questions, attempt });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});

// POST /api/student/tests/:id/submit
router.post('/tests/:id/submit', studentAuth, async (req, res) => {
  try {
    const { answers } = req.body; // { question_id: 'A', ... }
    const { rows: attempt } = await db.query(
      `SELECT * FROM test_attempts WHERE test_id=$1 AND student_id=$2`,
      [req.params.id, req.user.id]
    );
    if (!attempt.length || attempt[0].status === 'submitted')
      return res.status(400).json({ error: 'Invalid attempt' });

    const { rows: questions } = await db.query(
      'SELECT id,correct_answer,marks FROM test_questions WHERE test_id=$1',
      [req.params.id]
    );
    const { rows: testInfo } = await db.query('SELECT total_marks FROM tests WHERE id=$1', [req.params.id]);

    let score = 0;
    questions.forEach(q => {
      if (answers[q.id] === q.correct_answer) score += q.marks;
    });
    const percentage = (score / testInfo[0].total_marks) * 100;

    const { rows: updated } = await db.query(
      `UPDATE test_attempts SET answers=$1,score=$2,total_marks=$3,percentage=$4,status='submitted',submitted_at=NOW()
       WHERE id=$5 RETURNING *`,
      [JSON.stringify(answers), score, testInfo[0].total_marks, percentage, attempt[0].id]
    );

    // Notify student
    await db.query(
      `INSERT INTO notifications (user_id,type,title,body) VALUES ($1,'result','Test Result','You scored ${score}/${testInfo[0].total_marks} (${percentage.toFixed(1)}%)')`,
      [req.user.id]
    );

    res.json({ score, total_marks: testInfo[0].total_marks, percentage });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});

// GET /api/student/schedules
router.get('/schedules', studentAuth, async (req, res) => {
  const { rows } = await db.query(`
    SELECT cs.*,l.name as level_name FROM class_schedules cs
    LEFT JOIN levels l ON l.id=cs.level_id
    LEFT JOIN student_profiles sp ON sp.user_id=$1
    WHERE cs.level_id IS NULL OR cs.level_id=sp.level_id
    ORDER BY cs.scheduled_at DESC`,
    [req.user.id]
  );
  res.json(rows);
});

// GET /api/student/notifications
router.get('/notifications', studentAuth, async (req, res) => {
  const { rows } = await db.query(
    'SELECT * FROM notifications WHERE user_id=$1 ORDER BY created_at DESC',
    [req.user.id]
  );
  res.json(rows);
});

// PATCH /api/student/notifications/:id/read
router.patch('/notifications/:id/read', studentAuth, async (req, res) => {
  await db.query('UPDATE notifications SET is_read=true WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
  res.json({ ok: true });
});

// PATCH /api/student/notifications/read-all
router.patch('/notifications/read-all', studentAuth, async (req, res) => {
  await db.query('UPDATE notifications SET is_read=true WHERE user_id=$1', [req.user.id]);
  res.json({ ok: true });
});

// GET /api/student/results
router.get('/results', studentAuth, async (req, res) => {
  const { rows } = await db.query(`
    SELECT ta.*,t.title,t.total_marks,t.pass_marks,l.name as level_name
    FROM test_attempts ta
    JOIN tests t ON t.id=ta.test_id
    LEFT JOIN levels l ON l.id=t.level_id
    WHERE ta.student_id=$1 AND ta.status='submitted'
    ORDER BY ta.submitted_at DESC`,
    [req.user.id]
  );
  res.json(rows);
});

// === MOCK TESTS (for students) ===

// GET /api/student/mock-tests
// Get mock tests available for student's level
router.get('/mock-tests', studentAuth, async (req, res) => {
  try {
    const sid = req.user.id;
    const { rows } = await db.query(`
      SELECT t.*,l.name as level_name,
             ta.id as attempt_id,ta.status as attempt_status,ta.score,ta.percentage,ta.submitted_at
      FROM tests t
      LEFT JOIN levels l ON l.id=t.level_id
      LEFT JOIN test_attempts ta ON ta.test_id=t.id AND ta.student_id=$1
      LEFT JOIN student_profiles sp ON sp.user_id=$1
      WHERE t.is_active=true AND t.is_mock=true 
        AND (t.level_id IS NULL OR t.level_id=sp.level_id)
      ORDER BY t.difficulty, t.created_at DESC`,
      [sid]
    );
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/student/mock-tests/analytics
// Get statistics for student's mock test performance
router.get('/mock-tests/analytics', studentAuth, async (req, res) => {
  try {
    const sid = req.user.id;
    
    // Get overall stats
    const { rows: stats } = await db.query(`
      SELECT 
        COUNT(*) as total_attempts,
        COUNT(CASE WHEN ta.status='submitted' THEN 1 END) as submitted,
        ROUND(AVG(CASE WHEN ta.percentage IS NOT NULL THEN ta.percentage ELSE 0 END)::numeric, 2) as avg_percentage,
        MAX(CASE WHEN ta.percentage IS NOT NULL THEN ta.percentage ELSE 0 END) as best_percentage,
        MIN(CASE WHEN ta.percentage IS NOT NULL THEN ta.percentage ELSE 0 END) as worst_percentage
      FROM test_attempts ta
      JOIN tests t ON t.id=ta.test_id AND t.is_mock=true
      WHERE ta.student_id=$1`,
      [sid]
    );

    // Get stats by difficulty
    const { rows: byDifficulty } = await db.query(`
      SELECT 
        t.difficulty,
        COUNT(*) as attempts,
        ROUND(AVG(CASE WHEN ta.percentage IS NOT NULL THEN ta.percentage ELSE 0 END)::numeric, 2) as avg_percentage,
        COUNT(CASE WHEN (ta.percentage/100.0 * t.total_marks) >= t.pass_marks THEN 1 END) as passed
      FROM test_attempts ta
      JOIN tests t ON t.id=ta.test_id AND t.is_mock=true
      WHERE ta.student_id=$1 AND ta.status='submitted'
      GROUP BY t.difficulty
      ORDER BY CASE t.difficulty WHEN 'easy' THEN 1 WHEN 'medium' THEN 2 WHEN 'hard' THEN 3 END`,
      [sid]
    );

    res.json({
      overall: stats[0] || { total_attempts: 0, submitted: 0, avg_percentage: 0, best_percentage: 0, worst_percentage: 0 },
      byDifficulty: byDifficulty,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

// === STUDENT SELF-CREATE MOCK TESTS ===

// GET /api/student/mock-tests/create-options
// Get available options for student to create their own mock test
router.get('/mock-tests/create-options', studentAuth, async (req, res) => {
  try {
    const sid = req.user.id;
    
    // Get student's level
    const { rows: profile } = await db.query(
      'SELECT level_id FROM student_profiles WHERE user_id=$1',
      [sid]
    );
    
    if (!profile.length || !profile[0].level_id) {
      return res.status(400).json({ error: 'Student level not assigned' });
    }

    const levelId = profile[0].level_id;

    // Get available difficulties and question counts
    const { rows: difficulties } = await db.query(
      `SELECT difficulty, COUNT(*) as count
       FROM question_bank
       WHERE level_id = $1
       GROUP BY difficulty
       ORDER BY CASE difficulty WHEN 'easy' THEN 1 WHEN 'medium' THEN 2 WHEN 'hard' THEN 3 END`,
      [levelId]
    );

    res.json({
      levelId,
      difficulties: difficulties,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/student/mock-tests/create
// Student creates their own mock test
router.post('/mock-tests/create', studentAuth, async (req, res) => {
  try {
    const sid = req.user.id;
    const { difficulty, num_questions, duration_minutes } = req.body;

    // Validate input
    if (!difficulty || !num_questions || num_questions < 1) {
      return res.status(400).json({ error: 'Invalid input' });
    }

    // Get student's level
    const { rows: profile } = await db.query(
      'SELECT level_id FROM student_profiles WHERE user_id=$1',
      [sid]
    );
    
    if (!profile.length || !profile[0].level_id) {
      return res.status(400).json({ error: 'Student level not assigned' });
    }

    const levelId = profile[0].level_id;

    // Import test generator
    const { generateTestFromBank } = require('../services/testGenerator');

    // Generate test
    const result = await generateTestFromBank({
      level_id: levelId,
      difficulty,
      num_questions,
      title: `${difficulty.charAt(0).toUpperCase() + difficulty.slice(1)} Self-Practice Mock Test`,
      description: `Student-created mock test with ${num_questions} ${difficulty} questions`,
      userId: sid,
      is_mock: true,
      duration_minutes: duration_minutes || 30,
    });

    res.status(201).json({
      message: 'Mock test created successfully',
      testId: result.test.id,
      test: result.test,
      questionsGenerated: result.questions,
      totalMarks: result.totalMarks,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || 'Server error' });
  }
});

module.exports = router;
