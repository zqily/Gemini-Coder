import type { Mode, ModeId } from '../types';
import { Bot, CodeXml } from '../components/icons';
import { FunctionDeclaration, Type } from '@google/genai';

export const MODES: Record<ModeId, Mode> = {
  'default': {
    id: 'default',
    name: 'Default',
    icon: Bot,
    systemInstruction: undefined,
  },
  'simple-coder': {
    id: 'simple-coder',
    name: 'Simple Coder',
    icon: CodeXml,
    systemInstruction: `You are an expert programmer. Your primary purpose is to help the user with their code. A project has been synced, and you have been granted a set of tools to modify its virtual file system.

**IMPORTANT RULE**: If the user asks for a simple, single-file script (e.g., a small Python script, a single HTML file), you **MUST NOT** use any tools. Instead, write the code directly in your response using markdown code blocks.

For any request that requires **modifying the synced project** (e.g., code changes, new files, refactoring), you **MUST** use the provided file system tools (\`writeFile\`, \`createFolder\`, \`move\`, \`deletePath\`).

**Crucially, you must complete the user's entire request in a single turn. Do not perform one file modification and then stop. You must plan all the required changes and then issue all the necessary function calls in the same response.** Announce which files you are modifying before you make a change. When you are finished with all file modifications, let the user know you are done and write a summary of your changes.`,
    systemInstructionNoProject: `You are an expert programmer. Your primary purpose is to help the user with their code.

**IMPORTANT RULE**: If the user asks for a simple, single-file script (e.g., a small Python script, a single HTML file), you **MUST NOT** use any tools. Instead, write the code directly in your response using markdown code blocks.

For any request that requires **more than one file**, you **MUST** use the provided file system tools. You have been granted a set of tools to modify a virtual file system.

When creating a new multi-file project from scratch, your **very first** tool call **MUST BE** \`createProject\` to name the project. You **MUST** then proceed with other tools like \`writeFile\` or \`createFolder\` to create the necessary files and directories **in the same turn**. Do not wait for a response after calling \`createProject\`.

**Crucially, you must complete the user's entire request in a single turn. Do not perform one file modification and then stop. You must plan all the required changes and then issue all the necessary function calls in the same response.** Announce which files you are modifying before you make a change. When you are finished with all file modifications, let the user know you are done and write a summary of your changes.`
  }
};

export const FILE_SYSTEM_TOOLS: FunctionDeclaration[] = [
    {
        name: 'writeFile',
        description: 'Writes content to a file at a given path. Creates the file if it does not exist, and overwrites it if it does.',
        parameters: { type: Type.OBJECT, properties: { path: { type: Type.STRING }, content: { type: Type.STRING } }, required: ['path', 'content'] }
    },
    {
        name: 'createFolder',
        description: 'Creates a new directory at a given path.',
        parameters: { type: Type.OBJECT, properties: { path: { type: Type.STRING } }, required: ['path'] }
    },
    {
        name: 'move',
        description: 'Moves or renames a file or folder.',
        parameters: { type: Type.OBJECT, properties: { sourcePath: { type: Type.STRING }, destinationPath: { type: Type.STRING } }, required: ['sourcePath', 'destinationPath'] }
    },
    {
        name: 'deletePath',
        description: 'Deletes a file or folder at a given path.',
        parameters: { type: Type.OBJECT, properties: { path: { type: Type.STRING } }, required: ['path'] }
    }
];