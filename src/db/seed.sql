-- Seed data for AbacusPro

-- Levels
INSERT INTO levels (name, description, sort_order) VALUES
  ('Level 1', 'Introduction to Abacus - Basic addition & subtraction', 1),
  ('Level 2', 'Speed arithmetic - multiplication basics', 2),
  ('Level 3', 'Advanced multiplication & division', 3),
  ('Level 4', 'Mental arithmetic introduction', 4),
  ('Level 5', 'High-speed mental math', 5),
  ('Grand Master', 'Championship level - elite practitioners', 6);

-- Courses
INSERT INTO courses (name, description, level_id, duration_months, monthly_fee) VALUES
  ('Abacus Level 1 Foundation', '3-month beginner course', 1, 3, 800),
  ('Abacus Level 2 Intermediate', '3-month intermediate course', 2, 3, 900),
  ('Abacus Level 3 Advanced', '3-month advanced course', 3, 3, 1000),
  ('Abacus Level 4 Expert', '4-month expert course', 4, 4, 1200),
  ('Abacus Level 5 Master', '4-month master course', 5, 4, 1400),
  ('Grand Master Program', '6-month elite program', 6, 6, 2000);

-- Admin user (password: Admin@123)
INSERT INTO users (name, email, phone, password_hash, role, status) VALUES
  ('Admin', 'admin@abacuspro.com', '+919876543210',
   '$2a$10$rOeXkK8vM3N5pL7qS1tYuOZxWvB4nC6mD8eF2gH0iJ9kL1mN3oP5',
   'admin', 'active');
-- Note: Above hash is placeholder. Run: node -e "const b=require('bcryptjs');console.log(b.hashSync('Admin@123',10))"
-- and replace it, or use the seed script below.

-- =====================
-- QUESTION BANK - Level 1 (Easy)
-- =====================
INSERT INTO question_bank (level_id, difficulty, question_text, option_a, option_b, option_c, option_d, correct_answer, marks, topic) VALUES
-- Level 1 Easy Addition
(1, 'easy', '5 + 3 = ?', '7', '8', '9', '10', 'B', 1, 'Addition'),
(1, 'easy', '12 + 4 = ?', '14', '15', '16', '17', 'C', 1, 'Addition'),
(1, 'easy', '7 + 6 = ?', '12', '13', '14', '15', 'B', 1, 'Addition'),
(1, 'easy', '9 + 2 = ?', '10', '11', '12', '13', 'B', 1, 'Addition'),
(1, 'easy', '8 + 5 = ?', '12', '13', '14', '15', 'C', 1, 'Addition'),
(1, 'easy', '6 + 4 = ?', '9', '10', '11', '12', 'B', 1, 'Addition'),
(1, 'easy', '11 + 3 = ?', '13', '14', '15', '16', 'B', 1, 'Addition'),
(1, 'easy', '10 + 7 = ?', '16', '17', '18', '19', 'B', 1, 'Addition'),

-- Level 1 Easy Subtraction
(1, 'easy', '10 - 3 = ?', '5', '6', '7', '8', 'C', 1, 'Subtraction'),
(1, 'easy', '15 - 5 = ?', '8', '9', '10', '11', 'C', 1, 'Subtraction'),
(1, 'easy', '12 - 4 = ?', '6', '7', '8', '9', 'C', 1, 'Subtraction'),
(1, 'easy', '9 - 2 = ?', '6', '7', '8', '9', 'B', 1, 'Subtraction'),
(1, 'easy', '14 - 6 = ?', '7', '8', '9', '10', 'B', 1, 'Subtraction'),
(1, 'easy', '11 - 3 = ?', '7', '8', '9', '10', 'B', 1, 'Subtraction'),
(1, 'easy', '13 - 5 = ?', '7', '8', '9', '10', 'C', 1, 'Subtraction'),
(1, 'easy', '16 - 8 = ?', '6', '7', '8', '9', 'C', 1, 'Subtraction'),

-- =====================
-- QUESTION BANK - Level 1 (Medium)
-- =====================
(1, 'medium', '23 + 17 = ?', '38', '39', '40', '41', 'D', 2, 'Addition'),
(1, 'medium', '45 - 18 = ?', '25', '26', '27', '28', 'C', 2, 'Subtraction'),
(1, 'medium', '12 × 5 = ?', '58', '59', '60', '61', 'C', 2, 'Multiplication'),
(1, 'medium', '36 ÷ 6 = ?', '5', '6', '7', '8', 'B', 2, 'Division'),
(1, 'medium', '28 + 15 = ?', '41', '42', '43', '44', 'B', 2, 'Addition'),
(1, 'medium', '50 - 22 = ?', '26', '27', '28', '29', 'C', 2, 'Subtraction'),
(1, 'medium', '8 × 7 = ?', '54', '55', '56', '57', 'C', 2, 'Multiplication'),
(1, 'medium', '48 ÷ 8 = ?', '5', '6', '7', '8', 'B', 2, 'Division'),

-- =====================
-- QUESTION BANK - Level 2 (Easy)
-- =====================
(2, 'easy', '15 × 2 = ?', '28', '29', '30', '31', 'C', 1, 'Multiplication'),
(2, 'easy', '24 × 3 = ?', '70', '71', '72', '73', 'C', 1, 'Multiplication'),
(2, 'easy', '30 ÷ 5 = ?', '5', '6', '7', '8', 'B', 1, 'Division'),
(2, 'easy', '45 ÷ 9 = ?', '4', '5', '6', '7', 'B', 1, 'Division'),
(2, 'easy', '12 × 4 = ?', '46', '47', '48', '49', 'C', 1, 'Multiplication'),
(2, 'easy', '20 × 5 = ?', '98', '99', '100', '101', 'C', 1, 'Multiplication'),
(2, 'easy', '64 ÷ 8 = ?', '7', '8', '9', '10', 'B', 1, 'Division'),
(2, 'easy', '56 ÷ 7 = ?', '7', '8', '9', '10', 'B', 1, 'Division'),

-- =====================
-- QUESTION BANK - Level 2 (Medium)
-- =====================
(2, 'medium', '23 × 12 = ?', '274', '275', '276', '277', 'C', 2, 'Multiplication'),
(2, 'medium', '34 × 15 = ?', '508', '509', '510', '511', 'C', 2, 'Multiplication'),
(2, 'medium', '144 ÷ 12 = ?', '10', '11', '12', '13', 'C', 2, 'Division'),
(2, 'medium', '156 ÷ 13 = ?', '10', '11', '12', '13', 'C', 2, 'Division'),
(2, 'medium', '45 × 11 = ?', '493', '494', '495', '496', 'C', 2, 'Multiplication'),
(2, 'medium', '27 × 14 = ?', '376', '377', '378', '379', 'C', 2, 'Multiplication'),
(2, 'medium', '120 ÷ 15 = ?', '7', '8', '9', '10', 'B', 2, 'Division'),
(2, 'medium', '105 ÷ 7 = ?', '14', '15', '16', '17', 'B', 2, 'Division'),

-- =====================
-- QUESTION BANK - Level 3 (Easy)
-- =====================
(3, 'easy', '123 × 2 = ?', '244', '245', '246', '247', 'C', 1, 'Multiplication'),
(3, 'easy', '156 × 3 = ?', '466', '467', '468', '469', 'C', 1, 'Multiplication'),
(3, 'easy', '240 ÷ 12 = ?', '18', '19', '20', '21', 'C', 1, 'Division'),
(3, 'easy', '180 ÷ 9 = ?', '18', '19', '20', '21', 'B', 1, 'Division'),
(3, 'easy', '234 × 2 = ?', '466', '467', '468', '469', 'C', 1, 'Multiplication'),
(3, 'easy', '345 × 2 = ?', '688', '689', '690', '691', 'C', 1, 'Multiplication'),
(3, 'easy', '300 ÷ 15 = ?', '18', '19', '20', '21', 'C', 1, 'Division'),
(3, 'easy', '252 ÷ 12 = ?', '18', '19', '20', '21', 'B', 1, 'Division');

-- =====================
-- QUESTION BANK - Level 3 (Medium)
-- =====================
INSERT INTO question_bank (level_id, difficulty, question_text, option_a, option_b, option_c, option_d, correct_answer, marks, topic) VALUES
(3, 'medium', '234 × 12 = ?', '2804', '2805', '2806', '2807', 'C', 2, 'Multiplication'),
(3, 'medium', '456 × 13 = ?', '5927', '5928', '5929', '5930', 'C', 2, 'Multiplication'),
(3, 'medium', '1024 ÷ 16 = ?', '62', '63', '64', '65', 'C', 2, 'Division'),
(3, 'medium', '1331 ÷ 11 = ?', '119', '120', '121', '122', 'C', 2, 'Division'),
(3, 'medium', '189 × 15 = ?', '2834', '2835', '2836', '2837', 'C', 2, 'Multiplication'),
(3, 'medium', '267 × 18 = ?', '4805', '4806', '4807', '4808', 'C', 2, 'Multiplication'),
(3, 'medium', '900 ÷ 18 = ?', '48', '49', '50', '51', 'C', 2, 'Division'),
(3, 'medium', '648 ÷ 12 = ?', '52', '53', '54', '55', 'C', 2, 'Division');
