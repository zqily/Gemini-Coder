import type { Mode, ModeId } from '../../../types';
import { Bot, CodeXml, BrainCircuit } from '../../../components/icons';
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

To perform any file system operations (creating, modifying, deleting files), you **MUST** use the following special commands in your response. Any text that is not part of a command will be treated as a summary for the user. Do NOT just describe the changes in text; you MUST output the commands to perform the actions.

- **Write/Overwrite a file:**
  @@writeFile path/to/file
  (The full content of the file goes on the following lines)

- **Create a folder:**
  @@createFolder path/to/folder

- **Move/Rename a file or folder:**
  @@moves source/path destination/path

- **Delete a file or folder:**
  @@deletePaths path/to/folder_or_file`
  },
  'advanced-coder': {
    id: 'advanced-coder',
    name: 'Advanced Coder',
    icon: BrainCircuit,
    systemInstruction: `You are an expert programmer orchestrating a multi-phase code generation process. Your primary purpose is to help the user with their code. You have access to a virtual file system and will use special commands to modify it in the final phase.`
  }
};

export const NO_PROBLEM_DETECTED_TOOL: FunctionDeclaration = {
    name: 'noProblemDetected',
    description: 'Call this function if you have reviewed the code draft and found no critical errors, bugs, or violations of best practices. If you call this, your text feedback will be ignored.',
    parameters: { type: Type.OBJECT, properties: {} }
};