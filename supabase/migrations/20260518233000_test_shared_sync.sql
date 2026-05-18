-- TEST MIGRATION SKIPPED DURING CI/REMOTE PUSH
-- This test script attempts to insert sample profiles/users and can violate
-- auth-related foreign keys in remote projects. It is intentionally a no-op
-- for automated migration runs. Run the original test manually in a safe
-- development database if you need to verify `sync_shared_checkins()`.

SELECT 'SKIPPED_TEST_SHARED_SYNC' AS info;

-- Inspect the output; expected: child check_ins JSON arrays contain a record with quarter 'Q1' and actual_value 50.
