/**
 * Lists API client
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { List, CreateListInput, UpdateListInput } from '../types';

export class ListsAPI {
  constructor(private supabase: SupabaseClient) {}

  /**
   * Get all lists for the current user (owned + shared)
   */
  async getLists(): Promise<List[]> {
    const { data, error } = await this.supabase
      .from('lists')
      .select(`
        *,
        task_count:tasks(count),
        shared_with:list_shares(*)
      `)
      .order('position', { ascending: true });

    if (error) throw error;

    return (data || []).map((list: any) => ({
      ...list,
      task_count: list.task_count?.[0]?.count || 0,
    })) as List[];
  }

  /**
   * Get a single list by ID
   */
  async getList(id: string): Promise<List> {
    const { data, error } = await this.supabase
      .from('lists')
      .select(`
        *,
        task_count:tasks(count),
        shared_with:list_shares(
          *,
          shared_with_user:profiles!shared_with(id, full_name, email, avatar_url)
        )
      `)
      .eq('id', id)
      .single();

    if (error) throw error;

    return {
      ...data,
      task_count: data.task_count?.[0]?.count || 0,
    } as List;
  }

  /**
   * Get default list for current user
   */
  async getDefaultList(): Promise<List | null> {
    const { data, error } = await this.supabase
      .from('lists')
      .select('*')
      .eq('is_default', true)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No default list found
        return null;
      }
      throw error;
    }

    return data as List;
  }

  /**
   * Create a new list
   */
  async createList(input: CreateListInput): Promise<List> {
    const user = (await this.supabase.auth.getUser()).data.user;
    if (!user) throw new Error('User not authenticated');

    const { data, error } = await this.supabase
      .from('lists')
      .insert({
        ...input,
        owner_id: user.id,
      })
      .select()
      .single();

    if (error) throw error;
    return data as List;
  }

  /**
   * Update a list
   */
  async updateList(id: string, updates: UpdateListInput): Promise<List> {
    const { data, error } = await this.supabase
      .from('lists')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data as List;
  }

  /**
   * Delete a list
   */
  async deleteList(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('lists')
      .delete()
      .eq('id', id);

    if (error) throw error;
  }

  /**
   * Reorder lists
   */
  async reorderLists(listIds: string[]): Promise<void> {
    const updates = listIds.map((id, index) => ({
      id,
      position: index,
    }));

    const { error } = await this.supabase
      .from('lists')
      .upsert(updates);

    if (error) throw error;
  }

  /**
   * Set a list as default
   */
  async setDefaultList(id: string): Promise<void> {
    const user = (await this.supabase.auth.getUser()).data.user;
    if (!user) throw new Error('User not authenticated');

    // First, unset all defaults for this user
    await this.supabase
      .from('lists')
      .update({ is_default: false })
      .eq('owner_id', user.id);

    // Then set the new default
    const { error } = await this.supabase
      .from('lists')
      .update({ is_default: true })
      .eq('id', id);

    if (error) throw error;
  }
}
