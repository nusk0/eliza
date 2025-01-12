import { elizaLogger } from "@elizaos/core";
import { ClientBase } from "./base";
import { IAgentRuntime } from "@elizaos/core";
import { Tweet } from "./types";
import { SearchMode } from "./search";

export class TwitterSourceClient {
    client: ClientBase;
    runtime: IAgentRuntime;
    private isProcessing: boolean = false;
    private lastCheckedTweetId: string | null = null;
    private targetAccounts: string[];

    constructor(client: ClientBase, runtime: IAgentRuntime) {
        this.client = client;
        this.runtime = runtime;
        TWITTER_SOURCE_ACCOUNTS:
        runtime.getSetting("TWITTER_SOURCE_ACCOUNTS") ||
        process.env.TWITTER_SOURCE_ACCOUNTS ||
        "",  // Add this line
        
        // Log configuration
        elizaLogger.log("Twitter Source Client Configuration:");
        elizaLogger.log(`- Monitoring accounts: ${this.targetAccounts.join(', ')}`);
        elizaLogger.log(`- Poll interval: ${this.client.twitterConfig.TWITTER_POLL_INTERVAL} seconds`);
    }

    async start() {
        const handleSourceMonitorLoop = () => {
            this.monitorSourceAccounts();
            setTimeout(
                handleSourceMonitorLoop,
                this.client.twitterConfig.TWITTER_POLL_INTERVAL * 1000
            );
        };

        handleSourceMonitorLoop();
        elizaLogger.log("Source monitoring loop started");
    }

    private async monitorSourceAccounts() {
        if (this.isProcessing) {
            elizaLogger.log("Already processing source accounts, skipping...");
            return;
        }

        this.isProcessing = true;

        try {
            for (const username of this.targetAccounts) {
                elizaLogger.log(`Checking tweets from ${username}`);

                try {
                    const userTweets = (
                        await this.client.twitterClient.fetchSearchTweets(
                            `from:${username}`,
                            5,  // Fetch last 5 tweets
                            SearchMode.Latest
                        )
                    ).tweets;

                    // Filter for unprocessed, non-reply tweets
                    const validTweets = userTweets.filter((tweet) => {
                        const isUnprocessed = !this.lastCheckedTweetId || 
                            parseInt(tweet.id) > parseInt(this.lastCheckedTweetId);
                        const isRecent = Date.now() - tweet.timestamp * 1000 < 
                            2 * 60 * 60 * 1000;  // Last 2 hours

                        return isUnprocessed && !tweet.isReply && !tweet.isRetweet && isRecent;
                    });

                    if (validTweets.length > 0) {
                        elizaLogger.log(`Found ${validTweets.length} new tweets from ${username}`);
                        await this.processTweets(validTweets);
                        
                        // Update last checked ID
                        const latestTweetId = Math.max(...validTweets.map(t => parseInt(t.id))).toString();
                        this.lastCheckedTweetId = latestTweetId;
                        
                        // Cache the latest checked ID
                        await this.client.cacheManager.set(
                            `twitter/source/${username}/lastChecked`,
                            { id: latestTweetId, timestamp: Date.now() }
                        );
                    }

                } catch (error) {
                    elizaLogger.error(`Error fetching tweets for ${username}:`, error);
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
                // Create memory entry for the tweet
                await this.runtime.messageManager.createMemory({
                    id: stringToUuid(tweet.id + "-source-" + this.runtime.agentId),
                    userId: this.runtime.agentId,
                    agentId: this.runtime.agentId,
                    content: {
                        text: tweet.text,
                        url: tweet.permanentUrl,
                        source: "twitter_source",
                        sourceUser: tweet.username
                    },
                    roomId: stringToUuid("twitter-source-" + this.runtime.agentId),
                    embedding: getEmbeddingZeroVector(),
                    createdAt: tweet.timestamp,
                });

                elizaLogger.log(`Processed tweet from ${tweet.username}: ${tweet.id}`);
            } catch (error) {
                elizaLogger.error(`Error processing tweet ${tweet.id}:`, error);
            }
        }
    }

    async stop() {
        this.isProcessing = false;
    }
}
