import React, { useState } from 'react';
import { Folder, FolderOpen, FileText, Copy, ClipboardCopy, Check } from './icons';

interface FileTreeProps {
  files: Map<string, string>;
  dirs: Set<string>;
  onFileClick: (path: string) => void;
}

interface TreeNode {
  name: string;
  type: 'folder' | 'file';
  path: string;
  children?: TreeNode[];
}

const buildTree = (files: Map<string, string>, dirs: Set<string>): TreeNode[] => {
  const allPaths = new Set([...files.keys(), ...dirs]);

  const fileTree: TreeNode = { name: 'root', type: 'folder', path: '', children: [] };
  const nodeMap = new Map<string, TreeNode>([['', fileTree]]);

  const sortedPaths = Array.from(allPaths).sort();
  sortedPaths.forEach(path => {
    const parts = path.split('/');
    const name = parts[parts.length - 1];
    const parentPath = parts.slice(0, -1).join('/');
    const parentNode = nodeMap.get(parentPath);

    if (parentNode && parentNode.children) {
      const type = files.has(path) ? 'file' : 'folder';
      const newNode: TreeNode = { name, type, path, children: type === 'folder' ? [] : undefined };
      
      const existing = parentNode.children.find(c => c.name === name);
      if (!existing) {
        parentNode.children.push(newNode);
        if (type === 'folder') {
            nodeMap.set(path, newNode);
        }
      } else {
        // If a directory was created first, then a file inside it, we might see the dir path then the file path.
        // If a path for a folder already exists, ensure it has children array if it's now confirmed to be a folder.
        if (type === 'folder' && !existing.children) {
            existing.children = [];
            nodeMap.set(path, existing);
        }
      }
    }
  });

  // Sort children at each level
  for(const node of nodeMap.values()){
    if(node.children){
        node.children.sort((a,b) => {
            if (a.type === b.type) return a.name.localeCompare(b.name);
            return a.type === 'folder' ? -1 : 1;
        });
    }
  }

  return fileTree.children || [];
};


interface NodeProps {
    node: TreeNode;
    level: number;
    onFileClick: (path: string) => void;
    files: Map<string, string>;
}

const Node: React.FC<NodeProps> = ({ node, level, onFileClick, files }) => {
  const [isOpen, setIsOpen] = useState(true);
  const [copiedItem, setCopiedItem] = useState<'name' | 'content' | null>(null);
  const isFolder = node.type === 'folder';

  const handleContainerClick = () => {
    if (isFolder) {
      setIsOpen(!isOpen);
    } else {
      onFileClick(node.path);
    }
  };

  const handleCopy = (type: 'name' | 'content', textToCopy: string) => {
    if (typeof textToCopy !== 'string') return;
    navigator.clipboard.writeText(textToCopy).then(() => {
      setCopiedItem(type);
      setTimeout(() => setCopiedItem(null), 2000);
    });
  };

  const Icon = isFolder ? (isOpen ? FolderOpen : Folder) : FileText;

  return (
    <div>
      <div
        className="group flex items-center justify-between p-1 rounded-md hover:bg-gray-700/70"
        style={{ paddingLeft: `${level * 16}px` }}
      >
        <div 
          onClick={handleContainerClick} 
          className="flex items-center cursor-pointer flex-grow truncate mr-2"
          title={node.path}
        >
          <Icon size={16} className="mr-2 flex-shrink-0" />
          <span className="text-sm truncate">{node.name}</span>
        </div>
        <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
          {!isFolder && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleCopy('content', files.get(node.path) || '');
              }}
              className="p-1 rounded hover:bg-gray-600"
              title="Copy content"
              aria-label="Copy file content"
            >
              {copiedItem === 'content' ? <Check size={14} className="text-green-400" /> : <ClipboardCopy size={14} />}
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleCopy('name', node.name);
            }}
            className="p-1 rounded hover:bg-gray-600"
            title="Copy name"
            aria-label="Copy name"
          >
            {copiedItem === 'name' ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
          </button>
        </div>
      </div>
      {isFolder && isOpen && node.children && (
        <div>
          {node.children.map(child => (
            <Node key={child.path} node={child} level={level + 1} onFileClick={onFileClick} files={files} />
          ))}
        </div>
      )}
    </div>
  );
};

const FileTree: React.FC<FileTreeProps> = ({ files, dirs, onFileClick }) => {
  const tree = buildTree(files, dirs);

  return (
    <div className="text-gray-300 overflow-y-auto">
      {tree.map(node => (
        <Node key={node.path} node={node} level={0} onFileClick={onFileClick} files={files} />
      ))}
    </div>
  );
};

export default FileTree;
