-- Manual runs exercise the real NTU inbox checker, but should be rate-limited
-- independently of the synthetic push-only test and the background cron.
CREATE TABLE IF NOT EXISTS mail_manual_checks (student_id TEXT PRIMARY KEY REFERENCES students(id) ON DELETE CASCADE, checked_at INTEGER NOT NULL DEFAULT 0);
