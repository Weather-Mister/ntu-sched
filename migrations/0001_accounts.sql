PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS students (
  id TEXT PRIMARY KEY,
  student_number TEXT NOT NULL UNIQUE COLLATE NOCASE,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS student_connections (
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK(provider IN ('ntu_mail', 'cool', 'timetable')),
  encrypted_authorization TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('authorized', 'reconnect_required')),
  verified_at INTEGER NOT NULL,
  PRIMARY KEY(student_id, provider)
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  csrf_token TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_student ON sessions(student_id);
CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
CREATE TABLE IF NOT EXISTS login_limits (
  key TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS login_limits_expiry ON login_limits(expires_at);
