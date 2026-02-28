import { YoutubeTranscript } from 'youtube-transcript';

const MAX_TRANSCRIPT_LENGTH = 16000; // ~4000 tokens

/**
 * Extract video ID from various YouTube URL formats
 */
function extractVideoId(url: string): string | null {
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

/**
 * Fetch YouTube transcript and truncate to token budget
 */
export async function getYouTubeTranscript(url: string): Promise<string> {
  const videoId = extractVideoId(url);
  if (!videoId) {
    throw new Error('Invalid YouTube URL');
  }

  const transcriptItems = await YoutubeTranscript.fetchTranscript(videoId);

  if (!transcriptItems || transcriptItems.length === 0) {
    throw new Error('No transcript available for this video');
  }

  // Combine all transcript segments
  let fullText = transcriptItems.map((item) => item.text).join(' ');

  // Truncate to max length for token efficiency
  if (fullText.length > MAX_TRANSCRIPT_LENGTH) {
    fullText = fullText.substring(0, MAX_TRANSCRIPT_LENGTH) + '... (truncated)';
  }

  return fullText;
}
