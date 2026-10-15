CREATE TABLE IF NOT EXISTS student_preferences (
 student_id TEXT PRIMARY KEY REFERENCES students(id) ON DELETE CASCADE,
 encrypted_preferences TEXT NOT NULL,
 version INTEGER NOT NULL,
 updated_at INTEGER NOT NULL
);
