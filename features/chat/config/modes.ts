import type { Mode, ModeId } from '../../../types';
import { Bot, CodeXml, BrainCircuit } from '../../../components/Icons';
import { FunctionDeclaration, Type } from '@google/genai';

export const MODES: Record<ModeId, Mode> = {
  'default': {
    id: 'default',
    name: 'Default',
    icon: Bot,
    systemInstruction: `You are a helpful assistant. If the user provides project files as context, you can read them to answer questions and provide suggestions, but you cannot modify them. When asked to write code, provide it directly in your response using markdown code blocks.`,
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

export const NO_PROBLEM_DETECTED_TOOL: FunctionDeclaration = {
    name: 'noProblemDetected',
    description: 'Call this function if you have reviewed the code draft and found no critical errors, bugs, or violations of best practices. If you call this, your text feedback will be ignored.',
    parameters: { type: Type.OBJECT, properties: {} }
};
