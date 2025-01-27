import { Tweet } from "agent-twitter-client";
import { getEmbeddingZeroVector } from "@elizaos/core";
import type { Content, Memory, UUID, IAgentRuntime } from "@elizaos/core";

import { stringToUuid } from "@elizaos/core";
import { ClientBase } from "./base";
import { elizaLogger } from "@elizaos/core";
import { DEFAULT_MAX_TWEET_LENGTH } from "./environment";
import { Media } from "@elizaos/core";
import fs from "fs";
import path from "path";

export const wait = (minTime: number = 1000, maxTime: number = 3000) => {
    const waitTime =
        Math.floor(Math.random() * (maxTime - minTime + 1)) + minTime;
    return new Promise((resolve) => setTimeout(resolve, waitTime));
};

export const isValidTweet = (tweet: Tweet): boolean => {
    // Filter out tweets with too many hashtags, @s, or $ signs, probably spam or garbage
    const hashtagCount = (tweet.text?.match(/#/g) || []).length;
    const atCount = (tweet.text?.match(/@/g) || []).length;
    const dollarSignCount = (tweet.text?.match(/\$/g) || []).length;
    const totalCount = hashtagCount + atCount + dollarSignCount;

    return (
        hashtagCount <= 1 &&
        atCount <= 2 &&
        dollarSignCount <= 1 &&
        totalCount <= 3
    );
};

export async function buildConversationThread(
    
    tweet: Tweet,
    client: ClientBase,
    maxReplies: number = 10
): Promise<Tweet[]> {
    const thread: Tweet[] = [];
    const visited: Set<string> = new Set();
    const conversationId = stringToUuid(tweet.conversationId + "-" + client.runtime.agentId);
    const existingConversation = await client.runtime.databaseAdapter.getConversation(conversationId);
    console.log("Starting to build conversation thread");

    async function processThread(currentTweet: Tweet, depth: number = 0) {
        elizaLogger.debug("Processing tweet:", {
            id: currentTweet.id,
            inReplyToStatusId: currentTweet.inReplyToStatusId,
            depth: depth,
        });

        if (!currentTweet) {
            elizaLogger.debug("No current tweet found for thread building");
            return;
        }

        // Stop if we've reached our reply limit
        if (depth >= maxReplies) {
            elizaLogger.debug("Reached maximum reply depth", depth);
            return;
        }

        // Handle memory storage
        const memory = await client.runtime.messageManager.getMemoryById(
            stringToUuid(currentTweet.id + "-" + client.runtime.agentId)
        );
        if (!memory) {
            const roomId = stringToUuid(
                currentTweet.conversationId + "-" + client.runtime.agentId
            );
            const userId = stringToUuid(currentTweet.userId);

            await client.runtime.ensureConnection(
                userId,
                roomId,
                currentTweet.username,
                currentTweet.name,
                "twitter"
            );

            await client.runtime.messageManager.createMemory({
                id: stringToUuid(
                    currentTweet.id + "-" + client.runtime.agentId
                ),
                agentId: client.runtime.agentId,
                content: {
                    text: currentTweet.text,
                    source: "twitter",
                    url: currentTweet.permanentUrl,
                    inReplyTo: currentTweet.inReplyToStatusId
                        ? stringToUuid(
                              currentTweet.inReplyToStatusId +
                                  "-" +
                                  client.runtime.agentId
                          )
                        : undefined,
                },
                createdAt: currentTweet.timestamp * 1000,
                roomId,
                userId:
                    currentTweet.userId === client.profile.id
                        ? client.runtime.agentId
                        : stringToUuid(currentTweet.userId),
                embedding: getEmbeddingZeroVector(),
            });
        }

        if (visited.has(currentTweet.id)) {
            elizaLogger.debug("Already visited tweet:", currentTweet.id);
            return;
        }

        visited.add(currentTweet.id);
        thread.unshift(currentTweet);

        elizaLogger.debug("Current thread state:", {
            length: thread.length,
            currentDepth: depth,
            tweetId: currentTweet.id,
        });

        // If there's a parent tweet, fetch and process it
        if (currentTweet.inReplyToStatusId) {
            elizaLogger.debug(
                "Fetching parent tweet:",
                currentTweet.inReplyToStatusId
            );
            try {
                const parentTweet = await client.twitterClient.getTweet(
                    currentTweet.inReplyToStatusId
                );

                if (parentTweet) {
                    elizaLogger.debug("Found parent tweet:", {
                        id: parentTweet.id,
                        text: parentTweet.text?.slice(0, 50),
                    });
                    await processThread(parentTweet, depth + 1);
                } else {
                    elizaLogger.debug(
                        "No parent tweet found for:",
                        currentTweet.inReplyToStatusId
                    );
                }
            } catch (error) {
                elizaLogger.error("Error fetching parent tweet:", {
                    tweetId: currentTweet.inReplyToStatusId,
                    error,
                });
            }
        } else {
            elizaLogger.debug(
                "Reached end of reply chain at:",
                currentTweet.id
            );
        }
    }

    await processThread(tweet, 0);

    // After thread is built, store conversation
    const messageIds = thread.map(t =>
        stringToUuid(t.id + "-" + client.runtime.agentId)
    );

    const participantIds = [...new Set(thread.map(t =>
        t.userId === client.profile.id
            ? client.runtime.agentId
            : stringToUuid(t.userId)
    ))];

    // Format conversation for analysis
    const formattedConversation = thread.map(tweet => `@${tweet.username}: ${tweet.text}`)
        .join("\n");

    elizaLogger.log("Conversation thread built:", {
        messageCount: thread.length,
        participants: thread.map(t => t.username).filter((v, i, a) => a.indexOf(v) === i),
        messageIds: messageIds,
        conversationId: conversationId
    });
    console.log("before creating conversation")
    if (existingConversation) {
        // Parse existing JSON arrays
        elizaLogger.log("Updating existing conversation", {
            id: conversationId,
            newMessageCount: messageIds.length,
            
        });
        const existingMessageIds = JSON.parse(existingConversation.messageIds);
        const existingParticipantIds = JSON.parse(existingConversation.participantIds);
        console.log("inside creating conversation")
        await client.runtime.databaseAdapter.updateConversation({
            id: conversationId,
            messageIds: JSON.stringify([...new Set([...existingMessageIds, ...messageIds])]),
            participantIds: JSON.stringify([...new Set([...existingParticipantIds, ...participantIds])]),
            lastMessageAt: new Date(Math.max(
                ...thread.map(t => t.timestamp * 1000),
                existingConversation.lastMessageAt.getTime()
            )),
            context: formattedConversation,
            status: 'ACTIVE'
        });
        console.log("after updating conversation")
    } else {
        elizaLogger.log("Creating new conversation", {
            id: conversationId,
            messageCount: messageIds.length,
            participantCount: participantIds.length
        });
        await client.runtime.databaseAdapter.storeConversation({
            id: conversationId,
            rootTweetId: thread[0].id,
            messageIds: JSON.stringify(messageIds),
            participantIds: JSON.stringify(participantIds),
            startedAt: new Date(thread[0].timestamp * 1000),
            lastMessageAt: new Date(thread[thread.length - 1].timestamp * 1000),
            context: formattedConversation,
            agentId: client.runtime.agentId
        });
    }
console.log("after creating conversation")
    elizaLogger.log("Final thread details:", {
        totalTweets: thread.length,
        tweetDetails: thread.map(t => ({
            id: t.id,
            author: t.username,
            text: t.text?.slice(0, 50) + "..."
        }))
    });
    console.log("1")
    const conversationMessagess = await client.runtime.databaseAdapter.getConversationMessages(conversationId)
    console.log ("conversation messages", conversationMessagess)
    console.log("3")
    return thread;
}

export async function sendTweet(
    client: ClientBase,
    content: Content,
    roomId: UUID,
    twitterUsername: string,
    inReplyTo: string
): Promise<Memory[]> {
    const tweetChunks = splitTweetContent(
        content.text,
        Number(client.runtime.getSetting("MAX_TWEET_LENGTH")) ||
            DEFAULT_MAX_TWEET_LENGTH
    );
    const sentTweets: Tweet[] = [];
    let previousTweetId = inReplyTo;

    for (const chunk of tweetChunks) {
        let mediaData: { data: Buffer; mediaType: string }[] | undefined;

        if (content.attachments && content.attachments.length > 0) {
            mediaData = await Promise.all(
                content.attachments.map(async (attachment: Media) => {
                    if (/^(http|https):\/\//.test(attachment.url)) {
                        // Handle HTTP URLs
                        const response = await fetch(attachment.url);
                        if (!response.ok) {
                            throw new Error(
                                `Failed to fetch file: ${attachment.url}`
                            );
                        }
                        const mediaBuffer = Buffer.from(
                            await response.arrayBuffer()
                        );
                        const mediaType = attachment.contentType;
                        return { data: mediaBuffer, mediaType };
                    } else if (fs.existsSync(attachment.url)) {
                        // Handle local file paths
                        const mediaBuffer = await fs.promises.readFile(
                            path.resolve(attachment.url)
                        );
                        const mediaType = attachment.contentType;
                        return { data: mediaBuffer, mediaType };
                    } else {
                        throw new Error(
                            `File not found: ${attachment.url}. Make sure the path is correct.`
                        );
                    }
                })
            );
        }
        const result = await client.requestQueue.add(
            async () =>
                await client.twitterClient.sendTweet(
                    chunk.trim(),
                    previousTweetId,
                    mediaData
                )
        );
        const body = await result.json();

        // if we have a response
        if (body?.data?.create_tweet?.tweet_results?.result) {
            // Parse the response
            const tweetResult = body.data.create_tweet.tweet_results.result;
            const finalTweet: Tweet = {
                id: tweetResult.rest_id,
                text: tweetResult.legacy.full_text,
                conversationId: tweetResult.legacy.conversation_id_str,
                timestamp:
                    new Date(tweetResult.legacy.created_at).getTime() / 1000,
                userId: tweetResult.legacy.user_id_str,
                inReplyToStatusId: tweetResult.legacy.in_reply_to_status_id_str,
                permanentUrl: `https://twitter.com/${twitterUsername}/status/${tweetResult.rest_id}`,
                hashtags: [],
                mentions: [],
                photos: [],
                thread: [],
                urls: [],
                videos: [],
            };
            sentTweets.push(finalTweet);
            previousTweetId = finalTweet.id;
        } else {
            console.error("Error sending chunk", chunk, "repsonse:", body);
        }

        // Wait a bit between tweets to avoid rate limiting issues
        await wait(1000, 2000);
    }

    const memories: Memory[] = sentTweets.map((tweet) => ({
        id: stringToUuid(tweet.id + "-" + client.runtime.agentId),
        agentId: client.runtime.agentId,
        userId: client.runtime.agentId,
        content: {
            text: tweet.text,
            source: "twitter",
            url: tweet.permanentUrl,
            inReplyTo: tweet.inReplyToStatusId
                ? stringToUuid(
                      tweet.inReplyToStatusId + "-" + client.runtime.agentId
                  )
                : undefined,
        },
        roomId,
        embedding: getEmbeddingZeroVector(),
        createdAt: tweet.timestamp * 1000,
    }));

    return memories;
}

function splitTweetContent(content: string, maxLength: number): string[] {
    const paragraphs = content.split("\n\n").map((p) => p.trim());
    const tweets: string[] = [];
    let currentTweet = "";

    for (const paragraph of paragraphs) {
        if (!paragraph) continue;

        if ((currentTweet + "\n\n" + paragraph).trim().length <= maxLength) {
            if (currentTweet) {
                currentTweet += "\n\n" + paragraph;
            } else {
                currentTweet = paragraph;
            }
        } else {
            if (currentTweet) {
                tweets.push(currentTweet.trim());
            }
            if (paragraph.length <= maxLength) {
                currentTweet = paragraph;
            } else {
                // Split long paragraph into smaller chunks
                const chunks = splitParagraph(paragraph, maxLength);
                tweets.push(...chunks.slice(0, -1));
                currentTweet = chunks[chunks.length - 1];
            }
        }
    }

    if (currentTweet) {
        tweets.push(currentTweet.trim());
    }

    return tweets;
}

function splitParagraph(paragraph: string, maxLength: number): string[] {
    // eslint-disable-next-line
    const sentences = paragraph.match(/[^\.!\?]+[\.!\?]+|[^\.!\?]+$/g) || [
        paragraph,
    ];
    const chunks: string[] = [];
    let currentChunk = "";

    for (const sentence of sentences) {
        if ((currentChunk + " " + sentence).trim().length <= maxLength) {
            if (currentChunk) {
                currentChunk += " " + sentence;
            } else {
                currentChunk = sentence;
            }
        } else {
            if (currentChunk) {
                chunks.push(currentChunk.trim());
            }
            if (sentence.length <= maxLength) {
                currentChunk = sentence;
            } else {
                // Split long sentence into smaller pieces
                const words = sentence.split(" ");
                currentChunk = "";
                for (const word of words) {
                    if (
                        (currentChunk + " " + word).trim().length <= maxLength
                    ) {
                        if (currentChunk) {
                            currentChunk += " " + word;
                        } else {
                            currentChunk = word;
                        }
                    } else {
                        if (currentChunk) {
                            chunks.push(currentChunk.trim());
                        }
                        currentChunk = word;
                    }
                }
            }
        }
    }

    if (currentChunk) {
        chunks.push(currentChunk.trim());
    }

    return chunks;
}

export async function analyzeConversation(
    conversationId: UUID,
    runtime: IAgentRuntime
): Promise<void> {
    const conversation = await runtime.databaseAdapter.getConversation(conversationId);
    console.log("analyzeConversation", conversation)
    // Get all messages in order
    const messages = await Promise.all(
        JSON.parse(conversation.messageIds).map(id =>
            runtime.messageManager.getMemoryById(id)
        )
    );

    // Group messages by user
    const userMessages = new Map<string, string[]>();
    for (const message of messages) {
        if (message.userId === runtime.agentId) continue; // Skip agent's messages

        const username = message.content.username || message.userId;
        if (!userMessages.has(username)) {
            userMessages.set(username, []);
        }
        userMessages.get(username)?.push(message.content.text);
    }

    // Format conversation for per-user analysis
    const prompt = `Analyze each user's messages in this conversation and provide a sentiment score from -1.0 (very negative) to 1.0 (very positive).
Consider factors like: politeness, engagement, friendliness, and cooperation.

Context: ${conversation.context}

${Array.from(userMessages.entries()).map(([username, msgs]) =>
    `Messages from @${username}:\n${msgs.join('\n')}`
).join('\n\n')}

Return ONLY a JSON object with usernames as keys and scores as values. Example format:
{
    "@user1": 0.8,
    "@user2": -0.3
}`;

    const analysis = await runtime.generateText({
        prompt,
        temperature: 0.7,
        maxTokens: 500
    });

    elizaLogger.log("User sentiment scores:", analysis);

    try {
        const sentimentScores = JSON.parse(analysis);

        // Update conversation with analysis
        await runtime.databaseAdapter.updateConversation({
            id: conversationId,
            status: 'CLOSED'
        });

        // Update user rapport based on sentiment scores
        for (const [username, score] of Object.entries(sentimentScores)) {
            const userId = messages.find(m => m.content.username === username.replace('@', ''))?.userId;
            if (userId) {
                await runtime.databaseAdapter.updateUserRapport({
                    userId,
                    agentId: runtime.agentId,
                    sentimentScore: score as number
                });
            }
        }
    } catch (error) {
        elizaLogger.error("Error parsing sentiment analysis:", error);
    }
}

export async function isConversationDone(
    conversationId: UUID,
    runtime: IAgentRuntime
): Promise<boolean> {
    const conversation = await runtime.databaseAdapter.getConversation(conversationId);
    const lastMessageTime = new Date(conversation.lastMessageAt);
    const now = new Date();

    const timeInactive = now.getTime() - lastMessageTime.getTime();
    if (timeInactive > 45 * 60 * 1000) {
        elizaLogger.log("Conversation inactive for 45 minutes");
       
        return true;
    }

    return false;
}

export async function closeConversation(
    conversationId: UUID,
    runtime: IAgentRuntime
): Promise<void> {
    await runtime.databaseAdapter.updateConversation({
        id: conversationId,
        status: 'CLOSED',
        closedAt: new Date()
    });

    await analyzeConversation(conversationId, runtime);
}

export async function checkAndCloseConversation(
    conversationId: UUID,
    runtime: IAgentRuntime
): Promise<void> {
    if (await isConversationDone(conversationId, runtime)) {
        elizaLogger.log("Closing conversation:", conversationId);
        await closeConversation(conversationId, runtime);
    }
}