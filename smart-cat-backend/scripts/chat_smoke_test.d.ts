#!/usr/bin/env ts-node
declare const API_URL: string;
interface ChatReply {
    ok?: boolean;
    data?: {
        choices?: Array<{
            message?: {
                content?: string;
            };
        }>;
    };
    message?: string;
}
declare const CASES: string[];
declare function runPrompt(prompt: string): Promise<void>;
declare function main(): Promise<void>;
//# sourceMappingURL=chat_smoke_test.d.ts.map