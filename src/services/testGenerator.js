const db = require('../config/db');
const { v4: uuid } = require('uuid');

/**
 * Generate a test automatically from question bank
 * @param {Object} config - Test configuration
 * @param {number} config.level_id - Level ID
 * @param {string} config.difficulty - Difficulty (easy, medium, hard)
 * @param {number} config.num_questions - Number of questions to select
 * @param {string} config.title - Test title
 * @param {string} config.description - Test description
 * @param {string} config.userId - Admin user ID who created it
 * @param {boolean} config.is_mock - Whether it's a mock test
 * @returns {Object} Created test with questions
 */
async function generateTestFromBank(config) {
  const {
    level_id,
    difficulty,
    num_questions,
    title,
    description,
    userId,
    is_mock = true,
    duration_minutes = 30,
    total_marks = 10,
    pass_marks = 6,
    start_time = null,
    end_time = null,
  } = config;

  // Get questions from bank
  const { rows: questions } = await db.query(
    `SELECT id, question_text, option_a, option_b, option_c, option_d, 
            correct_answer, marks, topic
     FROM question_bank
     WHERE level_id = $1 AND difficulty = $2
     ORDER BY RANDOM()
     LIMIT $3`,
    [level_id, difficulty, num_questions]
  );

  if (questions.length < num_questions) {
    throw new Error(
      `Not enough questions available. Found ${questions.length}, need ${num_questions}`
    );
  }

  // Calculate total marks
  const calculatedTotalMarks = questions.reduce((sum, q) => sum + (q.marks || 1), 0);

  // Create test
  const { rows: testRows } = await db.query(
    `INSERT INTO tests 
     (title, description, level_id, difficulty, duration_minutes, total_marks, 
      pass_marks, is_active, is_mock, auto_generated, num_questions, start_time, end_time, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, true, $8, true, $9, $10, $11, $12)
     RETURNING *`,
    [
      title,
      description,
      level_id,
      difficulty,
      duration_minutes,
      calculatedTotalMarks,
      Math.ceil(calculatedTotalMarks * 0.6), // 60% pass marks by default
      is_mock,
      num_questions,
      start_time,
      end_time,
      userId,
    ]
  );

  const test = testRows[0];

  // Add questions to test
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    await db.query(
      `INSERT INTO test_questions 
       (test_id, question_text, option_a, option_b, option_c, option_d, 
        correct_answer, marks, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        test.id,
        q.question_text,
        q.option_a,
        q.option_b,
        q.option_c,
        q.option_d,
        q.correct_answer,
        q.marks || 1,
        i,
      ]
    );
  }

  return {
    test,
    questions: questions.length,
    totalMarks: calculatedTotalMarks,
  };
}

/**
 * Get available difficulty levels for a specific level
 */
async function getAvailableDifficulties(levelId) {
  const { rows } = await db.query(
    `SELECT difficulty, COUNT(*) as count
     FROM question_bank
     WHERE level_id = $1
     GROUP BY difficulty
     ORDER BY CASE difficulty 
       WHEN 'easy' THEN 1 
       WHEN 'medium' THEN 2 
       WHEN 'hard' THEN 3 
     END`,
    [levelId]
  );
  return rows;
}

/**
 * Check if enough questions exist for generation
 */
async function canGenerateTest(levelId, difficulty, numQuestions) {
  const { rows } = await db.query(
    `SELECT COUNT(*) as count FROM question_bank
     WHERE level_id = $1 AND difficulty = $2`,
    [levelId, difficulty]
  );
  return rows[0].count >= numQuestions;
}

module.exports = {
  generateTestFromBank,
  getAvailableDifficulties,
  canGenerateTest,
};
