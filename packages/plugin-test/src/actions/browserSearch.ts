import {
    ActionExample,
    IAgentRuntime,
    Memory,
    type Action,
    State,
    HandlerCallback,
    composeContext,
    generateText,
    ModelClass,

} from "@elizaos/core";

export const browserSearchAction: Action = {
    name: "BROWSER_SEARCH",
    similes: [
        "search the web",
        "look up",
        "find information about",
        "search for",
        "google",
        "research",
        "01111101010101011010",
        "find out about"
    ],
    validate: async (_runtime: IAgentRuntime, _message: Memory) => {
        return true;
    },
    description:
        "Search the web for specific information or topics",
    handler: async (
        _runtime: IAgentRuntime,
        _message: Memory,
        _state: State,
        _options: { [key: string]: unknown },
        _callback: HandlerCallback,
    ): Promise<boolean> => {
        async function performSearch(searchQuery: string) {
            return new Promise((resolve, reject) => {
                console.log("performing search");
                // Use Node's child_process to run the Python script
                const { spawn } = require('child_process');
                const pythonProcess = spawn('python', [
                    'packages/plugin-test/src/webScraper.py',
                    searchQuery
                ]);

                let results = '';

                // Collect data from script
                pythonProcess.stdout.on('data', (data) => {
                    results += data.toString();
                });

                // Handle errors
                pythonProcess.stderr.on('data', (data) => {
                    console.error(`Error from Python script: ${data}`);
                });

                // When the script finishes
                pythonProcess.on('close', (code) => {
                    if (code !== 0) {
                        reject(`Python script exited with code ${code}`);
                        return;
                    }

                    try {
                        // Parse the URLs from Python's output
                        const urls = JSON.parse(results.replace(/'/g, '"')); // Convert Python list to JSON

                        // Format the results similar to the original Google API response
                        const formattedResults = urls.map(url => {
                            return `URL: ${url}\n\n`;
                        }).join('');

                        resolve(formattedResults);
                    } catch (error) {
                        reject(`Error parsing Python output: ${error}`);
                    }
                });
            });
        }

        const searchTemplate = `
        #Recent messages:
        {{recentMessages}}

        #Task
        Extract the search query from the message. The message is: "${_message.content.text}"
        Only respond with a "search_query" field in JSON format.`;

        const context = await composeContext({
            username: _message.agentId.user,
            state: _state,
            template: searchTemplate,
        });

       // console.log(" Browser Search context", context);
        const response = await generateText({
            runtime: _runtime,
            context: context,
            template: searchTemplate,
            modelClass: ModelClass.SMALL,
            stop: ["\n"],
        });

        const cleanedResponse = response.text.replace(/```/g, '').trim();
        console.log("response prompt", cleanedResponse);

        // Parse the JSON response from the AI
        const parsedResponse = JSON.parse(cleanedResponse);
        const searchQuery = parsedResponse.search_query;

        console.log("Search Query:", searchQuery);

        _callback({
            text: "Searching the web for: " + searchQuery,
        });

        const searchResults = await performSearch(searchQuery);

        const newMemory: Memory = {
            id: crypto.randomUUID(),
            userId: _message.userId,
            agentId: _message.agentId,
            roomId: _message.roomId,
            content: {
                text: searchResults,
                action: "BROWSER_SEARCH_RESPONSE",
                source: "google_search"
            }
        };

        try {
            const memoryWithEmbedding = await _runtime.messageManager.addEmbeddingToMemory(newMemory);
            await _runtime.messageManager.createMemory(memoryWithEmbedding);

            _callback({
                text: searchResults,
            });
        } catch (error) {
            console.error("Error saving search results memory:", error);
            _callback({
                text: "I apologize, but I encountered an error while processing the search results.",
            });
        }

        return true;
    },
    examples: [
        [
            {
                user: "{{user1}}",
                content: { text: "Can you search for information about quantum computing?" },
            },
            {
                user: "{{user2}}",
                content: { text: "I'll search the web for information about quantum computing.", action: "BROWSER_SEARCH" },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: { text: "Look up the history of the Roman Empire" },
            },
            {
                user: "{{user2}}",
                content: { text: "I'll find some information about the history of the Roman Empire.", action: "BROWSER_SEARCH" },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: { text: "Search for recent developments in AI" },
            },
            {
                user: "{{user2}}",
                content: { text: "I'll search for the latest developments in AI.", action: "BROWSER_SEARCH" },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: { text: "Find information about climate change solutions" },
            },
            {
                user: "{{user2}}",
                content: { text: "I'll search for information about climate change solutions.", action: "BROWSER_SEARCH" },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: { text: "Research the benefits of meditation" },
            },
            {
                user: "{{user2}}",
                content: { text: "I'll look up information about the benefits of meditation.", action: "BROWSER_SEARCH" },
            },
        ]
    ] as ActionExample[][],
} as Action;