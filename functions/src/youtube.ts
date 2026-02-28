import { YoutubeTranscript } from 'youtube-transcript';

const MAX_TRANSCRIPT_LENGTH = 16000; // ~4000 tokens

/**
 * Extract video ID from various YouTube URL formats
 */
export function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/,
    /(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

export interface YouTubeVideoInfo {
  transcript: string | null;
  metadata: YouTubeMetadata | null;
  hasTranscript: boolean;
}

interface YouTubeMetadata {
  title: string;
  author: string;
  description: string;
}

/**
 * Fetch YouTube video metadata via oEmbed API (no API key needed)
 */
async function getVideoMetadata(videoId: string): Promise<YouTubeMetadata | null> {
  try {
    const url = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
    const response = await fetch(url);
    if (!response.ok) return null;
    const data = await response.json();
    return {
      title: data.title || '',
      author: data.author_name || '',
      description: '',
    };
  } catch {
    return null;
  }
}

/**
 * Scrape video description from YouTube page
 */
async function getVideoDescription(videoId: string): Promise<string> {
  try {
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1)' },
    });
    if (!response.ok) return '';
    const html = await response.text();

    // Extract description from meta tag
    const descMatch = html.match(/<meta\s+name="description"\s+content="([^"]*)"/)
      || html.match(/<meta\s+content="([^"]*)"\s+name="description"/);
    return descMatch ? descMatch[1] : '';
  } catch {
    return '';
  }
}

/**
 * Fetch YouTube transcript, falling back to metadata if transcript unavailable
 */
export async function getYouTubeVideoInfo(url: string): Promise<YouTubeVideoInfo> {
  const videoId = extractVideoId(url);
  if (!videoId) {
    throw new Error('Invalid YouTube URL');
  }

  // Try transcript first
  try {
    const transcriptItems = await YoutubeTranscript.fetchTranscript(videoId);
    if (transcriptItems && transcriptItems.length > 0) {
      let fullText = transcriptItems.map((item) => item.text).join(' ');
      if (fullText.length > MAX_TRANSCRIPT_LENGTH) {
        fullText = fullText.substring(0, MAX_TRANSCRIPT_LENGTH) + '... (truncated)';
      }
      return { transcript: fullText, metadata: null, hasTranscript: true };
    }
  } catch {
    // Transcript not available, fall through to metadata
  }

  // Fallback: get metadata
  const [metadata, description] = await Promise.all([
    getVideoMetadata(videoId),
    getVideoDescription(videoId),
  ]);

  if (metadata) {
    metadata.description = description;
  }

  return {
    transcript: null,
    metadata: metadata || { title: '', author: '', description: description },
    hasTranscript: false,
  };
}
