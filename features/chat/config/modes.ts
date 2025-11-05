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

You **MUST** output commands sequentially. The system executes them in the order they appear. Incorrect ordering will lead to errors. For example, do not write to a file you intend to move *before* the move command.

To perform any file system operations, use the following special commands. Any text that is not part of a command will be treated as a summary for the user.

- **Write/Overwrite a file:**
  @@writeFile path/to/file [-f | --force]
  (The full content of the file goes on the following lines)
  - By default, if you have moved a file, writing to its original path will write to the *new* location.
  - Use the optional \`-f\` or \`--force\` flag to write to the literal path, even if it was part of a move operation.

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
    systemInstruction: `You are an expert programmer orchestrating a multi-phase code generation process. Your primary purpose is to help the user with their code. You have access to a virtual file system and will use special commands to modify it.`
  }
};

export const NO_PROBLEM_DETECTED_TOOL: FunctionDeclaration = {
    name: 'noProblemDetected',
    description: 'Call this function if you have reviewed the code draft and found no critical errors, bugs, or violations of best practices. If you call this, your text feedback will be ignored.',
    parameters: { type: Type.OBJECT, properties: {} }
};