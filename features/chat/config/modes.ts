import type { Mode, ModeId } from '../../../types';
import { Bot, CodeXml, BrainCircuit } from '../../../components/icons';
import { FunctionDeclaration, Type } from '@google/genai';

const FILE_SYSTEM_COMMAND_INSTRUCTIONS = `You have access to a virtual file system. Use the following commands sequentially to modify it. Any other text is treated as a summary for the user.

**Commands:**
- \`@@writeFile path/to/file [-f | --force]\`: Writes or overwrites a file. The file content must follow on the next lines. The system tracks file moves; writing to an old path redirects to the new one unless the \`-f\` or \`--force\` flag is used to write to the literal path.
- \`@@createFolder path/to/folder\`: Creates a new folder, including any necessary parent folders.
- \`@@moves source destination\`: Moves or renames a file or folder.
- \`@@deletePaths path/to/delete\`: Deletes a file or an entire folder recursively.

**Usage Examples:**

*Example 1: Create a new React component and its stylesheet.*
I will create a 'Button' component in 'src/components' and add a corresponding CSS module.
@@createFolder src/components
@@writeFile src/components/Button.jsx
import React from 'react';
import './Button.module.css';
const Button = () => <button className="button">Click Me</button>;
export default Button;
@@writeFile src/components/Button.module.css
--- START OF src/components/Button.module.css ---
.button {
  background-color: blue;
  color: white;
}
--- END OF src/components/Button.module.css ---

*Example 2: Refactor by moving a file and deleting an old directory.*
Okay, I'll move the helper to a new 'utils' directory and update its import path in 'main.js'. I'll also delete the now-empty 'lib' folder.
@@createFolder src/utils
@@moves src/lib/helper.js src/utils/helper.js
@@deletePaths src/lib
@@writeFile src/main.js
--- START OF src/main.js ---
import { helper } from './utils/helper.js';
// ... rest of the file
console.log('Main file updated.');
--- END OF src/main.js ---

*Example 3: Complex move operation demonstrating the force flag.*
I'm moving 'config.json' to a 'data' folder. Note: If I later write to 'config.json', it will automatically write to the new 'data/config.json' path. To create a *new* file at the original 'config.json' path, I must use the --force flag.
@@createFolder data
@@moves config.json data/config.json
@@writeFile data/config.json
--- START OF data/config.json ---
{ "setting": "new-value" }
@@writeFile config.json --force
{ "setting": "old-value-recreated" }
--- END OF data/config.json ---`;

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
    systemInstruction: `You are an expert programmer. Your primary purpose is to help the user with their code.\n\n${FILE_SYSTEM_COMMAND_INSTRUCTIONS}`
  },
  'advanced-coder': {
    id: 'advanced-coder',
    name: 'Advanced Coder',
    icon: BrainCircuit,
    systemInstruction: `You are an expert programmer orchestrating a multi-phase code generation process. Your primary purpose is to help the user with their code. In the final phase, you will have access to a virtual file system and must use special commands to modify it.\n\n${FILE_SYSTEM_COMMAND_INSTRUCTIONS}`
  }
};

export const NO_PROBLEM_DETECTED_TOOL: FunctionDeclaration = {
    name: 'noProblemDetected',
    description: 'Call this function if you have reviewed the code draft and found no critical errors, bugs, or violations of best practices. If you call this, your text feedback will be ignored.',
    parameters: { type: Type.OBJECT, properties: {} }
};