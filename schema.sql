-- =====================================================================
-- Kabalega Secondary School Portal — SQLite / Cloudflare D1 schema
-- Run with: wrangler d1 execute <DB_NAME> --file=./schema_sqlite.sql
-- (add --remote to run against the deployed DB instead of local)
-- =====================================================================

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------
-- PEOPLE
-- ---------------------------------------------------------------

CREATE TABLE IF NOT EXISTS students (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  cls        TEXT NOT NULL,                 -- S1..S6
  adm        TEXT NOT NULL UNIQUE,          -- admission number
  pass       TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS teachers (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  pass       TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved')),
  paid       INTEGER NOT NULL DEFAULT 0,     -- 0 = false, 1 = true
  subjects   TEXT NOT NULL,                  -- JSON array as text, e.g. ["Mathematics","Physics"]
  classes    TEXT NOT NULL,                  -- JSON array as text, e.g. ["S1","S2"]
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS admins (
  id   TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  pass TEXT NOT NULL
);

-- ---------------------------------------------------------------
-- FEES & PAYMENTS
-- ---------------------------------------------------------------

CREATE TABLE IF NOT EXISTS fees_structure (
  cls    TEXT PRIMARY KEY,          -- S1..S6
  amount INTEGER NOT NULL           -- UGX per term
);

CREATE TABLE IF NOT EXISTS payments (
  id         TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  amount     INTEGER NOT NULL,
  pay_date   TEXT NOT NULL,         -- store as ISO date string 'YYYY-MM-DD'
  method     TEXT DEFAULT 'Front Office',
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
);

-- Convenience view: how much each student has paid vs owes.
DROP VIEW IF EXISTS student_fees_paid;
CREATE VIEW student_fees_paid AS
SELECT
  s.id            AS student_id,
  s.name          AS student_name,
  s.cls           AS class,
  s.adm           AS admission_no,
  f.amount        AS term_fee,
  COALESCE(SUM(p.amount), 0) AS amount_paid,
  f.amount - COALESCE(SUM(p.amount), 0) AS balance
FROM students s
LEFT JOIN fees_structure f ON f.cls = s.cls
LEFT JOIN payments p ON p.student_id = s.id
WHERE s.status = 'approved'
GROUP BY s.id, s.name, s.cls, s.adm, f.amount;

-- ---------------------------------------------------------------
-- RESULTS
-- ---------------------------------------------------------------

CREATE TABLE IF NOT EXISTS results (
  id         TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  subject    TEXT NOT NULL,
  term       TEXT NOT NULL,
  score      INTEGER NOT NULL,
  type       TEXT NOT NULL,          -- Exam / Online Test
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
);

-- ---------------------------------------------------------------
-- TESTS / EXAMS
-- ---------------------------------------------------------------

CREATE TABLE IF NOT EXISTS tests (
  id         TEXT PRIMARY KEY,
  title      TEXT NOT NULL,
  subject    TEXT NOT NULL,
  cls        TEXT NOT NULL,
  teacher_id TEXT NOT NULL,
  duration   INTEGER NOT NULL,       -- minutes
  type       TEXT NOT NULL CHECK (type IN ('objective','paper')),
  active     INTEGER NOT NULL DEFAULT 0,
  questions  TEXT NULL,              -- objective tests: JSON text [{q,opts,ans}, ...]
  file_data  TEXT NULL,              -- paper tests: base64 data URL
  file_name  TEXT NULL,
  FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS submissions (
  id         TEXT PRIMARY KEY,
  test_id    TEXT NOT NULL,
  student_id TEXT NOT NULL,
  score      INTEGER NOT NULL,
  total      INTEGER NOT NULL,
  sub_date   TEXT NOT NULL,
  FOREIGN KEY (test_id) REFERENCES tests(id) ON DELETE CASCADE,
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS attempts (
  test_id    TEXT NOT NULL,
  student_id TEXT NOT NULL,
  started_at INTEGER NOT NULL,       -- epoch ms
  PRIMARY KEY (test_id, student_id)
);

CREATE TABLE IF NOT EXISTS late_permissions (
  test_id    TEXT NOT NULL,
  student_id TEXT NOT NULL,
  PRIMARY KEY (test_id, student_id)
);

-- ---------------------------------------------------------------
-- NOTES
-- ---------------------------------------------------------------

CREATE TABLE IF NOT EXISTS notes (
  id         TEXT PRIMARY KEY,
  title      TEXT NOT NULL,
  subject    TEXT NOT NULL,
  cls        TEXT NOT NULL,
  teacher_id TEXT NOT NULL,
  body       TEXT NULL,
  note_date  TEXT NOT NULL,
  file_data  TEXT NULL,
  file_name  TEXT NULL,
  file_type  TEXT NULL,
  FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE
);

-- ---------------------------------------------------------------
-- LIBRARY
-- ---------------------------------------------------------------

CREATE TABLE IF NOT EXISTS library (
  id            TEXT PRIMARY KEY,
  title         TEXT NOT NULL,
  author        TEXT NULL,
  subject       TEXT NOT NULL,
  cls           TEXT NOT NULL,       -- class or "All classes"
  category      TEXT NOT NULL CHECK (category IN ('academic','general')),
  uploader_id   TEXT NOT NULL,
  uploader_role TEXT NOT NULL,
  file_data     TEXT NULL,
  file_name     TEXT NULL,
  lib_date      TEXT NOT NULL
);

-- ---------------------------------------------------------------
-- ISSUES
-- ---------------------------------------------------------------

CREATE TABLE IF NOT EXISTS issues (
  id          TEXT PRIMARY KEY,
  by_id       TEXT NOT NULL,
  role        TEXT NOT NULL,
  category    TEXT NOT NULL,
  title       TEXT NOT NULL,
  description TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'Open' CHECK (status IN ('Open','In Progress','Resolved')),
  issue_date  TEXT NOT NULL
);

-- ---------------------------------------------------------------
-- NOTIFICATIONS
-- ---------------------------------------------------------------

CREATE TABLE IF NOT EXISTS notifications (
  id            TEXT PRIMARY KEY,
  audience_type TEXT NOT NULL,       -- all/admin/class/student/teacher/teachers
  audience_cls  TEXT NULL,
  audience_id   TEXT NULL,
  text          TEXT NOT NULL,
  notif_date    TEXT NOT NULL,
  ts            INTEGER NOT NULL,
  read_by       TEXT NOT NULL DEFAULT '[]'   -- JSON array as text
);

-- ---------------------------------------------------------------
-- VOTING / E-ELECTIONS
-- ---------------------------------------------------------------

CREATE TABLE IF NOT EXISTS voting_positions (
  id        TEXT PRIMARY KEY,
  title     TEXT NOT NULL,
  start_at  INTEGER NULL,
  end_at    INTEGER NULL,
  announced INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS voting_candidates (
  id          TEXT PRIMARY KEY,
  position_id TEXT NOT NULL,
  name        TEXT NOT NULL,
  cls         TEXT NULL,
  FOREIGN KEY (position_id) REFERENCES voting_positions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ballots (
  student_id   TEXT NOT NULL,
  position_id  TEXT NOT NULL,
  candidate_id TEXT NOT NULL,
  PRIMARY KEY (student_id, position_id)
);

-- ---------------------------------------------------------------
-- CHAT / GROUPS
-- ---------------------------------------------------------------

CREATE TABLE IF NOT EXISTS chat_groups (
  key_name     TEXT PRIMARY KEY,     -- everyone / S1..S6 / teachers
  display_name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  group_key TEXT NOT NULL,
  who       TEXT NOT NULL,
  msg_text  TEXT NOT NULL,
  msg_time  TEXT NOT NULL,
  ts        INTEGER NOT NULL
);

-- ---------------------------------------------------------------
-- SEED DATA (matches the defaults baked into the portal file)
-- ---------------------------------------------------------------

INSERT OR IGNORE INTO admins (id, name, pass) VALUES ('adm-1','Albert','1123');

INSERT OR IGNORE INTO fees_structure (cls, amount) VALUES
  ('S1',450000),('S2',450000),('S3',480000),('S4',520000),('S5',600000),('S6',600000);

INSERT OR IGNORE INTO chat_groups (key_name, display_name) VALUES
  ('everyone','Everyone · School Announcements'),
  ('S1','S1 Class Chat'),('S2','S2 Class Chat'),('S3','S3 Class Chat'),
  ('S4','S4 Class Chat'),('S5','S5 Class Chat'),('S6','S6 Class Chat'),
  ('teachers','Teachers'' Room');
