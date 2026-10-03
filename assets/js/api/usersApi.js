/**
 * usersApi.js - User directory service (Students, Teachers, Admins)
 * Bestlink College of the Philippines - Attendance Monitoring System (AMS)
 * Strictly soft deactivation (status = 'inactive') - Never hard delete
 */

import { getSupabase } from '../lib/supabaseClient.js';

let mockUsers = [
  {
    id: 'a0000000-0000-0000-0000-000000000001',
    role: 'admin',
    first_name: 'Administrator',
    last_name: 'Registrar',
    email: 'admin@bestlink.edu.ph',
    employee_number: 'EMP-2020-001',
    status: 'active'
  },
  {
    id: 'b0000000-0000-0000-0000-000000000001',
    role: 'teacher',
    first_name: 'Ricardo',
    last_name: 'Santos',
    email: 'prof.santos@bestlink.edu.ph',
    employee_number: 'EMP-2018-042',
    status: 'active'
  },
  {
    id: 'b0000000-0000-0000-0000-000000000002',
    role: 'teacher',
    first_name: 'Carmen',
    last_name: 'Reyes',
    email: 'prof.reyes@bestlink.edu.ph',
    employee_number: 'EMP-2019-088',
    status: 'active'
  },
  {
    id: 'c0000000-0000-0000-0000-000000000001',
    role: 'student',
    first_name: 'Juan',
    last_name: 'Dela Cruz',
    student_number: 's230110001',
    email: 'juan.delacruz@student.bestlink.edu.ph',
    status: 'active',
    sections: { id: '11111111-1111-1111-1111-111111111111', name: '31001' },
    student_sections: [{ section_id: '11111111-1111-1111-1111-111111111111', sections: { id: '11111111-1111-1111-1111-111111111111', name: '31001' } }],
    rfid_credentials: [{ card_uid: 'E2806894', is_active: true }]
  },
  {
    id: 'c0000000-0000-0000-0000-000000000002',
    role: 'student',
    first_name: 'Maria',
    last_name: 'Clara',
    student_number: 's230110002',
    email: 'maria.clara@student.bestlink.edu.ph',
    status: 'active',
    sections: { id: '11111111-1111-1111-1111-111111111111', name: '31001' },
    student_sections: [{ section_id: '11111111-1111-1111-1111-111111111111', sections: { id: '11111111-1111-1111-1111-111111111111', name: '31001' } }],
    rfid_credentials: [{ card_uid: 'A1B2C3D4', is_active: true }]
  },
  {
    id: 'c0000000-0000-0000-0000-000000000003',
    role: 'student',
    first_name: 'Jose',
    last_name: 'Rizal',
    student_number: 's230110003',
    email: 'jose.rizal@student.bestlink.edu.ph',
    status: 'active',
    sections: { id: '11111111-1111-1111-1111-111111111111', name: '31001' },
    student_sections: [{ section_id: '11111111-1111-1111-1111-111111111111', sections: { id: '11111111-1111-1111-1111-111111111111', name: '31001' } }],
    rfid_credentials: [{ card_uid: 'B2C3D4E5', is_active: true }]
  },
  {
    id: 'c0000000-0000-0000-0000-000000000004',
    role: 'student',
    first_name: 'Andres',
    last_name: 'Bonifacio',
    student_number: 's230110004',
    email: 'andres.bonifacio@student.bestlink.edu.ph',
    status: 'active',
    sections: { id: '22222222-2222-2222-2222-222222222222', name: '31002' },
    student_sections: [{ section_id: '22222222-2222-2222-2222-222222222222', sections: { id: '22222222-2222-2222-2222-222222222222', name: '31002' } }],
    rfid_credentials: [{ card_uid: 'C3D4E5F6', is_active: true }]
  },
  {
    id: 'c0000000-0000-0000-0000-000000000005',
    role: 'student',
    first_name: 'Gabriela',
    last_name: 'Silang',
    student_number: 's230110005',
    email: 'gabriela.silang@student.bestlink.edu.ph',
    status: 'active',
    sections: { id: '22222222-2222-2222-2222-222222222222', name: '31002' },
    student_sections: [{ section_id: '22222222-2222-2222-2222-222222222222', sections: { id: '22222222-2222-2222-2222-222222222222', name: '31002' } }],
    rfid_credentials: [{ card_uid: 'D4E5F6A7', is_active: true }]
  },
  {
    id: 'c0000000-0000-0000-0000-000000000006',
    role: 'student',
    first_name: 'Emilio',
    last_name: 'Aguinaldo',
    student_number: 's230110006',
    email: 'emilio.aguinaldo@student.bestlink.edu.ph',
    status: 'active',
    sections: { id: '33333333-3333-3333-3333-333333333333', name: '21001' },
    student_sections: [{ section_id: '33333333-3333-3333-3333-333333333333', sections: { id: '33333333-3333-3333-3333-333333333333', name: '21001' } }],
    rfid_credentials: [{ card_uid: 'E5F6A7B8', is_active: true }]
  }
];

export const usersApi = {
  /**
   * Fetches paginated users with optional role, section, and search filtering
   */
  async getUsers({ role = null, sectionId = null, search = '', status = 'active', page = 0, pageSize = 20 } = {}) {
    const sb = getSupabase();
    if (!sb) {
      let filtered = [...mockUsers];
      if (role) filtered = filtered.filter(u => u.role === role);
      if (status) filtered = filtered.filter(u => u.status === status);
      if (sectionId) {
        filtered = filtered.filter(u => u.student_sections?.some(ss => ss.sections?.id === sectionId || ss.section_id === sectionId));
      }
      if (search) {
        const q = search.toLowerCase();
        filtered = filtered.filter(u => 
          (u.first_name || '').toLowerCase().includes(q) ||
          (u.last_name || '').toLowerCase().includes(q) ||
          (u.email || '').toLowerCase().includes(q) ||
          (u.student_number || '').toLowerCase().includes(q) ||
          (u.employee_number || '').toLowerCase().includes(q)
        );
      }
      return { data: filtered.slice(page * pageSize, (page + 1) * pageSize), count: filtered.length };
    }

    try {
      const studentSectionsSelect = sectionId 
        ? 'student_sections!inner ( section_id, sections ( id, name, grade_level ) )'
        : 'student_sections ( sections ( id, name, grade_level ) )';

      let query = sb
        .from('users')
        .select(`
          id,
          student_number,
          employee_number,
          first_name,
          last_name,
          email,
          role,
          status,
          created_at,
          rfid_cards ( id, card_uid, is_active ),
          parent_contacts ( id, full_name, relationship, mobile_number ),
          ${studentSectionsSelect},
          teacher_sections ( sections ( id, name ), subject )
        `, { count: 'exact' });

      if (role) {
        query = query.eq('role', role);
      }
      if (status) {
        query = query.eq('status', status);
      }
      if (sectionId) {
        query = query.eq('student_sections.section_id', sectionId);
      }
      if (search) {
        query = query.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,student_number.ilike.%${search}%,employee_number.ilike.%${search}%,email.ilike.%${search}%`);
      }

      query = query
        .order('last_name', { ascending: true })
        .range(page * pageSize, (page + 1) * pageSize - 1);

      const { data, count, error } = await query;
      if (error) throw error;

      return { data: data || [], count: count || 0 };
    } catch (err) {
      console.error('[AMS API] getUsers error:', err);
      return { data: [], count: 0 };
    }
  },

  /**
   * Fetches a single user with relations
   */
  async getUserById(id) {
    const sb = getSupabase();
    if (!sb) return null;

    try {
      const { data, error } = await sb
        .from('users')
        .select(`
          *,
          rfid_cards (*),
          qr_codes (*),
          parent_contacts (*),
          student_sections ( sections (*) ),
          teacher_sections ( sections (*), subject )
        `)
        .eq('id', id)
        .single();

      if (error) throw error;
      return data;
    } catch (err) {
      console.error('[AMS API] getUserById error:', err);
      return null;
    }
  },

  /**
   * Creates a new user record
   */
  async createUser(userData) {
    const sb = getSupabase();
    if (!sb) throw new Error('Supabase client unavailable');

    const { data, error } = await sb
      .from('users')
      .insert([userData])
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Updates an existing user record
   */
  async updateUser(id, updates) {
    const sb = getSupabase();
    if (!sb) throw new Error('Supabase client unavailable');

    const { data, error } = await sb
      .from('users')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Soft-deactivates a user (status = 'inactive')
   * Invariant: Never perform DELETE FROM users to preserve historical logs
   */
  async deactivateUser(id) {
    return this.updateUser(id, { status: 'inactive' });
  },

  /**
   * Assigns or updates an RFID card credential
   */
  async assignRfidCard(userId, cardUid) {
    const sb = getSupabase();
    if (!sb) throw new Error('Supabase client unavailable');

    // Deactivate previous cards
    await sb
      .from('rfid_cards')
      .update({ is_active: false })
      .eq('user_id', userId);

    // Insert new card
    const { data, error } = await sb
      .from('rfid_cards')
      .insert([{
        user_id: userId,
        card_uid: cardUid.toUpperCase().trim(),
        is_active: true
      }])
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Generates or rotates a QR fallback token
   */
  async rotateQrToken(userId) {
    const sb = getSupabase();
    if (!sb) throw new Error('Supabase client unavailable');

    // Deactivate older tokens
    await sb
      .from('qr_codes')
      .update({ is_active: false })
      .eq('user_id', userId);

    const token = 'QR-' + Math.random().toString(36).substring(2, 10).toUpperCase() + '-' + Date.now().toString(36).toUpperCase();

    const { data, error } = await sb
      .from('qr_codes')
      .insert([{
        user_id: userId,
        code_value: token,
        is_active: true
      }])
      .select()
      .single();

    if (error) throw error;
    return { token, ...data };
  }
};
