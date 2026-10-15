CREATE TABLE IF NOT EXISTS manual_tasks (
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  text TEXT NOT NULL CHECK(length(text) BETWEEN 1 AND 140),
  done INTEGER NOT NULL DEFAULT 0 CHECK(done IN (0, 1)),
  version INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  PRIMARY KEY(student_id, id)
);
CREATE INDEX IF NOT EXISTS manual_tasks_active ON manual_tasks(student_id, deleted_at, created_at DESC, id);
