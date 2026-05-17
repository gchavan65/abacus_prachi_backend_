// Auto-migration: Add is_live column to tests if not exists
const db = require('./db');

async function ensureTestTableColumns() {
  // Add is_live column if missing
  const checkLive = await db.query(`SELECT column_name FROM information_schema.columns WHERE table_name='tests' AND column_name='is_live'`);
  if (checkLive.rows.length === 0) {
    await db.query(`ALTER TABLE tests ADD COLUMN is_live BOOLEAN DEFAULT false`);
    console.log('Added is_live column to tests table.');
  } else {
    console.log('is_live column already exists.');
  }

  // Add num_questions column if missing
  const checkNumQ = await db.query(`SELECT column_name FROM information_schema.columns WHERE table_name='tests' AND column_name='num_questions'`);
  if (checkNumQ.rows.length === 0) {
    await db.query(`ALTER TABLE tests ADD COLUMN num_questions INT`);
    console.log('Added num_questions column to tests table.');
  } else {
    console.log('num_questions column already exists.');
  }
}

if (require.main === module) {
  ensureTestTableColumns().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
}

module.exports = { ensureTestTableColumns };