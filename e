[1mdiff --git a/packages/client-twitter/src/utils.ts b/packages/client-twitter/src/utils.ts[m
[1mindex 63719497..ca29fe2a 100644[m
[1m--- a/packages/client-twitter/src/utils.ts[m
[1m+++ b/packages/client-twitter/src/utils.ts[m
[36m@@ -37,17 +37,11 @@[m [mexport async function buildConversationThread([m
     client: ClientBase,[m
     maxReplies: number = 10[m
 ): Promise<Tweet[]> {[m
[31m-    elizaLogger.log("1")[m
     const thread: Tweet[] = [];[m
[31m-    elizaLogger.log("2")[m
     const visited: Set<string> = new Set();[m
[31m-    elizaLogger.log("3")[m
     const conversationId = stringToUuid(tweet.conversationId + "-" + client.runtime.agentId);[m
[31m-    elizaLogger.log("4")[m
     const existingConversation = await client.runtime.databaseAdapter.getConversation(conversationId);[m
[31m-    elizaLogger.log("5")[m
     console.log("Starting to build conversation thread");[m
[31m-    console.log("building THREAD")[m
 [m
     async function processThread(currentTweet: Tweet, depth: number = 0) {[m
         elizaLogger.debug("Processing tweet:", {[m
[36m@@ -186,16 +180,17 @@[m [mexport async function buildConversationThread([m
         messageIds: messageIds,[m
         conversationId: conversationId[m
     });[m
[31m-[m
[32m+[m[32m    console.log("before creating conversation")[m
     if (existingConversation) {[m
         // Parse existing JSON arrays[m
         elizaLogger.log("Updating existing conversation", {[m
             id: conversationId,[m
[31m-            newMessageCount: messageIds.length[m
[32m+[m[32m            newMessageCount: messageIds.length,[m
[32m+[m[41m            [m
         });[m
         const existingMessageIds = JSON.parse(existingConversation.messageIds);[m
         const existingParticipantIds = JSON.parse(existingConversation.participantIds);[m
[31m-[m
[32m+[m[32m        console.log("inside creating conversation")[m
         await client.runtime.databaseAdapter.updateConversation({[m
             id: conversationId,[m
             messageIds: JSON.stringify([...new Set([...existingMessageIds, ...messageIds])]),[m
[36m@@ -204,8 +199,10 @@[m [mexport async function buildConversationThread([m
                 ...thread.map(t => t.timestamp * 1000),[m
                 existingConversation.lastMessageAt.getTime()[m
             )),[m
[31m-            context: formattedConversation[m
[32m+[m[32m            context: formattedConversation,[m
[32m+[m[32m            status: 'ACTIVE'[m
         });[m
[32m+[m[32m        console.log("after updating conversation")[m
     } else {[m
         elizaLogger.log("Creating new conversation", {[m
             id: conversationId,[m
[36m@@ -223,7 +220,7 @@[m [mexport async function buildConversationThread([m
             agentId: client.runtime.agentId[m
         });[m
     }[m
[31m-[m
[32m+[m[32mconsole.log("after creating conversation")[m
     elizaLogger.log("Final thread details:", {[m
         totalTweets: thread.length,[m
         tweetDetails: thread.map(t => ({[m
[36m@@ -232,7 +229,10 @@[m [mexport async function buildConversationThread([m
             text: t.text?.slice(0, 50) + "..."[m
         }))[m
     });[m
[31m-[m
[32m+[m[32m    console.log("1")[m
[32m+[m[32m    const conversationMessagess = await client.runtime.databaseAdapter.getConversationMessages(conversationId)[m
[32m+[m[32m    console.log ("conversation messages", conversationMessagess)[m
[32m+[m[32m    console.log("3")[m
     return thread;[m
 }[m
 [m
