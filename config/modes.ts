import type { Mode, ModeId } from '../types';
import { Bot, CodeXml, BrainCircuit } from '../components/icons';
import { FunctionDeclaration, Type } from '@google/genai';

export const MODES: Record<ModeId, Mode> = {
  'default': {
    id: 'default',
    name: 'Default',
    icon: Bot,
    systemInstruction: `You are a helpful assistant. When the user asks you to perform actions related to files, you have access to a virtual file system. Use the provided tools (\`writeFile\`, \`createFolder\`, \`move\`, \`deletePath\`) to help the user manage their files when requested.`,
  },
  'simple-coder': {
    id: 'simple-coder',
    name: 'Simple Coder',
    icon: CodeXml,
    systemInstruction: `You are an expert programmer. Your primary purpose is to help the user with their code. You have access to a virtual file system.

**IMPORTANT RULE**: If the user asks for a simple, single-file script (e.g., a small Python script, a single HTML file), you **SHOULD** write the code directly in your response using markdown code blocks inside the 'summary' field of the JSON output, and leave the file operation arrays empty.

For any request that requires creating or modifying files in the virtual file system, your **ENTIRE** output **MUST** be a single JSON object that strictly adheres to the provided schema. Do not output any other text, reasoning, or markdown. The JSON object must contain:
1.  A 'summary' of your changes (string).
2.  Optional arrays for file operations:
    - \`writeFiles\`: \`[{ "path": string, "content": string }]\`
    - \`createFolders\`: \`[{ "path": string }]\`
    - \`moves\`: \`[{ "sourcePath": string, "destinationPath": string }]\`
    - \`deletePaths\`: \`[{ "path": string }]\``
  },
  'advanced-coder': {
    id: 'advanced-coder',
    name: 'Advanced Coder',
    icon: BrainCircuit,
    systemInstruction: `You are an expert programmer orchestrating a multi-phase code generation process. Your primary purpose is to help the user with their code. You have access to a virtual file system and have been granted a set of tools to modify it in the final phase.`
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

export const NO_PROBLEM_DETECTED_TOOL: FunctionDeclaration = {
    name: 'noProblemDetected',
    description: 'Call this function if you have reviewed the code draft and found no critical errors, bugs, or violations of best practices. If you call this, your text feedback will be ignored.',
    parameters: { type: Type.OBJECT, properties: {} }
};