import {
  FetchLike,
  NormalizedTweet,
  XClientError,
  XClientOptions,
  fetchTargetTweet,
  normalizeTweet
} from './fetch-target-tweet';

type SearchTweetsResponse = {
  data?: Array<{
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
  }>;
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
};

export type NormalizedThread = {
  mode: 'thread';
  targetTweetId: string;
  rootTweetId: string;
  conversationId: string;
  tweets: NormalizedTweet[];
};

export async function fetchThreadForTweet(
  targetTweetId: string,
  options?: XClientOptions
): Promise<NormalizedThread> {
  const targetTweet = await fetchTargetTweet(targetTweetId, options);
  const parentTweets = await fetchParentChain(targetTweet, options);
  const conversationTweets = await fetchConversationTweets(targetTweet, options);

  const orderedTweets = dedupeTweets([...parentTweets, targetTweet, ...conversationTweets]).sort(
    (left, right) => left.createdAt.localeCompare(right.createdAt)
  );

  return {
    mode: 'thread',
    targetTweetId: targetTweet.tweetId,
    rootTweetId: orderedTweets[0]?.tweetId ?? targetTweet.tweetId,
    conversationId: targetTweet.conversationId,
    tweets: orderedTweets
  };
}

async function fetchParentChain(targetTweet: NormalizedTweet, options?: XClientOptions) {
  const parentTweets: NormalizedTweet[] = [];
  const seenTweetIds = new Set<string>([targetTweet.tweetId]);
  let currentTweet = targetTweet;

  while (true) {
    const repliedToReference = currentTweet.referencedTweets.find(
      (reference) => reference.type === 'replied_to'
    );
    if (!repliedToReference || seenTweetIds.has(repliedToReference.id)) {
      break;
    }

    const parentTweet = await fetchTargetTweet(repliedToReference.id, options);
    parentTweets.unshift(parentTweet);
    seenTweetIds.add(parentTweet.tweetId);
    currentTweet = parentTweet;

    if (parentTweets.length >= 25) {
      break;
    }
  }

  return parentTweets;
}

async function fetchConversationTweets(targetTweet: NormalizedTweet, options?: XClientOptions) {
  if (!targetTweet.authorHandle) {
    return [];
  }

  const fetchFn = options?.fetchFn ?? globalThis.fetch;
  if (!fetchFn) {
    throw new XClientError('fetch is not available in this runtime');
  }

  const bearerToken = options?.bearerToken ?? process.env.X_BEARER_TOKEN ?? '';
  if (!bearerToken) {
    throw new XClientError('X_BEARER_TOKEN is required');
  }

  const baseUrl = (options?.baseUrl ?? 'https://api.x.com').replace(/\/$/, '');
  const params = new URLSearchParams({
    query: `conversation_id:${targetTweet.conversationId} from:${targetTweet.authorHandle}`,
    expansions: 'author_id,attachments.media_keys',
    'tweet.fields': 'created_at,conversation_id,author_id,referenced_tweets,text,attachments,entities',
    'user.fields': 'username',
    'media.fields': 'media_key,type,url,preview_image_url,width,height,duration_ms,alt_text',
    max_results: '100'
  });

  const requestUrl = `${baseUrl}/2/tweets/search/recent?${params.toString()}`;

  let response: Response;
  try {
    response = await fetchFn(requestUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${bearerToken}`
      }
    });
  } catch (error) {
    throw new XClientError('Failed to search thread tweets on X', {
      details: String(error)
    });
  }

  if (!response.ok) {
    throw new XClientError('X API returned an error while loading thread tweets', {
      status: response.status,
      details: await safeReadText(response)
    });
  }

  const payload = (await response.json()) as SearchTweetsResponse;
  return (payload.data ?? []).map((tweet) =>
    normalizeTweet({
      data: tweet,
      includes: payload.includes
    })
  );
}

function dedupeTweets(tweets: NormalizedTweet[]) {
  const dedupedTweets = new Map<string, NormalizedTweet>();

  for (const tweet of tweets) {
    dedupedTweets.set(tweet.tweetId, tweet);
  }

  return [...dedupedTweets.values()];
}

async function safeReadText(response: Response) {
  try {
    return await response.text();
  } catch {
    return 'Unable to read response body';
  }
}
