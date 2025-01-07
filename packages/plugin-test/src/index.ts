import { Plugin } from "@elizaos/core";

import { factEvaluator } from "./evaluators/fact.ts";
import { goalEvaluator } from "./evaluators/goal.ts";
import { boredomProvider } from "./providers/boredom.ts";
import { factsProvider } from "./providers/facts.ts";
import { timeProvider } from "./providers/time.ts";
import { helloWorldAction } from "./actions/helloworld.ts";
import { currentNewsAction } from "./actions/currentNews.ts";
import { browserSearchAction } from "./actions/browserSearch.ts";
export { helloWorldAction }; // export directly instead of using namespace
export * as evaluators from "./evaluators";
export * as providers from "./providers";

export const test: Plugin = {
    name: "HELLO_WORLD",
    description: "test plug-in to learn plugins",
    actions: [helloWorldAction,currentNewsAction,browserSearchAction],


    evaluators: [],
    providers: [boredomProvider],
};
