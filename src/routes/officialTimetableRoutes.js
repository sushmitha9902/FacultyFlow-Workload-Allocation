const express = require('express');
const db = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/http');

const router = express.Router();

// Read-only view of the imported UDST Spring 2023 source timetable.
// This intentionally does not convert historical records into app allocations.
router.get('/', asyncHandler(async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  const search = `%${String(req.query.search || '').trim()}%`;
  const [countRows] = await db.execute(`
    SELECT COUNT(*) AS total_records,
      COUNT(DISTINCT instructor_name) AS named_instructors,
      COUNT(DISTINCT subject_code, catalog_number) AS distinct_subjects,
      SUM(CASE WHEN instructor_name IS NULL OR TRIM(instructor_name) = '' THEN 1 ELSE 0 END) AS missing_instructor_records
    FROM official_timetable_rows
  `);
  const [rows] = await db.execute(`
    SELECT id, source_row, term_code, section_number, academic_group,
      subject_code, catalog_number, class_number, component,
      meeting_start, meeting_end, day_of_week, start_date, end_date,
      instructor_name, room_number, source_system
    FROM official_timetable_rows
    WHERE subject_code LIKE ? OR instructor_name LIKE ? OR room_number LIKE ?
    ORDER BY day_of_week, meeting_start, subject_code, class_number
    LIMIT ? OFFSET ?
  `, [search, search, search, limit, offset]);
  return sendSuccess(res, { summary: countRows[0], rows, limit, offset });
}));

module.exports = router;
