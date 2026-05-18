-- Test script to validate the enforcement triggers locally
-- Run this against your dev Postgres (after applying migrations) to observe expected errors

-- 1) Create a test sheet and try to insert more than 8 goals
-- Replace "SHEET_ID_PLACEHOLDER" with a real sheet id or create a goal_sheets row first.

-- Example: create sheet
-- INSERT INTO goal_sheets (id, employee_id, cycle_year, status) VALUES ('00000000-0000-0000-0000-000000000001','<profile-id>', extract(year from current_date));

-- Then try to insert 9 goals (should fail on 9th insertion):
-- INSERT INTO goals (id, sheet_id, title, thrust_area, uom, target, weightage) VALUES (gen_random_uuid(), 'SHEET_ID_PLACEHOLDER', 'G1','T','%',100,10);

-- 2) Test total weightage enforcement: insert a set of goals whose sum != 100 and observe exception.

-- 3) Test per-goal min weightage (10%): inserting a goal with weightage 5 should raise an exception.

-- 4) Test check-in window: try inserting a check_ins row for Q1 in a month other than July and expect an error:
-- INSERT INTO check_ins (id, goal_id, quarter, actual_value) VALUES (gen_random_uuid(), '<goal-id>', 'Q1', 50);

-- Note: these are manual test instructions for a developer running migrations locally.
