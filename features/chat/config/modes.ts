import type { Mode, ModeId } from '../../../types';
import { Bot, CodeXml, BrainCircuit } from '../../../components/icons';

export const FILE_SYSTEM_COMMAND_INSTRUCTIONS = `You have access to a virtual file system. To modify it, you MUST respond with a valid XML block. Any other text you provide will be treated as a summary for the user.

**IMPORTANT RULES:**
- Your response MUST contain a single \`<changes>\` block.
- All file operations must be within this block.
- Operations are executed sequentially.
- You **must always** write the full, complete content of a file from start to finish.
- **NEVER** use diff formats, provide partial code snippets, or use placeholders like \`// ... rest of the file\`.
- All file content within a \`<content>\` tag MUST be wrapped in \`<![CDATA[...]]>\` to handle special characters correctly.
- If the XML is malformed or invalid, NONE of the operations will be performed.

**XML Schema:**
<changes>
  <change>
    <function>[function_name]</function>
    <!-- Arguments for the function -->
  </change>
  ...
</changes>

**Functions & Arguments:**

1.  **writeFile**
    -   Description: Writes or overwrites a file. Parent directories will be created if they don't exist.
    -   Tags:
        -   \`<function>writeFile</function>\`
        -   \`<path>[full/path/to/file]</path>\`
        -   \`<content><![CDATA[[file_content]]]></content>\`

2.  **createFolder**
    -   Description: Creates a new folder, including any necessary parent folders.
    -   Tags:
        -   \`<function>createFolder</function>\`
        -   \`<path>[full/path/to/folder]</path>\`

3.  **move**
    -   Description: Moves or renames a file or folder.
    -   Tags:
        -   \`<function>move</function>\`
        -   \`<source>[source/path]</source>\`
        -   \`<destination>[destination/path]</destination>\`

4.  **deletePath**
    -   Description: Deletes a file or an entire folder recursively.
    -   Tags:
        -   \`<function>deletePath</function>\`
        -   \`<path>[path/to/delete]</path>\`
`;

export const FILE_SYSTEM_COMMAND_EXAMPLES = `**Usage Examples:**

--- Example 1: Creating new files ---
Request: "Create a new React component called Button with its own CSS module."

Expected Response:
Okay, I will create a new React component and its stylesheet.
<changes>
  <change>
    <function>createFolder</function>
    <path>src/components</path>
  </change>
  <change>
    <function>writeFile</function>
    <path>src/components/Button.jsx</path>
    <content><![CDATA[import React from 'react';
import './Button.module.css';

const Button = () => <button className="button">Click Me</button>;

export default Button;]]></content>
  </change>
  <change>
    <function>writeFile</function>
    <path>src/components/Button.module.css</path>
    <content><![CDATA[.button {
  background-color: blue;
  color: white;
}]]></content>
  </change>
</changes>

--- Example 2: Modifying an existing file ---
Request: "Change the button color to red in \`Button.module.css\`."

Expected Response:
Okay, I've updated the button color to red.
<changes>
  <change>
    <function>writeFile</function>
    <path>src/components/Button.module.css</path>
    <content><![CDATA[.button {
  background-color: red;
  color: white;
}]]></content>
  </change>
</changes>

--- Example 3: Renaming and moving files ---
Request: "Refactor the Button component into its own folder. Rename \`Button.jsx\` to \`index.jsx\` and \`Button.module.css\` to \`styles.module.css\` inside a new \`src/components/Button\` directory."

Expected Response:
I've refactored the Button component as requested.
<changes>
  <change>
    <function>createFolder</function>
    <path>src/components/Button</path>
  </change>
  <change>
    <function>move</function>
    <source>src/components/Button.jsx</source>
    <destination>src/components/Button/index.jsx</destination>
  </change>
  <change>
    <function>move</function>
    <source>src/components/Button.module.css</source>
    <destination>src/components/Button/styles.module.css</destination>
  </change>
</changes>

--- Example 4: Deleting files and folders ---
Request: "Remove the old \`utils/legacy.js\` file and the entire \`assets/icons\` directory."

Expected Response:
I have removed the specified legacy file and icon directory.
<changes>
  <change>
    <function>deletePath</function>
    <path>utils/legacy.js</path>
  </change>
  <change>
    <function>deletePath</function>
    <path>assets/icons</path>
  </change>
</changes>`;

export const MODES: Record<ModeId, Mode> = {
  'default': {
    id: 'default',
    name: 'Default',
    icon: Bot,
  },
  'simple-coder': {
    id: 'simple-coder',
    name: 'Simple Coder',
    icon: CodeXml,
  },
  'advanced-coder': {
    id: 'advanced-coder',
    name: 'Advanced Coder',
    icon: BrainCircuit,
  }
};