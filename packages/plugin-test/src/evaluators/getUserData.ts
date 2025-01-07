import {Evaluator, IAgentRuntime, Memory} from "@elizaos/core"

const getUserDataEvaluator: Evaluator = {
    name:"GET_USER_DATA",
    similies:["GET_INFORMATION","EXTRACT_INFORMATION"],
    validate: async (runtime: IAgentRuntime, memory: Memory) => {
        return true;
    },
    handler: async (runtime: IAgentRuntime, memory: Memory) => {
        console.log("***evaluating STUFF***");


        return true;
    },
    description: "Get user data from the message",
    examples: [],
}