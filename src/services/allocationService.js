function normalize(value) {
  return String(value || '').trim().toLowerCase();
}

function slotKey(slot) {
  return `${Number(slot.day_of_week ?? slot.day)}:${Number(slot.period)}`;
}

// Rectangular Hungarian algorithm (minimum-cost assignment). Rows <= columns.
function hungarian(cost) {
  const n = cost.length;
  if (!n) return [];
  const m = cost[0].length;
  if (n > m) throw new Error('Hungarian algorithm requires at least as many columns as rows.');
  const u = Array(n + 1).fill(0);
  const v = Array(m + 1).fill(0);
  const p = Array(m + 1).fill(0);
  const way = Array(m + 1).fill(0);
  for (let i = 1; i <= n; i += 1) {
    p[0] = i;
    let j0 = 0;
    const minv = Array(m + 1).fill(Number.POSITIVE_INFINITY);
    const used = Array(m + 1).fill(false);
    do {
      used[j0] = true;
      const i0 = p[j0];
      let delta = Number.POSITIVE_INFINITY;
      let j1 = 0;
      for (let j = 1; j <= m; j += 1) {
        if (used[j]) continue;
        const cur = cost[i0 - 1][j - 1] - u[i0] - v[j];
        if (cur < minv[j]) { minv[j] = cur; way[j] = j0; }
        if (minv[j] < delta) { delta = minv[j]; j1 = j; }
      }
      for (let j = 0; j <= m; j += 1) {
        if (used[j]) { u[p[j]] += delta; v[j] -= delta; }
        else minv[j] -= delta;
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do {
      const j1 = way[j0];
      p[j0] = p[j1];
      j0 = j1;
    } while (j0 !== 0);
  }
  const assignment = Array(n).fill(-1);
  for (let j = 1; j <= m; j += 1) if (p[j]) assignment[p[j] - 1] = j - 1;
  return assignment;
}

function planAllocations({ subjects, faculty, existingAllocations = [], timetable = [], availability = [] }) {
  const loads = new Map(faculty.map((person) => [Number(person.id), Number(person.assigned_hours || 0)]));
  const assignedSubjects = new Set(existingAllocations.map((item) => Number(item.subject_id)));
  const occupiedByFaculty = new Set(timetable.map((entry) => `${Number(entry.faculty_id)}:${slotKey(entry)}`));
  const availableSlots = new Set(availability.map((entry) => `${Number(entry.faculty_id)}:${slotKey(entry)}`));
  const pending = subjects.filter((subject) => !assignedSubjects.has(Number(subject.id))).slice()
    .sort((a, b) => Number(b.weekly_hours) - Number(a.weekly_hours) || Number(a.id) - Number(b.id));

  if (!pending.length) return { proposed: [], unassigned: [], workload_after: faculty.map((person) => ({
    faculty_id: Number(person.id), faculty_name: person.name, assigned_hours: loads.get(Number(person.id)),
    max_weekly_hours: Number(person.max_weekly_hours), remaining_hours: Number(person.max_weekly_hours) - loads.get(Number(person.id))
  })), algorithm: 'Hungarian algorithm' };

  const minHours = Math.max(1, Math.min(...pending.map((s) => Number(s.weekly_hours) || 1)));
  const seats = [];
  // Expand each faculty member into assignment seats so a faculty member can receive multiple subjects.
  for (const person of faculty) {
    const remaining = Number(person.max_weekly_hours) - loads.get(Number(person.id));
    const seatCount = Math.max(0, Math.min(pending.length, Math.floor(remaining / minHours)));
    for (let seat = 0; seat < seatCount; seat += 1) seats.push({ person, seat });
  }

  const FORBIDDEN = 1e12;
  const UNASSIGNED = 1e9;
  const eligibleFor = (subject, person) => normalize(person.specialization) === normalize(subject.required_specialization)
    && Number(person.department_id) === Number(subject.department_id);
  const compatibleFor = (subject, person) => {
    const slots = subject.slots || [];
    return slots.every((slot) => {
      const key = `${Number(person.id)}:${slotKey(slot)}`;
      return availableSlots.has(key) && !occupiedByFaculty.has(key);
    });
  };
  const costs = pending.map((subject, row) => {
    const hours = Number(subject.weekly_hours);
    const realCosts = seats.map(({ person, seat }) => {
      const current = loads.get(Number(person.id));
      if (!eligibleFor(subject, person) || !compatibleFor(subject, person)
          || current + (seat * minHours) + hours > Number(person.max_weekly_hours)) return FORBIDDEN;
      const projected = current + (seat * minHours) + hours;
      const utilization = projected / Math.max(1, Number(person.max_weekly_hours));
      return utilization * 10000 + seat * 100 + Number(person.id) / 1000 + row / 100000;
    });
    return [...realCosts, ...Array(pending.length).fill(UNASSIGNED)];
  });
  const selectedColumns = hungarian(costs);
  const proposed = [];
  const unassigned = [];
  const usedHours = new Map(loads);

  pending.forEach((subject, index) => {
    const column = selectedColumns[index];
    const seat = column >= 0 && column < seats.length ? seats[column] : null;
    const hours = Number(subject.weekly_hours);
    if (!seat || costs[index][column] >= UNASSIGNED) {
      const eligible = faculty.filter((person) => eligibleFor(subject, person));
      const capacity = eligible.filter((person) => Number(person.max_weekly_hours) - usedHours.get(Number(person.id)) >= hours);
      const slots = subject.slots || [];
      const available = capacity.filter((person) => compatibleFor(subject, person));
      let reason = !eligible.length
        ? 'No faculty member matches the required department and specialization.'
        : !capacity.length
          ? 'All matching faculty members would exceed their weekly workload limit.'
          : slots.length && !available.length
            ? 'Matching faculty are unavailable or have timetable conflicts in the requested slots.'
            : 'No feasible faculty assignment was found by the Hungarian optimization.';
      unassigned.push({ subject_id: Number(subject.id), subject_code: subject.subject_code, subject_name: subject.name, reason });
      return;
    }
    const person = seat.person;
    // Final exact capacity check protects against accumulated variable-hour assignments.
    if (usedHours.get(Number(person.id)) + hours > Number(person.max_weekly_hours)) {
      unassigned.push({ subject_id: Number(subject.id), subject_code: subject.subject_code, subject_name: subject.name,
        reason: 'Assignment would exceed the faculty member’s remaining weekly workload capacity.' });
      return;
    }
    const slots = subject.slots || [];
    proposed.push({ subject_id: Number(subject.id), subject_code: subject.subject_code, subject_name: subject.name,
      faculty_id: Number(person.id), faculty_name: person.name, assigned_hours: hours, slots });
    usedHours.set(Number(person.id), usedHours.get(Number(person.id)) + hours);
    slots.forEach((slot) => occupiedByFaculty.add(`${Number(person.id)}:${slotKey(slot)}`));
  });

  return { proposed, unassigned, workload_after: faculty.map((person) => ({
    faculty_id: Number(person.id), faculty_name: person.name, assigned_hours: usedHours.get(Number(person.id)),
    max_weekly_hours: Number(person.max_weekly_hours), remaining_hours: Number(person.max_weekly_hours) - usedHours.get(Number(person.id))
  })), algorithm: 'Hungarian algorithm' };
}

module.exports = { planAllocations, hungarian };
