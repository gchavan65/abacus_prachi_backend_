require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

// Database connection (same as your db.js)
const getPoolConfig = () => {
  if (process.env.DATABASE_URL) {
    console.log('📡 Using DATABASE_URL');
    return {
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    };
  }
  
  console.log('💻 Using Local Database');
  return {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'abacuspro',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'root',
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  };
};

const pool = new Pool(getPoolConfig());

// =====================
// ALL SQL QUERIES
// =====================

const migrations = [
  // 1. Extensions
  {
    name: 'Enable UUID Extension',
    sql: `CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`
  },

  // 2. Users Table
  {
    name: 'Create Users Table',
    sql: `
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
    `
  },
  {
    name: 'Create Users Indexes',
    sql: `
      CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
      CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
      CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
    `
  },

  // 3. Levels Table
  {
    name: 'Create Levels Table',
    sql: `
      CREATE TABLE IF NOT EXISTS levels (
        id SERIAL PRIMARY KEY,
        name VARCHAR(50) NOT NULL UNIQUE,
        description TEXT,
        sort_order INT DEFAULT 0,
        is_active BOOLEAN DEFAULT true
      );
    `
  },

  // 4. Student Profiles Table
  {
    name: 'Create Student Profiles Table',
    sql: `
      CREATE TABLE IF NOT EXISTS student_profiles (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        level_id INT REFERENCES levels(id),
        batch_time VARCHAR(50),
        enrollment_date DATE DEFAULT CURRENT_DATE,
        approved_by UUID REFERENCES users(id),
        approved_at TIMESTAMPTZ
      );
    `
  },
  {
    name: 'Create Student Profiles Index',
    sql: `CREATE INDEX IF NOT EXISTS idx_sp_level ON student_profiles(level_id);`
  },

  // 5. Courses Table
  {
    name: 'Create Courses Table',
    sql: `
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
    `
  },

  // 6. Student Courses Table
  {
    name: 'Create Student Courses Table',
    sql: `
      CREATE TABLE IF NOT EXISTS student_courses (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        student_id UUID REFERENCES users(id) ON DELETE CASCADE,
        course_id UUID REFERENCES courses(id),
        enrolled_at TIMESTAMPTZ DEFAULT NOW(),
        status VARCHAR(20) DEFAULT 'active',
        UNIQUE(student_id, course_id)
      );
    `
  },
  {
    name: 'Create Student Courses Index',
    sql: `CREATE INDEX IF NOT EXISTS idx_sc_student ON student_courses(student_id);`
  },

  // 7. Fee Records Table
  {
    name: 'Create Fee Records Table',
    sql: `
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
    `
  },
  {
    name: 'Create Fee Records Indexes',
    sql: `
      CREATE INDEX IF NOT EXISTS idx_fee_student ON fee_records(student_id);
      CREATE INDEX IF NOT EXISTS idx_fee_status ON fee_records(status);
    `
  },

  // 8. Class Schedules Table
  {
    name: 'Create Class Schedules Table',
    sql: `
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
    `
  },

  // 9. Notifications Table
  {
    name: 'Create Notifications Table',
    sql: `
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
    `
  },

  // 10. Question Bank Table
  {
    name: 'Create Question Bank Table',
    sql: `
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
    `
  },
  {
    name: 'Create Question Bank Index',
    sql: `CREATE INDEX IF NOT EXISTS idx_qb_level_diff ON question_bank(level_id, difficulty);`
  },

  // 11. Tests Table
  {
    name: 'Create Tests Table',
    sql: `
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
    `
  },

  // 12. Test Questions Table
  {
    name: 'Create Test Questions Table',
    sql: `
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
    `
  },

  // 13. Test Attempts Table
  {
    name: 'Create Test Attempts Table',
    sql: `
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
    `
  },

  // 14. Refresh Tokens Table
  {
    name: 'Create Refresh Tokens Table',
    sql: `
      CREATE TABLE IF NOT EXISTS refresh_tokens (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        token TEXT NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `
  },

  // 15. Trigger Function
  {
    name: 'Create Update Timestamp Function',
    sql: `
      CREATE OR REPLACE FUNCTION update_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `
  },
  {
    name: 'Create Users Update Trigger',
    sql: `
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
    `
  },
  // 15. WhatsApp Logs
  {
    name: 'Create WhatsApp Logs Table',
    sql: `
      CREATE TABLE IF NOT EXISTS whatsapp_logs (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        to_phone VARCHAR(20) NOT NULL,
        message TEXT NOT NULL,
        status VARCHAR(20) DEFAULT 'sent',
        provider_id TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `
  },
];

// =====================
// SEED DATA QUERIES
// =====================

const seedQueries = [
  // Seed Levels
  {
    name: 'Seed Levels',
    sql: `
      INSERT INTO levels (name, description, sort_order) VALUES
        ('Level 1', 'Introduction to Abacus - Basic addition & subtraction', 1),
        ('Level 2', 'Speed arithmetic - multiplication basics', 2),
        ('Level 3', 'Advanced multiplication & division', 3),
        ('Level 4', 'Mental arithmetic introduction', 4),
        ('Level 5', 'High-speed mental math', 5),
        ('Grand Master', 'Championship level - elite practitioners', 6)
      ON CONFLICT (name) DO NOTHING;
    `
  },

  // Seed Admin User
  {
    name: 'Seed Admin User',
    sql: async () => {
      const passwordHash = await bcrypt.hash('Admin@123', 10);
      return {
        text: `
          INSERT INTO users (name, email, phone, password_hash, role, status) VALUES
            ('Admin', 'admin@abacuspro.com', '+919876543210', $1, 'admin', 'active')
          ON CONFLICT (email) DO NOTHING;
        `,
        params: [passwordHash]
      };
    }
  },

  // Seed Courses
  {
    name: 'Seed Courses',
    sql: `
      INSERT INTO courses (name, description, level_id, duration_months, monthly_fee)
      SELECT 
        c.name, c.description, l.id, c.duration_months, c.monthly_fee
      FROM (
        VALUES 
          ('Abacus Level 1 Foundation', '3-month beginner course', 'Level 1', 3, 800),
          ('Abacus Level 2 Intermediate', '3-month intermediate course', 'Level 2', 3, 900),
          ('Abacus Level 3 Advanced', '3-month advanced course', 'Level 3', 3, 1000),
          ('Abacus Level 4 Expert', '4-month expert course', 'Level 4', 4, 1200),
          ('Abacus Level 5 Master', '4-month master course', 'Level 5', 4, 1400),
          ('Grand Master Program', '6-month elite program', 'Grand Master', 6, 2000)
      ) AS c(name, description, level_name, duration_months, monthly_fee)
      JOIN levels l ON l.name = c.level_name
      WHERE NOT EXISTS (
        SELECT 1 FROM courses WHERE courses.name = c.name
      );
    `
  },

  // Seed Question Bank - Level 1 Easy
  {
    name: 'Seed Question Bank - Level 1 Easy',
    sql: `
      INSERT INTO question_bank (level_id, difficulty, question_text, option_a, option_b, option_c, option_d, correct_answer, marks, topic)
      SELECT l.id, 'easy', q.question_text, q.option_a, q.option_b, q.option_c, q.option_d, q.correct_answer, q.marks, q.topic
      FROM levels l
      CROSS JOIN (
        VALUES 
          ('5 + 3 = ?', '7', '8', '9', '10', 'B', 1, 'Addition'),
          ('12 + 4 = ?', '14', '15', '16', '17', 'C', 1, 'Addition'),
          ('7 + 6 = ?', '12', '13', '14', '15', 'B', 1, 'Addition'),
          ('9 + 2 = ?', '10', '11', '12', '13', 'B', 1, 'Addition'),
          ('8 + 5 = ?', '12', '13', '14', '15', 'C', 1, 'Addition'),
          ('6 + 4 = ?', '9', '10', '11', '12', 'B', 1, 'Addition'),
          ('11 + 3 = ?', '13', '14', '15', '16', 'B', 1, 'Addition'),
          ('10 + 7 = ?', '16', '17', '18', '19', 'B', 1, 'Addition'),
          ('10 - 3 = ?', '5', '6', '7', '8', 'C', 1, 'Subtraction'),
          ('15 - 5 = ?', '8', '9', '10', '11', 'C', 1, 'Subtraction'),
          ('12 - 4 = ?', '6', '7', '8', '9', 'C', 1, 'Subtraction'),
          ('9 - 2 = ?', '6', '7', '8', '9', 'B', 1, 'Subtraction'),
          ('14 - 6 = ?', '7', '8', '9', '10', 'B', 1, 'Subtraction'),
          ('11 - 3 = ?', '7', '8', '9', '10', 'B', 1, 'Subtraction'),
          ('13 - 5 = ?', '7', '8', '9', '10', 'C', 1, 'Subtraction'),
          ('16 - 8 = ?', '6', '7', '8', '9', 'C', 1, 'Subtraction')
      ) AS q(question_text, option_a, option_b, option_c, option_d, correct_answer, marks, topic)
      WHERE l.name = 'Level 1'
      AND NOT EXISTS (
        SELECT 1 FROM question_bank qb 
        WHERE qb.level_id = l.id AND qb.question_text = q.question_text
      );
    `
  },

  // Seed Question Bank - Level 1 Medium
  {
    name: 'Seed Question Bank - Level 1 Medium',
    sql: `
      INSERT INTO question_bank (level_id, difficulty, question_text, option_a, option_b, option_c, option_d, correct_answer, marks, topic)
      SELECT l.id, 'medium', q.question_text, q.option_a, q.option_b, q.option_c, q.option_d, q.correct_answer, q.marks, q.topic
      FROM levels l
      CROSS JOIN (
        VALUES 
          ('23 + 17 = ?', '38', '39', '40', '41', 'D', 2, 'Addition'),
          ('45 - 18 = ?', '25', '26', '27', '28', 'C', 2, 'Subtraction'),
          ('12 × 5 = ?', '58', '59', '60', '61', 'C', 2, 'Multiplication'),
          ('36 ÷ 6 = ?', '5', '6', '7', '8', 'B', 2, 'Division'),
          ('28 + 15 = ?', '41', '42', '43', '44', 'B', 2, 'Addition'),
          ('50 - 22 = ?', '26', '27', '28', '29', 'C', 2, 'Subtraction'),
          ('8 × 7 = ?', '54', '55', '56', '57', 'C', 2, 'Multiplication'),
          ('48 ÷ 8 = ?', '5', '6', '7', '8', 'B', 2, 'Division')
      ) AS q(question_text, option_a, option_b, option_c, option_d, correct_answer, marks, topic)
      WHERE l.name = 'Level 1'
      AND NOT EXISTS (
        SELECT 1 FROM question_bank qb 
        WHERE qb.level_id = l.id AND qb.question_text = q.question_text
      );
    `
  },

  // Seed Question Bank - Level 2 Easy
  {
    name: 'Seed Question Bank - Level 2 Easy',
    sql: `
      INSERT INTO question_bank (level_id, difficulty, question_text, option_a, option_b, option_c, option_d, correct_answer, marks, topic)
      SELECT l.id, 'easy', q.question_text, q.option_a, q.option_b, q.option_c, q.option_d, q.correct_answer, q.marks, q.topic
      FROM levels l
      CROSS JOIN (
        VALUES 
          ('15 × 2 = ?', '28', '29', '30', '31', 'C', 1, 'Multiplication'),
          ('24 × 3 = ?', '70', '71', '72', '73', 'C', 1, 'Multiplication'),
          ('30 ÷ 5 = ?', '5', '6', '7', '8', 'B', 1, 'Division'),
          ('45 ÷ 9 = ?', '4', '5', '6', '7', 'B', 1, 'Division'),
          ('12 × 4 = ?', '46', '47', '48', '49', 'C', 1, 'Multiplication'),
          ('20 × 5 = ?', '98', '99', '100', '101', 'C', 1, 'Multiplication'),
          ('64 ÷ 8 = ?', '7', '8', '9', '10', 'B', 1, 'Division'),
          ('56 ÷ 7 = ?', '7', '8', '9', '10', 'B', 1, 'Division')
      ) AS q(question_text, option_a, option_b, option_c, option_d, correct_answer, marks, topic)
      WHERE l.name = 'Level 2'
      AND NOT EXISTS (
        SELECT 1 FROM question_bank qb 
        WHERE qb.level_id = l.id AND qb.question_text = q.question_text
      );
    `
  },

  // Seed Question Bank - Level 2 Medium
  {
    name: 'Seed Question Bank - Level 2 Medium',
    sql: `
      INSERT INTO question_bank (level_id, difficulty, question_text, option_a, option_b, option_c, option_d, correct_answer, marks, topic)
      SELECT l.id, 'medium', q.question_text, q.option_a, q.option_b, q.option_c, q.option_d, q.correct_answer, q.marks, q.topic
      FROM levels l
      CROSS JOIN (
        VALUES 
          ('23 × 12 = ?', '274', '275', '276', '277', 'C', 2, 'Multiplication'),
          ('34 × 15 = ?', '508', '509', '510', '511', 'C', 2, 'Multiplication'),
          ('144 ÷ 12 = ?', '10', '11', '12', '13', 'C', 2, 'Division'),
          ('156 ÷ 13 = ?', '10', '11', '12', '13', 'C', 2, 'Division'),
          ('45 × 11 = ?', '493', '494', '495', '496', 'C', 2, 'Multiplication'),
          ('27 × 14 = ?', '376', '377', '378', '379', 'C', 2, 'Multiplication'),
          ('120 ÷ 15 = ?', '7', '8', '9', '10', 'B', 2, 'Division'),
          ('105 ÷ 7 = ?', '14', '15', '16', '17', 'B', 2, 'Division')
      ) AS q(question_text, option_a, option_b, option_c, option_d, correct_answer, marks, topic)
      WHERE l.name = 'Level 2'
      AND NOT EXISTS (
        SELECT 1 FROM question_bank qb 
        WHERE qb.level_id = l.id AND qb.question_text = q.question_text
      );
    `
  },

  // Seed Question Bank - Level 3 Easy
  {
    name: 'Seed Question Bank - Level 3 Easy',
    sql: `
      INSERT INTO question_bank (level_id, difficulty, question_text, option_a, option_b, option_c, option_d, correct_answer, marks, topic)
      SELECT l.id, 'easy', q.question_text, q.option_a, q.option_b, q.option_c, q.option_d, q.correct_answer, q.marks, q.topic
      FROM levels l
      CROSS JOIN (
        VALUES 
          ('123 × 2 = ?', '244', '245', '246', '247', 'C', 1, 'Multiplication'),
          ('156 × 3 = ?', '466', '467', '468', '469', 'C', 1, 'Multiplication'),
          ('240 ÷ 12 = ?', '18', '19', '20', '21', 'C', 1, 'Division'),
          ('180 ÷ 9 = ?', '18', '19', '20', '21', 'B', 1, 'Division'),
          ('234 × 2 = ?', '466', '467', '468', '469', 'C', 1, 'Multiplication'),
          ('345 × 2 = ?', '688', '689', '690', '691', 'C', 1, 'Multiplication'),
          ('300 ÷ 15 = ?', '18', '19', '20', '21', 'C', 1, 'Division'),
          ('252 ÷ 12 = ?', '18', '19', '20', '21', 'B', 1, 'Division')
      ) AS q(question_text, option_a, option_b, option_c, option_d, correct_answer, marks, topic)
      WHERE l.name = 'Level 3'
      AND NOT EXISTS (
        SELECT 1 FROM question_bank qb 
        WHERE qb.level_id = l.id AND qb.question_text = q.question_text
      );
    `
  },

  // Seed Question Bank - Level 3 Medium
  {
    name: 'Seed Question Bank - Level 3 Medium',
    sql: `
      INSERT INTO question_bank (level_id, difficulty, question_text, option_a, option_b, option_c, option_d, correct_answer, marks, topic)
      SELECT l.id, 'medium', q.question_text, q.option_a, q.option_b, q.option_c, q.option_d, q.correct_answer, q.marks, q.topic
      FROM levels l
      CROSS JOIN (
        VALUES 
          ('234 × 12 = ?', '2804', '2805', '2806', '2807', 'C', 2, 'Multiplication'),
          ('456 × 13 = ?', '5927', '5928', '5929', '5930', 'C', 2, 'Multiplication'),
          ('1024 ÷ 16 = ?', '62', '63', '64', '65', 'C', 2, 'Division'),
          ('1331 ÷ 11 = ?', '119', '120', '121', '122', 'C', 2, 'Division'),
          ('189 × 15 = ?', '2834', '2835', '2836', '2837', 'C', 2, 'Multiplication'),
          ('267 × 18 = ?', '4805', '4806', '4807', '4808', 'C', 2, 'Multiplication'),
          ('900 ÷ 18 = ?', '48', '49', '50', '51', 'C', 2, 'Division'),
          ('648 ÷ 12 = ?', '52', '53', '54', '55', 'C', 2, 'Division')
      ) AS q(question_text, option_a, option_b, option_c, option_d, correct_answer, marks, topic)
      WHERE l.name = 'Level 3'
      AND NOT EXISTS (
        SELECT 1 FROM question_bank qb 
        WHERE qb.level_id = l.id AND qb.question_text = q.question_text
      );
    `
  }
];

// =====================
// RUN MIGRATIONS
// =====================

async function runMigrations() {
  console.log('\n🚀 Starting AbacusPro Database Migration\n');
  console.log('========================================\n');

  const client = await pool.connect();

  try {
    // Run table migrations
    console.log('📦 CREATING TABLES...\n');
    for (const migration of migrations) {
      try {
        await client.query(migration.sql);
        console.log(`  ✅ ${migration.name}`);
      } catch (error) {
        console.error(`  ❌ ${migration.name}: ${error.message}`);
      }
    }

    // Run seed data
    console.log('\n🌱 SEEDING DATA...\n');
    for (const seed of seedQueries) {
      try {
        if (typeof seed.sql === 'function') {
          // Dynamic SQL (for bcrypt hashing)
          const { text, params } = await seed.sql();
          await client.query(text, params);
        } else {
          await client.query(seed.sql);
        }
        console.log(`  ✅ ${seed.name}`);
      } catch (error) {
        console.error(`  ❌ ${seed.name}: ${error.message}`);
      }
    }

    console.log('\n========================================');
    console.log('✅ Migration completed successfully!\n');

    // Show summary
    const tables = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `);

    console.log('📊 Tables created:');
    tables.rows.forEach(row => {
      console.log(`   - ${row.table_name}`);
    });

    // Count records
    const counts = await client.query(`
      SELECT 
        (SELECT COUNT(*) FROM users) as users,
        (SELECT COUNT(*) FROM levels) as levels,
        (SELECT COUNT(*) FROM courses) as courses,
        (SELECT COUNT(*) FROM question_bank) as questions;
    `);

    console.log('\n📈 Record counts:');
    console.log(`   Users: ${counts.rows[0].users}`);
    console.log(`   Levels: ${counts.rows[0].levels}`);
    console.log(`   Courses: ${counts.rows[0].courses}`);
    console.log(`   Questions: ${counts.rows[0].questions}\n`);

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
    console.log('Database connection closed.\n');
  }
}

// Run migrations
runMigrations();