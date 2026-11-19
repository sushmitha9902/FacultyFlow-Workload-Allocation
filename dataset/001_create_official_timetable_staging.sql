USE faculty_workload;

-- Staging table: preserves the source timetable without forcing it into
-- the application's period-based subjects/timetable_slots tables.
CREATE TABLE IF NOT EXISTS official_timetable_rows (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  source_row INT UNSIGNED NOT NULL,
  term_code VARCHAR(12) NOT NULL,
  section_number VARCHAR(12) NOT NULL,
  academic_group VARCHAR(40) NOT NULL,
  subject_code VARCHAR(30) NOT NULL,
  catalog_number VARCHAR(20) NOT NULL,
  class_number VARCHAR(20) NOT NULL,
  component ENUM('LEC', 'LAB') NOT NULL,
  meeting_start TIME NOT NULL,
  meeting_end TIME NOT NULL,
  day_of_week TINYINT UNSIGNED NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  instructor_name VARCHAR(160) NULL,
  room_number VARCHAR(40) NULL,
  source_system VARCHAR(120) NOT NULL DEFAULT 'UDST Spring 2023 CCIT timetable',
  imported_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_official_timetable_source_row_day (source_row, day_of_week),
  KEY ix_official_timetable_class (class_number, component),
  KEY ix_official_timetable_subject (subject_code, catalog_number),
  KEY ix_official_timetable_instructor (instructor_name),
  KEY ix_official_timetable_day_time (day_of_week, meeting_start, meeting_end),
  CONSTRAINT chk_official_timetable_day CHECK (day_of_week BETWEEN 1 AND 5),
  CONSTRAINT chk_official_timetable_time CHECK (meeting_end > meeting_start)
) ENGINE=InnoDB;
