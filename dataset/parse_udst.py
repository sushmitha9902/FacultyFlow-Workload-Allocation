"""Parse the extracted UDST Spring 2023 timetable text into a normalized CSV.

Usage (from the dataset folder):
    python parse_udst.py extracted_raw.txt udst_spring_2023_timetable.csv

Keeps one record per scheduled weekday row. Missing instructors remain blank.
"""
import csv
import re
import sys
from datetime import datetime
from pathlib import Path

ROW_RE = re.compile(
    r'^\s*(?P<term>\d+)\s+(?P<section>\d+)\s+(?P<acad_group>\S+)\s+'
    r'(?P<subject_code>\S+)\s+(?P<catalog_number>\d+)\s+'
    r'(?P<class_number>\d+)(?P<component>LEC|LAB)\s+'
    r'(?P<meeting_start>\d{1,2}:\d{2}:\d{2}\s+[AP]M)\s+'
    r'(?P<meeting_end>\d{1,2}:\d{2}:\d{2}\s+[AP]M)'
    r'(?P<sun>[YN])\s+(?P<mon>[YN])\s+(?P<tues>[YN])\s+'
    r'(?P<wed>[YN])\s+(?P<thurs>[YN])\s+'
    r'(?P<start_date>\d{1,2}/\d{1,2}/\d{4})\s+'
    r'(?P<end_date>\d{1,2}/\d{1,2}/\d{4})(?P<tail>.*)$'
)
DAY_FIELDS = [('sun', 1), ('mon', 2), ('tues', 3), ('wed', 4), ('thurs', 5)]
FIELDS = [
    'source_row', 'term_code', 'section_number', 'academic_group', 'subject_code',
    'catalog_number', 'class_number', 'component', 'meeting_start', 'meeting_end',
    'day_of_week', 'day_name', 'start_date', 'end_date', 'instructor_name',
    'room_number', 'source_system'
]


def main():
    if len(sys.argv) < 2:
        print('Usage: python parse_udst.py extracted_raw.txt [output.csv]')
        raise SystemExit(2)
    source = Path(sys.argv[1])
    output = Path(sys.argv[2]) if len(sys.argv) > 2 else source.with_name('udst_spring_2023_timetable.csv')
    lines = source.read_text(encoding='utf-8-sig').splitlines()
    records, errors = [], []
    for line_no, line in enumerate(lines, start=1):
        if not line.strip() or line.startswith('BELOW ARE THE CLASSES') or line.startswith('Term Section'):
            continue
        match = ROW_RE.match(line)
        if not match:
            errors.append((line_no, line))
            continue
        data = match.groupdict()
        tail = (data.pop('tail') or '').strip()
        # The source puts the room at the end. OFFS is retained as a room value;
        # when it is the only token, the instructor is genuinely missing.
        parts = tail.split()
        room = parts[-1] if parts else ''
        instructor = ' '.join(parts[:-1]).strip() if len(parts) > 1 else ''
        for day_field, day_number in DAY_FIELDS:
            if data.pop(day_field) == 'Y':
                row = {
                    'source_row': line_no,
                    'term_code': data['term'],
                    'section_number': data['section'],
                    'academic_group': data['acad_group'],
                    'subject_code': data['subject_code'],
                    'catalog_number': data['catalog_number'],
                    'class_number': data['class_number'],
                    'component': data['component'],
                    'meeting_start': datetime.strptime(data['meeting_start'], '%I:%M:%S %p').strftime('%H:%M:%S'),
                    'meeting_end': datetime.strptime(data['meeting_end'], '%I:%M:%S %p').strftime('%H:%M:%S'),
                    'day_of_week': day_number,
                    'day_name': ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday'][day_number - 1],
                    'start_date': data['start_date'],
                    'end_date': data['end_date'],
                    'instructor_name': instructor,
                    'room_number': room,
                    'source_system': 'UDST Spring 2023 CCIT timetable'
                }
                records.append(row)
    if errors:
        print(f'ERROR: {len(errors)} lines could not be parsed. First examples:')
        for line_no, line in errors[:10]:
            print(f'  line {line_no}: {line}')
        raise SystemExit(1)
    with output.open('w', newline='', encoding='utf-8-sig') as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(records)
    missing = sum(not row['instructor_name'] for row in records)
    print(f'Parsed timetable records: {len(records)}')
    print(f'Records with missing instructor: {missing}')
    print(f'Output: {output.resolve()}')


if __name__ == '__main__':
    main()
