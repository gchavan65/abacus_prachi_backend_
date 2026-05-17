const cron = require('node-cron');
const db = require('../config/db');
const { sendFeeReminder } = require('./whatsapp');

function startScheduler() {
  const cronExpr = process.env.FEE_REMINDER_CRON || '0 9 * * *';

  cron.schedule(cronExpr, async () => {
    console.log('[Scheduler] Running fee reminder job...');
    try {
      // Get all students with pending/overdue fees
      const { rows } = await db.query(`
        SELECT
          u.id, u.name, u.phone,
          SUM(CASE WHEN fr.status IN ('pending','overdue','partial') THEN fr.amount_due - fr.amount_paid ELSE 0 END) AS pending,
          SUM(fr.amount_paid) AS paid
        FROM users u
        JOIN fee_records fr ON fr.student_id = u.id
        WHERE u.role = 'student' AND u.status = 'active'
          AND fr.status IN ('pending','overdue','partial')
          AND fr.due_date <= CURRENT_DATE + INTERVAL '5 days'
        GROUP BY u.id, u.name, u.phone
        HAVING SUM(CASE WHEN fr.status IN ('pending','overdue','partial') THEN fr.amount_due - fr.amount_paid ELSE 0 END) > 0
      `);

      let sent = 0;
      for (const student of rows) {
        await sendFeeReminder(student, student.pending, student.paid);
        // Mark reminder sent
        await db.query(
          `UPDATE fee_records SET reminder_sent_at = NOW()
           WHERE student_id = $1 AND status IN ('pending','overdue','partial') AND reminder_sent_at IS NULL`,
          [student.id]
        );
        sent++;
      }
      console.log(`[Scheduler] Fee reminders sent: ${sent}`);
    } catch (err) {
      console.error('[Scheduler] Fee reminder error:', err.message);
    }
  });

  console.log(`[Scheduler] Fee reminder cron started: ${cronExpr}`);
}

module.exports = { startScheduler };
