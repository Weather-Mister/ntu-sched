CREATE TABLE IF NOT EXISTS custom_events (
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  details TEXT NOT NULL CHECK(json_valid(details)),
  version INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  PRIMARY KEY(student_id, id)
);
CREATE INDEX IF NOT EXISTS custom_events_active ON custom_events(student_id, deleted_at, created_at DESC, id);
