const db = require('../config/db');

/**
 * Get question queue by difficulty level
 * Returns questions in order for consistent test generation
 */
async function getQuestionQueue(levelId, difficulty, limit = 50) {
  const { rows } = await db.query(
    `SELECT id, question_text, option_a, option_b, option_c, option_d, 
            correct_answer, marks, topic, difficulty
     FROM question_bank
     WHERE level_id = $1 AND difficulty = $2
     ORDER BY topic, created_at
     LIMIT $3`,
    [levelId, difficulty, limit]
  );
  return rows;
}

/**
 * Get random questions from queue (for varied question sets)
 */
async function getRandomQuestions(levelId, difficulty, count) {
  const { rows } = await db.query(
    `SELECT id, question_text, option_a, option_b, option_c, option_d, 
            correct_answer, marks, topic
     FROM question_bank
     WHERE level_id = $1 AND difficulty = $2
     ORDER BY RANDOM()
     LIMIT $3`,
    [levelId, difficulty, count]
  );
  return rows;
}

/**
 * Get questions by topic (organized queue)
 */
async function getQuestionsByTopic(levelId, difficulty, topic = null) {
  let query = `
    SELECT id, question_text, option_a, option_b, option_c, option_d, 
           correct_answer, marks, topic, difficulty
    FROM question_bank
    WHERE level_id = $1 AND difficulty = $2
  `;
  const params = [levelId, difficulty];

  if (topic) {
    params.push(topic);
    query += ` AND topic = $${params.length}`;
  }

  query += ` ORDER BY topic, created_at`;

  const { rows } = await db.query(query, params);
  return rows;
}

/**
 * Get all topics for a level and difficulty
 */
async function getTopics(levelId, difficulty) {
  const { rows } = await db.query(
    `SELECT DISTINCT topic FROM question_bank
     WHERE level_id = $1 AND difficulty = $2
     ORDER BY topic`,
    [levelId, difficulty]
  );
  return rows.map(r => r.topic);
}

/**
 * Count questions by difficulty and level
 */
async function getQuestionCounts(levelId) {
  const { rows } = await db.query(
    `SELECT difficulty, COUNT(*) as count, 
            COUNT(DISTINCT topic) as topics
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

module.exports = {
  getQuestionQueue,
  getRandomQuestions,
  getQuestionsByTopic,
  getTopics,
  getQuestionCounts,
};
