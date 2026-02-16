/**
 * Tasks API client
 */

import { SupabaseClient } from '@supabase/supabase-js';
import {
  Task,
  CreateTaskInput,
  UpdateTaskInput,
  TaskFilters,
  TaskSort,
} from '../types';

export class TasksAPI {
  constructor(private supabase: SupabaseClient) {}

  /**
   * Get all tasks in a list
   */
  async getTasksByList(listId: string, includeCompleted: boolean = true): Promise<Task[]> {
    let query = this.supabase
      .from('tasks')
      .select('*, subtasks:tasks!parent_task_id(*), attachments:task_attachments(*)')
      .eq('list_id', listId)
      .is('parent_task_id', null) // Only top-level tasks
      .order('position', { ascending: true });

    if (!includeCompleted) {
      query = query.neq('status', 'completed');
    }

    const { data, error } = await query;

    if (error) throw error;
    return data as Task[];
  }

  /**
   * Get tasks for "My Day" view
   */
  async getMyDayTasks(): Promise<Task[]> {
    const today = new Date().toISOString().split('T')[0];

    const { data, error } = await this.supabase
      .from('tasks')
      .select('*, subtasks:tasks!parent_task_id(*), attachments:task_attachments(*)')
      .eq('my_day_date', today)
      .is('parent_task_id', null)
      .order('position', { ascending: true });

    if (error) throw error;
    return data as Task[];
  }

  /**
   * Get a single task by ID
   */
  async getTask(id: string): Promise<Task> {
    const { data, error } = await this.supabase
      .from('tasks')
      .select('*, subtasks:tasks!parent_task_id(*), attachments:task_attachments(*)')
      .eq('id', id)
      .single();

    if (error) throw error;
    return data as Task;
  }

  /**
   * Create a new task
   */
  async createTask(input: CreateTaskInput): Promise<Task> {
    const { data, error } = await this.supabase
      .from('tasks')
      .insert({
        ...input,
        created_by: (await this.supabase.auth.getUser()).data.user?.id,
      })
      .select()
      .single();

    if (error) throw error;
    return data as Task;
  }

  /**
   * Update a task
   */
  async updateTask(id: string, updates: UpdateTaskInput): Promise<Task> {
    const { data, error } = await this.supabase
      .from('tasks')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data as Task;
  }

  /**
   * Delete a task
   */
  async deleteTask(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('tasks')
      .delete()
      .eq('id', id);

    if (error) throw error;
  }

  /**
   * Add task to "My Day"
   */
  async addToMyDay(taskId: string): Promise<Task> {
    const today = new Date().toISOString().split('T')[0];
    return this.updateTask(taskId, { my_day_date: today });
  }

  /**
   * Remove task from "My Day"
   */
  async removeFromMyDay(taskId: string): Promise<Task> {
    return this.updateTask(taskId, { my_day_date: null });
  }

  /**
   * Toggle task completion
   */
  async toggleComplete(taskId: string, currentStatus: string): Promise<Task> {
    const newStatus = currentStatus === 'completed' ? 'todo' : 'completed';
    return this.updateTask(taskId, { status: newStatus });
  }

  /**
   * Get subtasks of a task
   */
  async getSubtasks(parentTaskId: string): Promise<Task[]> {
    const { data, error } = await this.supabase
      .from('tasks')
      .select('*')
      .eq('parent_task_id', parentTaskId)
      .order('position', { ascending: true });

    if (error) throw error;
    return data as Task[];
  }

  /**
   * Create a subtask
   */
  async createSubtask(parentTaskId: string, input: Omit<CreateTaskInput, 'list_id'>): Promise<Task> {
    // Get parent task to inherit list_id
    const parent = await this.getTask(parentTaskId);

    return this.createTask({
      ...input,
      list_id: parent.list_id,
      parent_task_id: parentTaskId,
    });
  }

  /**
   * Search tasks across all lists
   */
  async searchTasks(query: string): Promise<Task[]> {
    const { data, error } = await this.supabase
      .from('tasks')
      .select('*')
      .or(`title.ilike.%${query}%,description.ilike.%${query}%`)
      .is('parent_task_id', null)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;
    return data as Task[];
  }

  /**
   * Get tasks with filters
   */
  async getTasksWithFilters(filters: TaskFilters, sort?: TaskSort): Promise<Task[]> {
    let query = this.supabase
      .from('tasks')
      .select('*')
      .is('parent_task_id', null);

    // Apply filters
    if (filters.status && filters.status.length > 0) {
      query = query.in('status', filters.status);
    }

    if (filters.priority && filters.priority.length > 0) {
      query = query.in('priority', filters.priority);
    }

    if (filters.list_id) {
      query = query.eq('list_id', filters.list_id);
    }

    if (filters.assigned_to) {
      query = query.eq('assigned_to', filters.assigned_to);
    }

    if (filters.has_due_date !== undefined) {
      if (filters.has_due_date) {
        query = query.not('due_date', 'is', null);
      } else {
        query = query.is('due_date', null);
      }
    }

    if (filters.my_day_only) {
      const today = new Date().toISOString().split('T')[0];
      query = query.eq('my_day_date', today);
    }

    if (filters.search) {
      query = query.or(`title.ilike.%${filters.search}%,description.ilike.%${filters.search}%`);
    }

    if (filters.tags && filters.tags.length > 0) {
      query = query.overlaps('tags', filters.tags);
    }

    // Apply sorting
    if (sort) {
      query = query.order(sort.field, { ascending: sort.order === 'asc' });
    } else {
      query = query.order('position', { ascending: true });
    }

    const { data, error } = await query;

    if (error) throw error;
    return data as Task[];
  }

  /**
   * Get overdue tasks
   */
  async getOverdueTasks(): Promise<Task[]> {
    const now = new Date().toISOString();

    const { data, error } = await this.supabase
      .from('tasks')
      .select('*')
      .lt('due_date', now)
      .neq('status', 'completed')
      .is('parent_task_id', null)
      .order('due_date', { ascending: true });

    if (error) throw error;
    return data as Task[];
  }

  /**
   * Reorder tasks
   */
  async reorderTasks(taskIds: string[]): Promise<void> {
    const updates = taskIds.map((id, index) => ({
      id,
      position: index,
    }));

    const { error } = await this.supabase
      .from('tasks')
      .upsert(updates);

    if (error) throw error;
  }
}
