import {
    ActionExample,
    IAgentRuntime,
    Memory,
    type Action,
    State,
    Content,
    HandlerCallback,
    composeContext,
    generateText,
    ModelClass,
} from "@elizaos/core";
export const currentNewsAction: Action = {
    name: "CURRENT_NEWS",
    similes: [
        "get the Latest News",
        "Latest News",
        "alpha",
        "New information",
        "Whats going on?",
        "Tell me something new",
        "01111101010101011010",
    ],
    validate: async (_runtime: IAgentRuntime, _message: Memory) => {
        return true;
    },
    description:
        "Get the latest news on a specific topic",
    handler: async (
        _runtime: IAgentRuntime,
        _message: Memory,
        _state: State,
        _options: { [key: string]: unknown },
        _callback: HandlerCallback,
    ): Promise<boolean> => {
        async function getCurrentNews(searchTerm: string, timeframe?: string) {
            // Add timeframe to API query if provided
            const timeParam = timeframe ? `&from=${timeframe}` : '';
            //const response = await fetch(`https://newsapi.org/v2/everything?q=${searchTerm}&from=${timeframe}&sortBy=publishedAt&apiKey=${process.env.NEWS_API_KEY}`);
            const response = await fetch(
                `https://newsapi.org/v2/everything?` +
                `q=${encodeURIComponent(searchTerm)}` +
                `${timeParam}` +
                `&language=en` +
                `&sortBy=relevancy` +
                `&searchIn=title,description` +
                `&pageSize=5` +
                `&apiKey=${process.env.NEWS_API_KEY}`
            );
            const data = await response.json();

            if (data.status === 'error') {
                console.error('News API Error:', data);
                return `Error fetching news: ${data.message}`;
            }

            if (!data.articles || data.articles.length === 0) {
                return "No news found for this topic.";
            }

            return data.articles.map(article => {
                return `Title: ${article.title}\nDescription: ${article.description || 'No description available'}\nURL: ${article.url}\n\n`;
            }).join('');

        }
// {{recentconversation}}
// {{recentMessages}}
// {{userId}}
        const newsTemplate = `
        #Recent messages :
        {{recentMessages}}

        #Task
        Extract the search topic and timeframe from the { message. The message is : "${_message.content.text}"
        Only respond with "search_topic""and "timeframe" fields in JSON format.`;

        const context = await composeContext({
            username: _message.agentId.user,
            state: _state,
            template: newsTemplate,

        });

        console.log("context",context);
        const response =await generateText({
            runtime: _runtime,
            context:context,
            template: newsTemplate,
            modelClass: ModelClass.SMALL,
            stop:["\n"],
        })
        console.log("response prompt", response.text);
        const cleanedResponse = response.replace(/```/g, '').trim();
console.log("response prompt",response);
        // Parse the JSON response from the AI
        const parsedResponse = JSON.parse(cleanedResponse);
        const searchTerm = parsedResponse.search_topic;
        const timeframe = parsedResponse.timeframe;

        console.log("Search Term:", searchTerm);
        console.log("Timeframe:", timeframe);

        _callback({
            text: "Guetting current news on " + searchTerm + "in the time frame " + timeframe,
        })
        const currentNews = await getCurrentNews(searchTerm, timeframe);

        const newMemory: Memory = {
            id: crypto.randomUUID(),
            userId: _message.userId,
            agentId: _message.agentId,
            roomId: _message.roomId,
            content: {
                text: currentNews,
                action: "CURRENT_NEWS_RESPONSE",
                source: "news_api"
            }
        };

        try {
            const memoryWithEmbedding = await _runtime.messageManager.addEmbeddingToMemory(newMemory);
            await _runtime.messageManager.createMemory(memoryWithEmbedding);

            // Remove or comment out this callback since we'll use the summary instead
            // _callback({
            //     text: currentNews,
            // });
        } catch (error) {
            console.error("Error saving news memory:", error);
            _callback({
                text: "I apologize, but I encountered an error while processing the news.",
            });
        }

        const agentResponseTemplate = `
#Recent messages :

#Task
Just respond with "hi".

`;

        const contextNews = await composeContext({
            username: _message.agentId.user,
            state: _state,
        });
        console.log("Context for Venice:", contextNews); // Check what's being sent to generateText

        const responseNews = await generateText({
            runtime: _runtime,
            context:context,
            template: newsTemplate,
            modelClass: ModelClass.SMALL,
            stop:["\n"],
        });
console.log("responseNews",responseNews);
        _callback({
            text: responseNews.text
        });

        return true;
    },
    examples: [
        [
            {
                user: "{{user1}}",
                content: { text: "What's happening in the world today?" },
            },
            {
                user: "{{user2}}",
                content: { text: "Let me get you the latest news updates.", action: "CURRENT_NEWS" },
            },
        ],

        [
            {
                user: "{{user1}}",
                content: { text: "Tell me the current news" },
            },
            {
                user: "{{user2}}",
                content: { text: "I'll fetch the most recent news articles for you.", action: "CURRENT_NEWS" },
            },
        ],

        [
            {
                user: "{{user1}}",
                content: { text: "What's new in the world?" },
            },
            {
                user: "{{user2}}",
                content: { text: "I'll get you up to speed with the latest news.", action: "CURRENT_NEWS" },
            },
        ],

        [
            {
                user: "{{user1}}",
                content: { text: "Can you update me on current events?" },
            },
            {
                user: "{{user2}}",
                content: { text: "I'll find the most recent news stories for you.", action: "CURRENT_NEWS" },
            },
        ],

        [
            {
                user: "{{user1}}",
                content: { text: "What's going on right now?" },
            },
            {
                user: "{{user2}}",
                content: { text: "Let me check the latest news and get back to you.", action: "CURRENT_NEWS" },
            },
        ]
    ] as ActionExample[][],
} as Action;
