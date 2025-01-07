import {
    ActionExample,
    IAgentRuntime,
    Memory,
    type Action,
    State,
    HandlerCallback,
} from "@elizaos/core";

export const helloWorldAction: Action = {
    name: "HELLO_WORLD",
    similes: [
        "NO_ACTION",
        "NO_RESPONSE",
        "NO_REACTION",
        "RESPONSE",
        "REPLY",
        "DEFAULT",
    ],
    validate: async (_runtime: IAgentRuntime, _message: Memory) => {
        return true;
    },
    description:
        "Make a cool ASCII art of the Netflix SHow Arcane",
    handler: async (
        _runtime: IAgentRuntime,
        _message: Memory,
        _state: State,
        _options: { [key: string]: unknown },
        _callback: HandlerCallback,
    ): Promise<boolean> => {
        const helloWorld='HAHAHAHA'
        _callback({
            text: "This is a test" + helloWorld,
        });
        return true;
    },
    examples: [
        [
            {
                user: "{{user1}}",
                content: { text: "Hello World!" },
            },
            {
                user: "{{user2}}",
                content: { text: "Hi there! Welcome to the world of coding!", action: "HELLO_WORLD" },
            },
        ],

        [
            {
                user: "{{user1}}",
                content: { text: "Can you show me a cool Hello World?" },
            },
            {
                user: "{{user2}}",
                content: { text: "Sure! Let me create something special for you!", action: "HELLO_WORLD" },
            },
        ],

        [
            {
                user: "{{user1}}",
                content: { text: "I'm learning to code, starting with Hello World" },
            },
            {
                user: "{{user2}}",
                content: { text: "That's great! Let me help you celebrate with some ASCII art!", action: "HELLO_WORLD" },
            },
        ],

        [
            {
                user: "{{user1}}",
                content: { text: "Show me something cool with Hello World" },
            },
            {
                user: "{{user2}}",
                content: { text: "I'll create an awesome ASCII art version for you!", action: "HELLO_WORLD" },
            },
        ],

        [
            {
                user: "{{user1}}",
                content: { text: "What's the traditional first program?" },
            },
            {
                user: "{{user2}}",
                content: { text: "It's Hello World! Let me show you something special!", action: "HELLO_WORLD" },
            },
        ]
    ] as ActionExample[][],
} as Action;
