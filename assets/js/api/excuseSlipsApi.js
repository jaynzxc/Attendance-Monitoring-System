/**
 * excuseSlipsApi.js - Digital excuse slips service
 * Bestlink College of the Philippines - Attendance Monitoring System (AMS)
 * Authoritative contracts: docs/UI-UX_BackendSpec.md §2.3, §3.3
 */

import { getSupabase } from '../lib/supabaseClient.js';

export const excuseSlipsApi = {
  /**
   * Fetches excuse slips with optional status and section filtering
   */
  async getExcuseSlips({ status = null, sectionId = null } = {}) {
    const sb = getSupabase();
    if (!sb) return [];

    try {
      let query = sb
        .from('excuse_slips')
        .select(`
          id,
          student_id,
          section_id,
          reason_category,
          reason,
          start_date,
          end_date,
          attachment_url,
          status,
          submitted_at,
          reviewer_id,
          reviewer_notes,
          reviewed_at,
          student:student_id ( id, first_name, last_name, student_number ),
          section:section_id ( id, name )
        `);

      if (status) {
        query = query.eq('status', status.toLowerCase());
      }
      if (sectionId) {
        query = query.eq('section_id', sectionId);
      }
      if (studentId) {
        query = query.eq('student_id', studentId);
      }

      query = query.order('submitted_at', { ascending: false });

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    } catch (err) {
      console.error('[AMS API] getExcuseSlips error:', err);
      return [];
    }
  },

  /**
   * Reviews an excuse slip (approve / reject)
   * Calls transactional RPC fn_review_excuse_slip
   */
  async reviewExcuseSlip(slipId, action, reviewerNotes = '') {
    const sb = getSupabase();
    if (!sb) throw new Error('Supabase client unavailable');

    try {
      const { data, error } = await sb.rpc('fn_review_excuse_slip', {
        p_slip_id: slipId,
        p_action: action.toLowerCase(),
        p_reviewer_notes: reviewerNotes
      });

      if (error) throw error;
      return data;
    } catch (err) {
      console.warn('[AMS API] fn_review_excuse_slip fallback direct update:', err);
      // Fallback direct update
      const { data, error } = await sb
        .from('excuse_slips')
        .update({
          status: action.toLowerCase(),
          reviewer_notes: reviewerNotes,
          reviewed_at: new Date().toISOString()
        })
        .eq('id', slipId)
        .select()
        .single();

      if (error) throw error;
      return data;
    }
  },

  /**
   * Generates a secure, time-limited signed URL for proof attachments (5 mins)
   */
  async getAttachmentSignedUrl(filePath) {
    if (!filePath) return null;
    if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
      return filePath;
    }

    const sb = getSupabase();
    if (!sb) return filePath;

    try {
      const { data, error } = await sb.storage
        .from('excuse-attachments')
        .createSignedUrl(filePath, 300);

      if (error) throw error;
      return data?.signedUrl || filePath;
    } catch (err) {
      console.warn('[AMS API] createSignedUrl error:', err);
      return filePath;
    }
  },

  /**
   * Submits a digital excuse slip with optional proof file attachment
   * @param {Object} params
   * @param {string} params.studentId
   * @param {string} params.sectionId
   * @param {string} params.reasonCategory
   * @param {string} params.reason
   * @param {string} params.dateFrom
   * @param {string} params.dateTo
   * @param {File} [params.file]
   */
  async submitExcuseSlip({ studentId, sectionId, reasonCategory, reason, dateFrom, dateTo, file = null }) {
    const sb = getSupabase();
    if (!sb) {
      return {
        id: 'mock-slip-' + Date.now(),
        student_id: studentId,
        section_id: sectionId,
        reason_category: reasonCategory,
        reason: reason,
        start_date: dateFrom,
        end_date: dateTo,
        status: 'pending',
        submitted_at: new Date().toISOString()
      };
    }

    let attachmentPath = null;
    if (file) {
      try {
        const fileExt = file.name ? file.name.split('.').pop() : 'pdf';
        const fileName = `${studentId}/${Date.now()}.${fileExt}`;
        const { error: uploadError } = await sb.storage
          .from('excuse-attachments')
          .upload(fileName, file, { cacheControl: '3600', upsert: true });

        if (!uploadError) {
          attachmentPath = fileName;
        } else {
          console.warn('[AMS API] Storage upload warning:', uploadError);
          attachmentPath = `mock_attachment_${Date.now()}.${fileExt}`;
        }
      } catch (uploadEx) {
        console.warn('[AMS API] Storage upload exception:', uploadEx);
        attachmentPath = `mock_attachment_${Date.now()}.pdf`;
      }
    }

    const { data, error } = await sb
      .from('excuse_slips')
      .insert([{
        student_id: studentId,
        section_id: sectionId,
        reason_category: reasonCategory,
        reason: reason,
        start_date: dateFrom,
        end_date: dateTo,
        attachment_url: attachmentPath,
        status: 'pending'
      }])
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Fetches excuse slips submitted by a specific student
   * @param {string} studentId
   */
  async getStudentSlips(studentId) {
    return this.getExcuseSlips({ studentId });
  }
};

