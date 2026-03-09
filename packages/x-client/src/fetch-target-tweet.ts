export type ReferencedTweet = {
  id: string;
  type: string;
};

export type MediaMetadata = {
  mediaKey: string;
  type: string;
  url?: string;
  previewImageUrl?: string;
  width?: number;
  height?: number;
  durationMs?: number;
  altText?: string;
};

export type NormalizedTweet = {
  tweetId: string;
  authorId?: string;
  authorHandle?: string;
  text: string;
  createdAt: string;
  conversationId: string;
  referencedTweets: ReferencedTweet[];
  media: MediaMetadata[];
  entities?: {
    urls?: Array<{
      url: string;
      expanded_url?: string;
      display_url?: string;
      title?: string;
    }>;
    mentions?: Array<{
      username: string;
      id?: string;
    }>;
    hashtags?: Array<{
      tag: string;
    }>;
    cashtags?: Array<{
      tag: string;
    }>;
  };
};

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

type XTweetResponse = {
  data?: {
    id?: string;
    author_id?: string;
    text?: string;
    created_at?: string;
    conversation_id?: string;
    referenced_tweets?: Array<{ id?: string; type?: string }>;
    attachments?: {
      media_keys?: string[];
    };
    entities?: {
      urls?: Array<{
        url: string;
        expanded_url?: string;
        display_url?: string;
        title?: string;
      }>;
      mentions?: Array<{
        username: string;
        id?: string;
      }>;
      hashtags?: Array<{
        tag: string;
      }>;
      cashtags?: Array<{
        tag: string;
      }>;
    };
  };
  includes?: {
    users?: Array<{ id?: string; username?: string }>;
    media?: Array<{
      media_key?: string;
      type?: string;
      url?: string;
      preview_image_url?: string;
      width?: number;
      height?: number;
      duration_ms?: number;
      alt_text?: string;
    }>;
  };
  errors?: Array<{ message?: string }>;
};

export class XClientError extends Error {
  readonly status?: number;
  readonly details?: string;

  constructor(message: string, options?: { status?: number; details?: string }) {
    super(message);
    this.name = 'XClientError';
    this.status = options?.status;
    this.details = options?.details;
  }
}

export async function fetchTargetTweet(
  targetTweetId: string,
  options?: {
    bearerToken?: string;
    baseUrl?: string;
    fetchFn?: FetchLike;
  }
): Promise<NormalizedTweet> {
  const tweetId = targetTweetId.trim();
  if (!tweetId) {
    throw new XClientError('targetTweetId is required');
  }

  const bearerToken = options?.bearerToken ?? process.env.X_BEARER_TOKEN ?? '';
  if (!bearerToken) {
    throw new XClientError('X_BEARER_TOKEN is required');
  }

  const fetchFn = options?.fetchFn ?? globalThis.fetch;
  if (!fetchFn) {
    throw new XClientError('fetch is not available in this runtime');
  }

  const baseUrl = (options?.baseUrl ?? 'https://api.x.com').replace(/\/$/, '');
  const params = new URLSearchParams({
    expansions: 'author_id,attachments.media_keys',
    'tweet.fields': 'created_at,conversation_id,author_id,referenced_tweets,text,attachments,entities',
    'user.fields': 'username',
    'media.fields': 'media_key,type,url,preview_image_url,width,height,duration_ms,alt_text'
  });

  const requestUrl = `${baseUrl}/2/tweets/${encodeURIComponent(tweetId)}?${params.toString()}`;

  let response: Response;
  try {
    response = await fetchFn(requestUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${bearerToken}`
      }
    });
  } catch (error) {
    throw new XClientError('Failed to call X API', { details: String(error) });
  }

  if (!response.ok) {
    const details = await safeReadText(response);
    throw new XClientError('X API returned an error', {
      status: response.status,
      details
    });
  }

  const payload = (await response.json()) as XTweetResponse;
  return normalizeTweet(payload);
}

async function safeReadText(response: Response) {
  try {
    return await response.text();
  } catch {
    return 'Unable to read response body';
  }
}

function normalizeTweet(payload: XTweetResponse): NormalizedTweet {
  const data = payload.data;
  if (!data?.id || !data?.text || !data?.created_at || !data?.conversation_id) {
    throw new XClientError('X API response is missing required tweet fields');
  }

  const userLookup = new Map<string, string>();
  for (const user of payload.includes?.users ?? []) {
    if (user.id && user.username) {
      userLookup.set(user.id, user.username);
    }
  }

  const mediaLookup = new Map<string, MediaMetadata>();
  for (const media of payload.includes?.media ?? []) {
    if (!media.media_key || !media.type) {
      continue;
    }

    mediaLookup.set(media.media_key, {
      mediaKey: media.media_key,
      type: media.type,
      url: media.url,
      previewImageUrl: media.preview_image_url,
      width: media.width,
      height: media.height,
      durationMs: media.duration_ms,
      altText: media.alt_text
    });
  }

  const referencedTweets: ReferencedTweet[] = (data.referenced_tweets ?? [])
    .filter((item) => item.id && item.type)
    .map((item) => ({
      id: item.id as string,
      type: item.type as string
    }));

  const media: MediaMetadata[] = (data.attachments?.media_keys ?? [])
    .map((mediaKey) => mediaLookup.get(mediaKey))
    .filter((item): item is MediaMetadata => Boolean(item));

  return {
    tweetId: data.id,
    authorId: data.author_id,
    authorHandle: data.author_id ? userLookup.get(data.author_id) : undefined,
    text: data.text,
    createdAt: data.created_at,
    conversationId: data.conversation_id,
    referencedTweets,
    media,
    entities: data.entities
  };
}
