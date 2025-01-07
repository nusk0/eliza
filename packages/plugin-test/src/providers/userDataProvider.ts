import {Evaluator, IAgentRuntime,Provider, Memory} from "@elizaos/core"
const userDataProvider: Provider = {
    get:async (runtime: IAgentRuntime, memory: Memory) => {
        return {
            userId: memory.userId,
            roomId: memory.roomId,
        }
    },
    name: "USER_DATA_PROVIDER",
    description: "Get user data from the message",
    examples: [],
}
export{userDataProvider}