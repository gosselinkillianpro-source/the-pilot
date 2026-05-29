/**
 * Export CSV au format Metricool (Mtr_calendar_template).
 * Port de sah-social/core/metricool.py.
 */

export const METRICOOL_COLUMNS = [
  'Text',
  'Date',
  'Time',
  'Draft',
  'Facebook',
  'Twitter/X',
  'LinkedIn',
  'GBP',
  'Instagram',
  'Pinterest',
  'TikTok',
  'Youtube',
  'Threads',
  'Bluesky',
  'Picture Url 1',
  'Picture Url 2',
  'Picture Url 3',
  'Picture Url 4',
  'Picture Url 5',
  'Picture Url 6',
  'Picture Url 7',
  'Picture Url 8',
  'Picture Url 9',
  'Picture Url 10',
  'Alt text picture 1',
  'Alt text picture 2',
  'Alt text picture 3',
  'Alt text picture 4',
  'Alt text picture 5',
  'Alt text picture 6',
  'Alt text picture 7',
  'Alt text picture 8',
  'Alt text picture 9',
  'Alt text picture 10',
  'Document title',
  'Shortener',
  'Video Thumbnail Url',
  'Video Cover Frame',
  'Twitter/X Can reply',
  'Twitter/X Type',
  'Twitter/X Poll Duration minutes',
  'Twitter/X Poll Option 1',
  'Twitter/X Poll Option 2',
  'Twitter/X Poll Option 3',
  'Twitter/X Poll Option 4',
  'Pinterest Board',
  'Pinterest Pin Title',
  'Pinterest Pin Link',
  'Pinterest Pin New Format',
  'Instagram Post Type',
  'Instagram Show Reel On Feed',
  'Youtube Video Title',
  'Youtube Video Type',
  'Youtube Video Privacy',
  'Youtube video for kids',
  'Youtube Video Category',
  'Youtube Video Tags',
  'Youtube playlist',
  'GBP Post Type',
  'Facebook Post Type',
  'Facebook Title',
  'First Comment Text',
  'TikTok Title',
  'TikTok disable comments',
  'TikTok disable duet',
  'TikTok disable stitch',
  'TikTok Post Privacy',
  'TikTok Branded Content',
  'TikTok Your Brand',
  'TikTok Auto Add Music',
  'TikTok Photo Cover Index',
  'TikTok musicId',
  'TikTok music title',
  'TikTok music author',
  'TikTok music previewUrl',
  'TikTok music thumbnailUrl',
  'TikTok music soundVolume',
  'TikTok music originalVolume',
  'TikTok music startMillis',
  'TikTok music endMillis',
  'TikTok Ai generated content',
  'LinkedIn Type',
  'LinkedIn Poll Question',
  'LinkedIn Poll Option 1',
  'LinkedIn Poll Option 2',
  'LinkedIn Poll Option 3',
  'LinkedIn Poll Option 4',
  'LinkedIn Poll Duration',
  'LinkedIn Show link preview',
  'LinkedIn Images as Carousel',
  'Threads Reply Control',
  'Threads Is Spoiler',
  'Threads Post Type',
  'Brand name',
] as const;

export type MetricoolPost = {
  text: string;
  platform: string;
  scheduledDate: string | null;
  scheduledTime: string | null;
  isCarousel: boolean;
  title: string | null;
  imageUrls: string[];
};

function csvCell(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function buildRow(post: MetricoolPost): string[] {
  const row: Record<string, string> = {};
  for (const col of METRICOOL_COLUMNS) row[col] = '';

  row.Text = post.text;
  row.Date = post.scheduledDate ?? '';
  row.Time = post.scheduledTime ?? '';
  row.Draft = 'false';

  const platform = post.platform.toLowerCase();
  if (platform === 'facebook') {
    row.Facebook = 'true';
    row['Facebook Post Type'] = 'POST';
  } else if (platform === 'instagram') {
    row.Instagram = 'true';
    row['Instagram Post Type'] = 'POST';
  } else if (platform === 'linkedin') {
    row.LinkedIn = 'true';
    row['LinkedIn Type'] = 'POST';
    row['LinkedIn Show link preview'] = 'true';
    if (post.isCarousel && post.imageUrls.length > 1) row['LinkedIn Images as Carousel'] = 'true';
  }

  post.imageUrls.slice(0, 10).forEach((url, i) => {
    row[`Picture Url ${i + 1}`] = url;
    row[`Alt text picture ${i + 1}`] = post.title ?? 'Seven At Home';
  });

  row['Brand name'] = 'Seven At Home';
  return METRICOOL_COLUMNS.map((c) => csvCell(row[c] ?? ''));
}

export function buildMetricoolCsv(posts: MetricoolPost[]): string {
  const header = METRICOOL_COLUMNS.join(',');
  const rows = posts.map((p) => buildRow(p).join(','));
  return [header, ...rows].join('\n');
}
