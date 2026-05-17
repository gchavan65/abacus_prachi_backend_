-- =====================
-- EXTENSIONS
-- =====================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================
-- USERS
-- =====================
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL,
  email VARCHAR(150) UNIQUE NOT NULL,
  phone VARCHAR(20) NOT NULL,
  password_hash TEXT NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'student',
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  avatar_url TEXT,
  parent_name VARCHAR(100),
  parent_phone VARCHAR(20),
  address TEXT,
  date_of_birth DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);

-- =====================
-- LEVELS
-- =====================
CREATE TABLE IF NOT EXISTS levels (
  id SERIAL PRIMARY KEY,
  name VARCHAR(50) NOT NULL UNIQUE,
  description TEXT,
  sort_order INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true
);

-- Insert default levels safely
INSERT INTO levels (name, description)
SELECT 'Level 1', 'Beginner'
WHERE NOT EXISTS (SELECT 1 FROM levels WHERE name='Level 1');

INSERT INTO levels (name, description)
SELECT 'Level 2', 'Intermediate'
WHERE NOT EXISTS (SELECT 1 FROM levels WHERE name='Level 2');

INSERT INTO levels (name, description)
SELECT 'Level 3', 'Advanced'
WHERE NOT EXISTS (SELECT 1 FROM levels WHERE name='Level 3');

-- =====================
-- STUDENT PROFILES
-- =====================
CREATE TABLE IF NOT EXISTS student_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  level_id INT REFERENCES levels(id),
  batch_time VARCHAR(50),
  enrollment_date DATE DEFAULT CURRENT_DATE,
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_sp_level ON student_profiles(level_id);

-- =====================
-- COURSES
-- =====================
CREATE TABLE IF NOT EXISTS courses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(150) NOT NULL,
  description TEXT,
  level_id INT REFERENCES levels(id),
  duration_months INT DEFAULT 3,
  monthly_fee NUMERIC(10,2) NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================
-- STUDENT COURSES
-- =====================
CREATE TABLE IF NOT EXISTS student_courses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID REFERENCES users(id) ON DELETE CASCADE,
  course_id UUID REFERENCES courses(id),
  enrolled_at TIMESTAMPTZ DEFAULT NOW(),
  status VARCHAR(20) DEFAULT 'active',
  UNIQUE(student_id, course_id)
);

CREATE INDEX IF NOT EXISTS idx_sc_student ON student_courses(student_id);

-- =====================
-- FEE RECORDS
-- =====================
CREATE TABLE IF NOT EXISTS fee_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID REFERENCES users(id) ON DELETE CASCADE,
  course_id UUID REFERENCES courses(id),
  month_year VARCHAR(7) NOT NULL,
  amount_due NUMERIC(10,2) NOT NULL,
  amount_paid NUMERIC(10,2) DEFAULT 0,
  due_date DATE NOT NULL,
  paid_date DATE,
  payment_mode VARCHAR(50),
  transaction_ref VARCHAR(100),
  status VARCHAR(20) DEFAULT 'pending',
  reminder_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fee_student ON fee_records(student_id);
CREATE INDEX IF NOT EXISTS idx_fee_status ON fee_records(status);

-- =====================
-- CLASS SCHEDULES
-- =====================
CREATE TABLE IF NOT EXISTS class_schedules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title VARCHAR(200) NOT NULL,
  description TEXT,
  level_id INT REFERENCES levels(id),
  scheduled_at TIMESTAMPTZ NOT NULL,
  duration_minutes INT DEFAULT 60,
  meeting_link TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================
-- NOTIFICATIONS
-- =====================
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(200) NOT NULL,
  body TEXT NOT NULL,
  is_read BOOLEAN DEFAULT false,
  whatsapp_sent BOOLEAN DEFAULT false,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================
-- QUESTION BANK (FIXES YOUR ERROR)
-- =====================
CREATE TABLE IF NOT EXISTS question_bank (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  level_id INT REFERENCES levels(id),
  difficulty VARCHAR(20) NOT NULL,
  question_text TEXT NOT NULL,
  option_a TEXT NOT NULL,
  option_b TEXT NOT NULL,
  option_c TEXT NOT NULL,
  option_d TEXT NOT NULL,
  correct_answer CHAR(1) NOT NULL,
  marks INT DEFAULT 1,
  topic VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_qb_level_diff ON question_bank(level_id, difficulty);

-- Insert sample questions safely
INSERT INTO question_bank (level_id, difficulty, question_text, option_a, option_b, option_c, option_d, correct_answer)
SELECT 1, 'easy', '2+2=?', '3','4','5','6','B'
WHERE NOT EXISTS (
  SELECT 1 FROM question_bank WHERE question_text='2+2=?'
);

-- =====================
-- TESTS
-- =====================
CREATE TABLE IF NOT EXISTS tests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title VARCHAR(200) NOT NULL,
  description TEXT,
  level_id INT REFERENCES levels(id),
  difficulty VARCHAR(20),
  duration_minutes INT DEFAULT 30,
  total_marks INT NOT NULL,
  pass_marks INT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  is_mock BOOLEAN DEFAULT false,
  auto_generated BOOLEAN DEFAULT false,
  num_questions INT,
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================
-- TEST QUESTIONS
-- =====================
CREATE TABLE IF NOT EXISTS test_questions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  test_id UUID REFERENCES tests(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL,
  option_a TEXT,
  option_b TEXT,
  option_c TEXT,
  option_d TEXT,
  correct_answer CHAR(1) NOT NULL,
  marks INT DEFAULT 1,
  sort_order INT DEFAULT 0
);

-- =====================
-- TEST ATTEMPTS
-- =====================
CREATE TABLE IF NOT EXISTS test_attempts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  test_id UUID REFERENCES tests(id),
  student_id UUID REFERENCES users(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  submitted_at TIMESTAMPTZ,
  score INT,
  total_marks INT,
  percentage NUMERIC(5,2),
  status VARCHAR(20) DEFAULT 'in_progress',
  answers JSONB,
  UNIQUE(test_id, student_id)
);

-- =====================
-- REFRESH TOKENS
-- =====================
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  token TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================
-- TRIGGER FUNCTION
-- =====================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_users_updated'
  ) THEN
    CREATE TRIGGER trg_users_updated
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
END$$;