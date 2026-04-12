// scrapeUrl — fetches URL server-side, extracts clean text (avoids CORS)
const { onCall, HttpsError } = require('firebase-functions/v2/https');

exports.scrapeUrl = onCall(async (request) => {
  const { url } = request.data;
  if (!url) throw new HttpsError('invalid-argument', 'url is required');

  try {
    new URL(url); // validate URL
  } catch {
    throw new HttpsError('invalid-argument', 'Invalid URL');
  }

  const response = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BayanPlay/1.0)' },
    signal: AbortSignal.timeout(8000),
  });

  if (!response.ok) {
    throw new HttpsError('unavailable', `Failed to fetch: ${response.status}`);
  }

  const html = await response.text();

  // Basic HTML to text extraction — strips tags, scripts, styles
  const text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#\d+;/g, '')
    .trim()
    .slice(0, 15000); // cap at 15k chars

  const wordCount = text.split(/\s+/).length;

  return {
    text,
    wordCount,
    url,
    title: html.match(/<title[^>]*>(.*?)<\/title>/i)?.[1]?.trim() || url,
  };
});
