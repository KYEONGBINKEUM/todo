/**
 * Collaboration API client (sharing, comments, activity)
 */

import { SupabaseClient } from '@supabase/supabase-js';
import {
  ListShare,
  CreateListShareInput,
  UpdateListShareInput,
  TaskComment,
  ActivityLog,
} from '../types';

export class CollaborationAPI {
  constructor(private supabase: SupabaseClient) {}

  // ========== List Sharing ==========

  /**
   * Get shares for a list
   */
  async getListShares(listId: string): Promise<ListShare[]> {
    const { data, error } = await this.supabase
      .from('list_shares')
      .select(`
        *,
        shared_with_user:profiles!shared_with(id, full_name, email, avatar_url),
        shared_by_user:profiles!shared_by(id, full_name, email, avatar_url),
        list:lists(*)
      `)
      .eq('list_id', listId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data as ListShare[];
  }

  /**
   * Get shares where current user is the recipient
   */
  async getMyShares(): Promise<ListShare[]> {
    const user = (await this.supabase.auth.getUser()).data.user;
    if (!user) throw new Error('User not authenticated');

    const { data, error } = await this.supabase
      .from('list_shares')
      .select(`
        *,
        shared_by_user:profiles!shared_by(id, full_name, email, avatar_url),
        list:lists(*)
      `)
      .eq('shared_with', user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data as ListShare[];
  }

  /**
   * Share a list with another user
   */
  async shareList(input: CreateListShareInput): Promise<ListShare> {
    const user = (await this.supabase.auth.getUser()).data.user;
    if (!user) throw new Error('User not authenticated');

    // First, find the user by email
    const { data: recipientData, error: recipientError } = await this.supabase
      .from('profiles')
      .select('id')
      .eq('email', input.shared_with_email)
      .single();

    if (recipientError) {
      throw new Error('User not found with that email');
    }

    // Create the share
    const { data, error } = await this.supabase
      .from('list_shares')
      .insert({
        list_id: input.list_id,
        shared_by: user.id,
        shared_with: recipientData.id,
        permission: input.permission,
      })
      .select()
      .single();

    if (error) throw error;
    return data as ListShare;
  }

  /**
   * Update a share (e.g., change permission or accept)
   */
  async updateShare(shareId: string, updates: UpdateListShareInput): Promise<ListShare> {
    const { data, error } = await this.supabase
      .from('list_shares')
      .update(updates)
      .eq('id', shareId)
      .select()
      .single();

    if (error) throw error;
    return data as ListShare;
  }

  /**
   * Accept a share invitation
   */
  async acceptShare(shareId: string): Promise<ListShare> {
    return this.updateShare(shareId, { accepted: true });
  }

  /**
   * Decline/remove a share
   */
  async removeShare(shareId: string): Promise<void> {
    const { error } = await this.supabase
      .from('list_shares')
      .delete()
      .eq('id', shareId);

    if (error) throw error;
  }

  // ========== Task Comments ==========

  /**
   * Get comments for a task
   */
  async getTaskComments(taskId: string): Promise<TaskComment[]> {
    const { data, error } = await this.supabase
      .from('task_comments')
      .select(`
        *,
        user:profiles(id, full_name, avatar_url)
      `)
      .eq('task_id', taskId)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return data as TaskComment[];
  }

  /**
   * Add a comment to a task
   */
  async addComment(taskId: string, content: string): Promise<TaskComment> {
    const user = (await this.supabase.auth.getUser()).data.user;
    if (!user) throw new Error('User not authenticated');

    const { data, error } = await this.supabase
      .from('task_comments')
      .insert({
        task_id: taskId,
        user_id: user.id,
        content,
      })
      .select()
      .single();

    if (error) throw error;
    return data as TaskComment;
  }

  /**
   * Update a comment
   */
  async updateComment(commentId: string, content: string): Promise<TaskComment> {
    const { data, error } = await this.supabase
      .from('task_comments')
      .update({
        content,
        edited: true,
      })
      .eq('id', commentId)
      .select()
      .single();

    if (error) throw error;
    return data as TaskComment;
  }

  /**
   * Delete a comment
   */
  async deleteComment(commentId: string): Promise<void> {
    const { error } = await this.supabase
      .from('task_comments')
      .delete()
      .eq('id', commentId);

    if (error) throw error;
  }

  // ========== Activity Log ==========

  /**
   * Get activity log for a list
   */
  async getListActivity(listId: string, limit: number = 50): Promise<ActivityLog[]> {
    const { data, error } = await this.supabase
      .from('activity_log')
      .select(`
        *,
        user:profiles(id, full_name, avatar_url)
      `)
      .eq('entity_id', listId)
      .eq('entity_type', 'list')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data as ActivityLog[];
  }

  /**
   * Get recent activity across all accessible lists
   */
  async getRecentActivity(limit: number = 50): Promise<ActivityLog[]> {
    const { data, error } = await this.supabase
      .from('activity_log')
      .select(`
        *,
        user:profiles(id, full_name, avatar_url)
      `)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data as ActivityLog[];
  }

  // ========== Real-time Subscriptions ==========

  /**
   * Subscribe to comments on a task
   */
  subscribeToTaskComments(
    taskId: string,
    callback: (payload: any) => void
  ) {
    return this.supabase
      .channel(`task-comments:${taskId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'task_comments',
          filter: `task_id=eq.${taskId}`,
        },
        callback
      )
      .subscribe();
  }

  /**
   * Subscribe to activity on a list
   */
  subscribeToListActivity(
    listId: string,
    callback: (payload: any) => void
  ) {
    return this.supabase
      .channel(`list-activity:${listId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'activity_log',
          filter: `entity_id=eq.${listId}`,
        },
        callback
      )
      .subscribe();
  }
}
