CREATE TABLE IF NOT EXISTS mail_drafts (
 student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
 id TEXT NOT NULL, encrypted_body TEXT NOT NULL, version INTEGER NOT NULL,
 state TEXT NOT NULL DEFAULT 'open', updated_at INTEGER NOT NULL,
 PRIMARY KEY(student_id,id)
);
CREATE TABLE IF NOT EXISTS mail_files (
 student_id TEXT NOT NULL, draft_id TEXT NOT NULL, id TEXT NOT NULL,
 encrypted_metadata TEXT NOT NULL, size INTEGER NOT NULL, parts INTEGER NOT NULL,
 ready INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(student_id,draft_id,id),
 FOREIGN KEY(student_id,draft_id) REFERENCES mail_drafts(student_id,id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS mail_file_parts (
 student_id TEXT NOT NULL, draft_id TEXT NOT NULL, file_id TEXT NOT NULL,
 part INTEGER NOT NULL, encrypted_data TEXT NOT NULL, hash TEXT NOT NULL, size INTEGER NOT NULL,
 PRIMARY KEY(student_id,draft_id,file_id,part),
 FOREIGN KEY(student_id,draft_id,file_id) REFERENCES mail_files(student_id,draft_id,id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS mail_jobs (
 student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
 id TEXT NOT NULL, draft_id TEXT NOT NULL, encrypted_body TEXT NOT NULL,
 payload_hash TEXT NOT NULL, send_at INTEGER NOT NULL, status TEXT NOT NULL,
 lease_until INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
 PRIMARY KEY(student_id,id)
);
CREATE INDEX IF NOT EXISTS mail_jobs_due ON mail_jobs(status,send_at,lease_until);
