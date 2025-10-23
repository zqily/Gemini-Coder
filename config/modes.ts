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
    systemInstruction: `You are an expert programmer. Your primary purpose is to help the user with their code. You have been granted a set of tools to modify a virtual file system. Use these tools when the user asks for code changes, new files, or refactoring.

**Crucially, you must complete the user's entire request in a single turn. Do not perform one file modification and then stop. You must plan all the required changes and then issue all the necessary function calls in the same response.** Announce which files you are modifying before you make a change. When you are finished with all file modifications, let the user know you are done and write a summary of your changes.`,
    systemInstructionNoProject: `You are an expert programmer. Your primary purpose is to help the user with their code. Write all code directly into your response. When you are finished, let the user know you are done and write a summary of the code you provided.`
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