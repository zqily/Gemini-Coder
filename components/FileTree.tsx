import React, { useState } from 'react';
import { Folder, FolderOpen, FileText } from './icons';

interface FileTreeProps {
  files: Map<string, string>;
  dirs: Set<string>;
}

interface TreeNode {
  name: string;
  type: 'folder' | 'file';
  path: string;
  children?: TreeNode[];
}

const buildTree = (files: Map<string, string>, dirs: Set<string>): TreeNode[] => {
  const root: { [key: string]: TreeNode } = {};
  const allPaths = new Set([...files.keys(), ...dirs]);

  for (const path of allPaths) {
    let currentLevel = root;
    const pathParts = path.split('/');
    pathParts.forEach((part, index) => {
      if (!currentLevel[part]) {
        const isLastPart = index === pathParts.length - 1;
        const isFile = isLastPart && files.has(path);
        currentLevel[part] = {
          name: part,
          type: isFile ? 'file' : 'folder',
          path: pathParts.slice(0, index + 1).join('/'),
          children: isFile ? undefined : [],
        };
      }
      if(currentLevel[part].type === 'folder') {
         currentLevel = currentLevel[part].children!.reduce((acc, child) => {
            acc[child.name] = child;
            return acc;
        }, {} as { [key: string]: TreeNode });
      }
    });
  }

  const result: TreeNode[] = [];
  const convertChildren = (childrenObj: { [key: string]: TreeNode }): TreeNode[] => {
      return Object.values(childrenObj).sort((a, b) => {
        if (a.type === b.type) return a.name.localeCompare(b.name);
        return a.type === 'folder' ? -1 : 1;
      });
  }

  for(const key in root) {
      const node = root[key];
      if(node.children) {
        // This reconstruction is tricky. We built a path map, not a tree.
        // Let's rebuild the tree properly.
      }
  }

  // A simpler way to build the tree
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
      parentNode.children.push(newNode);
      if (type === 'folder') {
        nodeMap.set(path, newNode);
      }
    }
  });

  return fileTree.children || [];
};


const Node: React.FC<{ node: TreeNode; level: number }> = ({ node, level }) => {
  const [isOpen, setIsOpen] = useState(true);
  const isFolder = node.type === 'folder';

  const toggleOpen = () => {
    if (isFolder) {
      setIsOpen(!isOpen);
    }
  };

  const Icon = isFolder ? (isOpen ? FolderOpen : Folder) : FileText;

  return (
    <div>
      <div
        onClick={toggleOpen}
        className="flex items-center p-1 rounded-md hover:bg-gray-700 cursor-pointer"
        style={{ paddingLeft: `${level * 16}px` }}
      >
        <Icon size={16} className="mr-2 flex-shrink-0" />
        <span className="text-sm truncate">{node.name}</span>
      </div>
      {isFolder && isOpen && node.children && (
        <div>
          {node.children.map(child => (
            <Node key={child.path} node={child} level={level + 1} />
          ))}
        </div>
      )}
    </div>
  );
};

const FileTree: React.FC<FileTreeProps> = ({ files, dirs }) => {
  const tree = buildTree(files, dirs);

  return (
    <div className="text-gray-300 overflow-y-auto">
      {tree.map(node => (
        <Node key={node.path} node={node} level={0} />
      ))}
    </div>
  );
};

export default FileTree;
