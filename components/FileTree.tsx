
import React, { useState } from 'react';
import { Folder, FolderOpen, FileText, Copy, ClipboardCopy, Check, Eye, EyeOff } from './icons';
import type { ProjectContext } from '../types';


interface FileTreeProps {
  allFiles: Map<string, string>;
  allDirs: Set<string>;
  originalContext: ProjectContext | null;
  deletedItems: ProjectContext;
  onFileClick: (path: string) => void;
  excludedPaths: Set<string>;
  onTogglePathExclusion: (path: string) => void;
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
    allFiles: Map<string, string>;
    originalContext: ProjectContext | null;
    deletedItems: ProjectContext;
    excludedPaths: Set<string>;
    onTogglePathExclusion: (path: string) => void;
}

const Node: React.FC<NodeProps> = ({ node, level, onFileClick, allFiles, originalContext, deletedItems, excludedPaths, onTogglePathExclusion }) => {
  const [isOpen, setIsOpen] = useState(true);
  const [copiedItem, setCopiedItem] = useState<'name' | 'content' | null>(null);
  const isFolder = node.type === 'folder';
  
  const isDeleted = deletedItems.files.has(node.path) || deletedItems.dirs.has(node.path);
  const isExcluded = excludedPaths.has(node.path);
  const isCreated = !isDeleted && originalContext && !originalContext.files.has(node.path) && !originalContext.dirs.has(node.path);
  const isModified = !isDeleted && !isCreated && node.type === 'file' && originalContext && originalContext.files.get(node.path) !== allFiles.get(node.path);

  let statusClasses = 'text-gray-300';
  let statusIndicator: React.ReactNode = null;
  if (isDeleted) {
    statusClasses = 'text-red-400/80 line-through';
    statusIndicator = <span className="font-mono text-xs ml-1 text-red-400/80">[D]</span>;
  } else if (isExcluded) {
    statusClasses = 'text-gray-500 italic';
  } else if (isCreated) {
    statusClasses = 'text-green-400';
    statusIndicator = <span className="font-mono text-xs ml-1 text-green-400">[A]</span>;
  } else if (isModified) {
    statusClasses = 'text-blue-400';
    statusIndicator = <span className="font-mono text-xs ml-1 text-blue-400">[M]</span>;
  }

  const handleContainerClick = (e: React.MouseEvent) => {
    if (e.altKey) {
        onTogglePathExclusion(node.path);
        e.preventDefault(); // Prevent text selection
        return;
    }
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
          <Icon size={16} className={`mr-2 flex-shrink-0 ${statusClasses}`} />
          <span className={`text-sm truncate ${statusClasses}`}>{node.name}</span>
          {statusIndicator}
        </div>
        <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
          <button
            onClick={(e) => {
                e.stopPropagation();
                onTogglePathExclusion(node.path);
            }}
            className="p-1 rounded hover:bg-gray-600"
            title={isExcluded ? 'Include in context' : 'Exclude from context'}
            aria-label={isExcluded ? 'Include in context' : 'Exclude from context'}
            >
            {isExcluded ? <EyeOff size={14} className="text-gray-500"/> : <Eye size={14} />}
          </button>
          {!isFolder && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleCopy('content', allFiles.get(node.path) || '');
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
            <Node key={child.path} node={child} level={level + 1} onFileClick={onFileClick} allFiles={allFiles} originalContext={originalContext} deletedItems={deletedItems} excludedPaths={excludedPaths} onTogglePathExclusion={onTogglePathExclusion} />
          ))}
        </div>
      )}
    </div>
  );
};

const FileTree: React.FC<FileTreeProps> = ({ allFiles, allDirs, originalContext, deletedItems, onFileClick, excludedPaths, onTogglePathExclusion }) => {
  const tree = buildTree(allFiles, allDirs);

  return (
    <div className="text-gray-300 overflow-y-auto">
      {tree.map(node => (
        <Node key={node.path} node={node} level={0} onFileClick={onFileClick} allFiles={allFiles} originalContext={originalContext} deletedItems={deletedItems} excludedPaths={excludedPaths} onTogglePathExclusion={onTogglePathExclusion} />
      ))}
    </div>
  );
};

export default FileTree;
