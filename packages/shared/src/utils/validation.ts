/**
 * Validation utilities
 */

import { z } from 'zod';
import { RecurrenceRule } from '../types';

/**
 * Email validation
 */
export function isValidEmail(email: string): boolean {
  const emailSchema = z.string().email();
  return emailSchema.safeParse(email).success;
}

/**
 * Task title validation
 */
export function isValidTaskTitle(title: string): boolean {
  return title.trim().length > 0 && title.length <= 500;
}

/**
 * List name validation
 */
export function isValidListName(name: string): boolean {
  return name.trim().length > 0 && name.length <= 100;
}

/**
 * File size validation (in bytes)
 */
export function isValidFileSize(sizeBytes: number, maxSizeMB: number): boolean {
  const maxSizeBytes = maxSizeMB * 1024 * 1024;
  return sizeBytes > 0 && sizeBytes <= maxSizeBytes;
}

/**
 * Allowed file types for attachments
 */
const ALLOWED_FILE_TYPES = [
  // Images
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
  // Documents
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'text/markdown',
  // Archives
  'application/zip',
  'application/x-rar-compressed',
];

/**
 * File type validation
 */
export function isValidFileType(mimeType: string): boolean {
  return ALLOWED_FILE_TYPES.includes(mimeType);
}

/**
 * URL validation
 */
export function isValidUrl(url: string): boolean {
  const urlSchema = z.string().url();
  return urlSchema.safeParse(url).success;
}

/**
 * Color hex validation
 */
export function isValidHexColor(color: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(color);
}

/**
 * Sanitize user input (basic XSS prevention)
 */
export function sanitizeInput(input: string): string {
  return input
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

/**
 * Truncate text to a maximum length
 */
export function truncate(text: string, maxLength: number, suffix: string = '...'): string {
  if (text.length <= maxLength) {
    return text;
  }
  return text.substring(0, maxLength - suffix.length) + suffix;
}
