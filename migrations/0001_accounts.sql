PRAGMA foreign_keys = ON;
CREATE TABLE students (
  id TEXT PRIMARY KEY,
  student_number TEXT NOT NULL UNIQUE COLLATE NOCASE,
  created_at INTEGER NOT NULL
);
CREATE TABLE student_connections (
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK(provider IN ('ntu_mail', 'cool', 'timetable')),
  encrypted_authorization TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('authorized', 'reconnect_required')),
  verified_at INTEGER NOT NULL,
  PRIMARY KEY(student_id, provider)
);
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  csrf_token TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX sessions_student ON sessions(student_id);
CREATE INDEX sessions_expiry ON sessions(expires_at);
CREATE TABLE login_limits (
  key TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX login_limits_expiry ON login_limits(expires_at);
