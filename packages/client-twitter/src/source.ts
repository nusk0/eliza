import { elizaLogger, stringToUuid, getEmbeddingZeroVector } from "@elizaos/core";
import { ClientBase } from "./base";
import { IAgentRuntime } from "@elizaos/core";
import { SearchMode, Tweet } from "agent-twitter-client";
import { buildConversationThread } from "./utils";

export class TwitterSourceClient {
    client: ClientBase;
    runtime: IAgentRuntime;
    private isProcessing: boolean = false;
    private lastCheckedTweetId: string | null = null;
    private targetAccounts: string[];
    
    constructor(client: ClientBase, runtime: IAgentRuntime) {
        this.client = client;
        this.runtime = runtime;
        const accountString = runtime.getSetting("TWITTER_SOURCE_ACCOUNTS") ||
        process.env.TWITTER_SOURCE_ACCOUNTS ||
        "";

        this.targetAccounts = accountString
            .split(',')
            .map(account => account.trim().replace('@', ''))  // Remove @ if present
            .filter(account => account.length > 0);
        // Log configuration
        elizaLogger.log("Twitter Source Client Configuration:");
        console.log(this.targetAccounts);
        //elizaLogger.log(`- Monitoring accounts: ${this.targetAccounts.join(', ')}`);
        elizaLogger.log(`- Poll interval: ${this.client.twitterConfig.TWITTER_POLL_INTERVAL} seconds`);
    }

    async start() {
        const handleSourceMonitorLoop = () => {
            this.monitorSourceAccounts();
            setTimeout(
                handleSourceMonitorLoop,
                this.client.twitterConfig.TWITTER_POLL_INTERVAL * 10
            );
            //const aixbtUserId = stringToUuid('aixbt_agent');
            //const memories =  this.runtime.messageManager.getMemoriesByRoomIds([aixbtUserId]);
           // console.log("LATEST aixbt memory:", memories[0]);
        };
        handleSourceMonitorLoop();

       // elizaLogger.log("Source monitoring loop started");
    }

    private async monitorSourceAccounts() {
        if (this.isProcessing) {
            elizaLogger.log("Already processing source accounts, skipping...");
            return;
        }

        this.isProcessing = true;

        try {
            for (const username of this.targetAccounts) {
                elizaLogger.log(`Checking tweets from source account ${username}`);
                const aixbtUserId = stringToUuid('aixbt_agent');
                const memories = await this.runtime.messageManager.getMemories({
                    roomId: aixbtUserId,
                    count: 1,
                    unique: true
                });
                
                if (memories.length > 0) {
                    elizaLogger.log('Latest aiXBT memory:', {
                        id: memories[0].id,
                        text: memories[0].content.text,
                        timestamp: new Date(memories[0].createdAt).toISOString()
                    });
                } else {
                    elizaLogger.log('No memories found for aiXBT');
                }
                try {
                    // Fetch both tweets and replies from the user
                    const [userTweetsResponse, userRepliesResponse] = await Promise.all([
                        // Fetch regular tweets
                        this.client.twitterClient.fetchSearchTweets(
                            `from:${username}`,
                            20,
                            SearchMode.Latest
                        ).catch(error => {
                            elizaLogger.error(`Error fetching tweets for ${username}:`, error);
                            return { tweets: [] };
                        }),
                        // Fetch replies
                        this.client.twitterClient.fetchSearchTweets(
                            `from:${username} is:reply`,
                            20,
                            SearchMode.Latest
                        ).catch(error => {
                            elizaLogger.error(`Error fetching replies for ${username}:`, error);
                            return { tweets: [] };
                        })
                    ]);

                    // Combine tweets and replies
                    const allTweets = [...(userTweetsResponse?.tweets || []), ...(userRepliesResponse?.tweets || [])];

                    // Filter for unprocessed tweets
                    const validTweets = allTweets.filter((tweet) => {
                        if (!tweet || !tweet.id || !tweet.timestamp) {
                            elizaLogger.warn("Invalid tweet object found:", tweet);
                            return false;
                        }

                        try {
                            const isUnprocessed = !this.lastCheckedTweetId || 
                                parseInt(tweet.id) > parseInt(this.lastCheckedTweetId);
                            const isRecent = Date.now() - tweet.timestamp * 1000 < 
                                2 * 60 * 60 * 1000;  // Last 2 hours

                            return isUnprocessed && !tweet.isRetweet && isRecent;
                        } catch (error) {
                            elizaLogger.error(`Error filtering tweet ${tweet.id}:`, error);
                            return false;
                        }
                    });

                    if (validTweets.length > 0) {
                        elizaLogger.log(`Found ${validTweets.length} new tweets/replies from ${username}`);
                        
                        // For replies, fetch the conversation thread
                        for (const tweet of validTweets) {
                            if (tweet.isReply) {
                                try {
                                    const thread = await buildConversationThread(tweet, this.client);
                                    // Create a clean version of the thread without circular references
                                    tweet.conversationThread = thread.map(t => ({
                                        id: t.id,
                                        text: t.text,
                                        username: t.username,
                                        timestamp: t.timestamp,
                                        isReply: t.isReply,
                                        isRetweet: t.isRetweet,
                                        inReplyToStatusId: t.inReplyToStatusId,
                                        permanentUrl: t.permanentUrl
                                    }));
                                } catch (error) {
                                    elizaLogger.error(`Error fetching conversation thread for tweet ${tweet.id}:`, error);
                                    tweet.conversationThread = [];
                                }
                            }
                        }
                        
                        await this.processTweets(validTweets);
                        
                        // Update last checked ID
                        const validIds = validTweets
                            .filter(t => t.id)
                            .map(t => parseInt(t.id))
                            .filter(id => !isNaN(id));

                        if (validIds.length > 0) {
                            const latestTweetId = Math.max(...validIds).toString();
                            this.lastCheckedTweetId = latestTweetId;
                            
                            // Cache the latest checked ID
                            await this.client.cacheManager.set(
                                `twitter/source/${username}/lastChecked`,
                                { id: latestTweetId, timestamp: Date.now() }
                            ).catch(error => {
                                elizaLogger.error(`Error caching latest tweet ID for ${username}:`, error);
                            });
                        }
                    }

                } catch (error) {
                    elizaLogger.error(`Error processing tweets for ${username}:`, error);
                    continue;
                }
            }
        } finally {
            this.isProcessing = false;
        }
    }

    private async processTweets(tweets: Tweet[]) {
        for (const tweet of tweets) {
            try {
                if (!tweet.id || !tweet.text || !tweet.timestamp) {
                    elizaLogger.warn("Skipping invalid tweet:", tweet);
                    continue;
                }

                // Serialize conversation thread to avoid circular references
                /*const serializedThread = tweet.conversationThread?.map(t => ({
                    id: t.id,
                    text: t.text,
                    username: t.username,
                    timestamp: t.timestamp,
                    isReply: t.isReply,
                    isRetweet: t.isRetweet,
                    inReplyToStatusId: t.inReplyToStatusId,
                    permanentUrl: t.permanentUrl
                }));*/
                
                const roomId = stringToUuid(tweet.conversationId);
                elizaLogger.log("Creating new memory:", {
                    id: tweet.id + "-" + this.runtime.agentId,
                    text: tweet.text,
                    source: "twitter",
                    url: tweet.permanentUrl,
                    inReplyTo: tweet.inReplyToStatusId,
                    createdAt: new Date(tweet.timestamp * 1000).toISOString(),
                    roomId: roomId,
                    userId: tweet.userId === this.twitterUserId ? this.runtime.agentId : tweet.userId
                });
                // Create memory entry for the tweet
                this.runtime.messageManager.createMemory({
                    id: stringToUuid(
                        tweet.id + "-" + this.runtime.agentId
                    ),
                    agentId: this.runtime.agentId,
                    content: {
                        text: tweet.text,
                        source: "twitter",
                        url: tweet.permanentUrl,
                        inReplyTo: tweet.inReplyToStatusId
                            ? stringToUuid(
                                tweet.inReplyToStatusId +
                                      "-" +
                                      this.runtime.agentId
                              )
                            : undefined,
                    },
                    createdAt: tweet.timestamp * 1000,
                    roomId,
                     userId:
                     tweet.userId === this.twitterUserId
                            ? this.runtime.agentId
                            : stringToUuid(tweet.userId),
                    embedding: getEmbeddingZeroVector(),
                });

                elizaLogger.log(`Processed ${tweet.isReply ? 'reply' : 'tweet'} from ${tweet.username}: ${tweet.id}`);
            } catch (error) {
                elizaLogger.error(`Error processing tweet ${tweet.id}:`, error?.message || error);
            }
        }
    }

    async stop() {
        this.isProcessing = false;
    }
}
