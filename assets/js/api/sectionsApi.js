/**
 * sectionsApi.js - Section curriculum & advisory management service
 * Bestlink College of the Philippines - Attendance Monitoring System (AMS)
 */

import { getSupabase } from '../lib/supabaseClient.js';

export const sectionsApi = {
  /**
   * Fetches all sections with advisor teacher information and student count
   */
  async getSections() {
    const sb = getSupabase();
    if (!sb) return [];

    try {
      const { data, error } = await sb
        .from('sections')
        .select(`
          id,
          name,
          program_code,
          year_level,
          academic_year,
          semester,
          advisor_teacher_id,
          advisor:advisor_teacher_id ( id, first_name, last_name, email ),
          students:users!section_id ( id, status )
        `)
        .order('program_code', { ascending: true })
        .order('year_level', { ascending: true })
        .order('name', { ascending: true });

      if (error) throw error;

      // Transform student counts
      return (data || []).map(sec => {
        const activeStudents = (sec.students || []).filter(s => s.status === 'active').length;
        return {
          ...sec,
          active_student_count: activeStudents
        };
      });
    } catch (err) {
      console.error('[AMS API] getSections error:', err);
      return [];
    }
  },

  /**
   * Fetches single section with advisory and roster details
   */
  async getSectionById(id) {
    const sb = getSupabase();
    if (!sb) return null;

    try {
      const { data, error } = await sb
        .from('sections')
        .select(`
          *,
          advisor:advisor_teacher_id (*),
          students:users!section_id (*)
        `)
        .eq('id', id)
        .single();

      if (error) throw error;
      return data;
    } catch (err) {
      console.error('[AMS API] getSectionById error:', err);
      return null;
    }
  },

  /**
   * Creates a new section
   */
  async createSection(sectionData) {
    const sb = getSupabase();
    if (!sb) throw new Error('Supabase client unavailable');

    const { data, error } = await sb
      .from('sections')
      .insert([sectionData])
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Updates an existing section
   */
  async updateSection(id, updates) {
    const sb = getSupabase();
    if (!sb) throw new Error('Supabase client unavailable');

    const { data, error } = await sb
      .from('sections')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Fetches sections assigned to a specific teacher
   * Checks both advisory assignments and teacher_sections junction
   * @param {string} teacherId
   */
  async getSectionsByTeacher(teacherId) {
    const sb = getSupabase();
    if (!sb) {
      return [
        { id: '11111111-1111-1111-1111-111111111111', name: 'BSIT 3-1', program_code: 'BSIT', year_level: '3rd Year', subject: 'Systems Architecture', active_student_count: 35 },
        { id: '22222222-2222-2222-2222-222222222222', name: 'BSIT 3-2', program_code: 'BSIT', year_level: '3rd Year', subject: 'Database Systems', active_student_count: 32 }
      ];
    }

    try {
      // 1. Query teacher_sections
      const { data: teacherSections, error: tsErr } = await sb
        .from('teacher_sections')
        .select(`
          subject,
          section:section_id (
            id,
            name,
            grade_level,
            school_year,
            students:users!section_id ( id, status )
          )
        `)
        .eq('teacher_id', teacherId);

      if (tsErr) throw tsErr;

      const list = [];
      const seenIds = new Set();

      (teacherSections || []).forEach(item => {
        if (item.section && !seenIds.has(item.section.id)) {
          seenIds.add(item.section.id);
          const activeStudents = (item.section.students || []).filter(s => s.status === 'active').length;
          list.push({
            id: item.section.id,
            name: item.section.name,
            grade_level: item.section.grade_level,
            school_year: item.section.school_year,
            subject: item.subject,
            active_student_count: activeStudents
          });
        }
      });

      // 2. Also check if advisor for any other section
      const { data: advisedSections } = await sb
        .from('sections')
        .select(`
          id,
          name,
          grade_level,
          school_year,
          students:users!section_id ( id, status )
        `)
        .eq('advisor_teacher_id', teacherId);

      (advisedSections || []).forEach(sec => {
        if (!seenIds.has(sec.id)) {
          seenIds.add(sec.id);
          const activeStudents = (sec.students || []).filter(s => s.status === 'active').length;
          list.push({
            id: sec.id,
            name: sec.name,
            grade_level: sec.grade_level,
            school_year: sec.school_year,
            subject: 'Advisory',
            active_student_count: activeStudents
          });
        }
      });

      return list;
    } catch (err) {
      console.warn('[AMS API] getSectionsByTeacher fallback:', err);
      return [
        { id: '11111111-1111-1111-1111-111111111111', name: 'BSIT 3-1', grade_level: '3rd Year', school_year: '2026-2027', subject: 'Systems Architecture', active_student_count: 35 },
        { id: '22222222-2222-2222-2222-222222222222', name: 'BSIT 3-2', grade_level: '3rd Year', school_year: '2026-2027', subject: 'Database Systems', active_student_count: 32 }
      ];
    }
  },

  /**
   * Fetches roster of a section merged with today's attendance log status
   * @param {string} sectionId
   * @param {string} [date] - YYYY-MM-DD
   */
  async getSectionRosterWithAttendance(sectionId, date = new Date().toISOString().split('T')[0]) {
    const sb = getSupabase();
    if (!sb) return [];

    try {
      // 1. Fetch enrolled active students
      // We check both student_sections junction and users.section_id
      const { data: directStudents } = await sb
        .from('users')
        .select('id, first_name, last_name, student_number, email, status')
        .eq('role', 'student')
        .eq('status', 'active')
        .eq('section_id', sectionId);

      const { data: junctionRows } = await sb
        .from('student_sections')
        .select('student:student_id ( id, first_name, last_name, student_number, email, status )')
        .eq('section_id', sectionId);

      const studentMap = new Map();
      (directStudents || []).forEach(s => studentMap.set(s.id, s));
      (junctionRows || []).forEach(j => {
        if (j.student && j.student.status === 'active') {
          studentMap.set(j.student.id, j.student);
        }
      });

      const students = Array.from(studentMap.values());
      if (students.length === 0) return [];

      // 2. Fetch today's attendance logs for this section
      const { data: logs } = await sb
        .from('attendance_logs')
        .select(`
          id,
          student_id,
          scanned_at,
          status,
          scan_method,
          event_type,
          device:device_id ( device_code, location )
        `)
        .eq('section_id', sectionId)
        .gte('scanned_at', `${date}T00:00:00`)
        .lte('scanned_at', `${date}T23:59:59`)
        .order('scanned_at', { ascending: false });

      // 3. Fetch summary for excuse slips or pre-computed status
      const { data: summaries } = await sb
        .from('attendance_summary')
        .select('user_id, status, minutes_late')
        .eq('summary_date', date);

      const logMap = new Map();
      (logs || []).forEach(l => {
        if (!logMap.has(l.student_id)) {
          logMap.set(l.student_id, l);
        }
      });

      const sumMap = new Map();
      (summaries || []).forEach(s => sumMap.set(s.user_id, s));

      // 4. Merge roster
      return students.map(st => {
        const log = logMap.get(st.id);
        const sum = sumMap.get(st.id);

        let status = 'absent';
        let scannedAt = null;
        let scanMethod = null;
        let deviceLocation = null;

        if (log) {
          status = log.status;
          scannedAt = log.scanned_at;
          scanMethod = log.scan_method;
          deviceLocation = log.device ? `${log.device.device_code} (${log.device.location})` : 'Gate Scanner';
        } else if (sum) {
          status = sum.status;
        }

        return {
          ...st,
          status,
          scanned_at: scannedAt,
          scan_method: scanMethod,
          device_location: deviceLocation
        };
      }).sort((a, b) => (a.last_name || '').localeCompare(b.last_name || ''));
    } catch (err) {
      console.error('[AMS API] getSectionRosterWithAttendance error:', err);
      return [];
    }
  }
};

