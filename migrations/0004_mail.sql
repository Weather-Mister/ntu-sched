CREATE TABLE IF NOT EXISTS mail_state (
 student_id TEXT PRIMARY KEY REFERENCES students(id) ON DELETE CASCADE,
 upstream TEXT, inbox TEXT, inbox_at INTEGER NOT NULL DEFAULT 0,
 baseline TEXT, checked_at INTEGER NOT NULL DEFAULT 0, next_check INTEGER NOT NULL DEFAULT 0,
 lease TEXT, lease_until INTEGER NOT NULL DEFAULT 0, failures INTEGER NOT NULL DEFAULT 0,
 last_error TEXT
);
CREATE TABLE IF NOT EXISTS mail_sends (
 student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
 id TEXT NOT NULL, payload_hash TEXT NOT NULL, message_id TEXT NOT NULL,
 status TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
 PRIMARY KEY(student_id,id)
);
CREATE TABLE IF NOT EXISTS mail_push (
 student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
 id TEXT NOT NULL, encrypted_subscription TEXT NOT NULL, created_at INTEGER NOT NULL,
 notified_uid INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(student_id,id)
);
CREATE INDEX IF NOT EXISTS mail_due ON mail_state(next_check);
CREATE INDEX IF NOT EXISTS mail_sends_created ON mail_sends(created_at);
CREATE TABLE IF NOT EXISTS mail_config (id TEXT PRIMARY KEY, encrypted_value TEXT NOT NULL);
