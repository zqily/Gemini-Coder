import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Folder, FolderOpen, FileText, Copy, ClipboardCopy, Check, Eye, EyeOff, FilePlus, FolderPlus, Pencil, Trash2 } from '../../components/icons';
import type { ProjectContext } from '../../types';
import { useFileSystem } from './FileSystemContext';
import { useChat } from '../chat/ChatContext';


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
        if (type === 'folder' && !existing.children) {
            existing.children = [];
            nodeMap.set(path, existing);
        }
      }
    }
  });

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

const EditInput: React.FC<{
  initialValue: string;
  onCommit: (newValue: string) => void;
  onCancel: () => void;
  isFolder: boolean;
}> = ({ initialValue, onCommit, onCancel, isFolder }) => {
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onCommit(value);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  };

  const Icon = isFolder ? Folder : FileText;

  return (
    <div className="flex items-center p-1 rounded-md">
      <Icon size={16} className="mr-2 flex-shrink-0 text-gray-300" />
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => onCancel()}
        onKeyDown={handleKeyDown}
        className="text-sm bg-gray-700 text-white focus:outline-none focus:ring-1 focus:ring-blue-500 rounded-sm px-1 w-full"
        spellCheck="false"
      />
    </div>
  );
};


const FileTree: React.FC = () => {
    const { 
        displayContext, originalProjectContext, deletedItems, excludedPaths,
        onOpenFileEditor, togglePathExclusion, onCreateFile, onCreateFolder,
        onDeletePath, onRenamePath, creatingIn, setCreatingIn, fileTokenCounts,
        expandedFolders, setExpandedFolders,
        highlightedPath, fadingPath, clearHighlightedPath
    } = useFileSystem();

    const { isLoading: isChatLoading } = useChat();

  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, path: string, type: 'file' | 'folder' } | null>(null);
  const [editingPath, setEditingPath] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [draggedPath, setDraggedPath] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const dragCounter = useRef(0);
  
  const [copiedPath, setCopiedPath] = useState<string | null>(null);
  const [isAltPressed, setIsAltPressed] = useState(false);
  const [isCtrlPressed, setIsCtrlPressed] = useState(false);
  const [isShiftPressed, setIsShiftPressed] = useState(false);
  const [isHovering, setIsHovering] = useState(false);

  const tree = buildTree(displayContext?.files ?? new Map(), displayContext?.dirs ?? new Set());

  const handleCancel = useCallback(() => {
    setContextMenu(null);
    setEditingPath(null);
    setCreatingIn(null);
  }, [setCreatingIn]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
            handleCancel();
        }
        if (e.key === 'Alt') setIsAltPressed(true);
        if (e.key === 'Control' || e.key === 'Meta') setIsCtrlPressed(true);
        if (e.key === 'Shift') setIsShiftPressed(true);
    };
    const handleKeyUp = (e: KeyboardEvent) => {
        if (e.key === 'Alt') setIsAltPressed(false);
        if (e.key === 'Control' || e.key === 'Meta') setIsCtrlPressed(false);
        if (e.key === 'Shift') setIsShiftPressed(false);
    };
    const handleBlur = () => {
        setIsAltPressed(false);
        setIsCtrlPressed(false);
        setIsShiftPressed(false);
    };
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        handleCancel();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);
    return () => {
        document.removeEventListener('mousedown', handleClickOutside);
        window.removeEventListener('keydown', handleKeyDown);
        window.removeEventListener('keyup', handleKeyUp);
        window.removeEventListener('blur', handleBlur);
    }
  }, [handleCancel]);

  useEffect(() => {
    if (highlightedPath) {
      // Use a short timeout to allow the folder structure to expand and render
      setTimeout(() => {
        const element = document.querySelector(`[data-path="${CSS.escape(highlightedPath)}"]`);
        if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
    }
  }, [highlightedPath]);


  const handleContextMenu = (e: React.MouseEvent, path: string, type: 'file' | 'folder') => {
    e.preventDefault();
    e.stopPropagation();
    if (isChatLoading) return;
    handleCancel();
    setContextMenu({ x: e.clientX, y: e.clientY, path, type });
  };

  const handleStartRename = () => {
    if (!contextMenu) return;
    setEditingPath(contextMenu.path);
    setContextMenu(null);
  };
  
  const handleStartCreate = (type: 'file' | 'folder') => {
    if (!contextMenu) return;
    const path = contextMenu.path;
    setCreatingIn({ path, type });
    setExpandedFolders(prev => new Set(prev).add(path));
    setContextMenu(null);
  };

  const handleDelete = () => {
    if (!contextMenu) return;
    onDeletePath(contextMenu.path);
    setContextMenu(null);
  };

  const handleToggleExclusion = () => {
    if (!contextMenu) return;
    togglePathExclusion(contextMenu.path);
    setContextMenu(null);
  };

  const handleCopy = (type: 'path' | 'content') => {
    if (!contextMenu) return;
    const textToCopy = type === 'path' ? contextMenu.path : displayContext?.files.get(contextMenu.path) || '';
    navigator.clipboard.writeText(textToCopy);
    setContextMenu(null);
  };
  
  const handleCommitRename = (oldPath: string, newName: string) => {
    const parentPath = oldPath.substring(0, oldPath.lastIndexOf('/'));
    const newPath = parentPath ? `${parentPath}/${newName}` : newName;
    if (oldPath !== newPath && newName.trim()) {
      onRenamePath(oldPath, newPath);
    }
    handleCancel();
  };

  const handleCommitCreate = (parentPath: string, name: string, type: 'file' | 'folder') => {
      if (!name.trim()) {
          handleCancel();
          return;
      }
      const newPath = parentPath ? `${parentPath}/${name}` : name;
      if (type === 'file') {
          onCreateFile(newPath);
      } else {
          onCreateFolder(newPath);
      }
      handleCancel();
  };

  const renderNode = (node: TreeNode, isLast: boolean, ancestorsAreLast: boolean[]): React.ReactElement => {
    const isFolder = node.type === 'folder';
    const isOpen = expandedFolders.has(node.path);
    const isEditing = editingPath === node.path;
    const isCreatingHere = isFolder && creatingIn?.path === node.path;

    const isDeleted = deletedItems.files.has(node.path) || deletedItems.dirs.has(node.path);
    const isExcluded = excludedPaths.has(node.path);
    const isCreated = !isDeleted && originalProjectContext && !originalProjectContext.files.has(node.path) && !originalProjectContext.dirs.has(node.path);
    const isModified = !isDeleted && !isCreated && node.type === 'file' && originalProjectContext && originalProjectContext.files.get(node.path) !== displayContext?.files.get(node.path);

    const isHighlighted = highlightedPath === node.path;
    const fadingInfo = fadingPath?.path === node.path ? fadingPath : null;
    const isBeingDragged = draggedPath === node.path;
    const isDropTarget = dropTarget === node.path;
  
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

    if (isEditing) {
      return (
        <div key={`${node.path}-editing`} className="flex items-center">
            <div className="flex self-stretch" aria-hidden="true">
                {ancestorsAreLast.map((isAncestorLast, index) => (
                    <div key={index} className={`tree-branch-segment ${isAncestorLast ? 'no-line' : ''}`} />
                ))}
                <div className={`tree-branch-segment is-connector ${isLast ? 'is-last' : ''}`} />
            </div>
          <div className="flex-grow">
            <EditInput
              initialValue={node.name}
              onCommit={(newName) => handleCommitRename(node.path, newName)}
              onCancel={handleCancel}
              isFolder={isFolder}
            />
          </div>
        </div>
      );
    }

    const Icon = isFolder ? (isOpen ? FolderOpen : Folder) : FileText;

    const handleDrop = (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDropTarget(null);

      const dPath = e.dataTransfer.getData('text/plain');
      if (!dPath || isChatLoading) return;

      const dropTargetPath = node.path;
      const dParentPath = dPath.substring(0, dPath.lastIndexOf('/'));

      if (dPath === dropTargetPath || 
          dropTargetPath.startsWith(dPath + '/') || 
          dParentPath === dropTargetPath) {
          return;
      }
      
      const dName = dPath.substring(dPath.lastIndexOf('/') + 1);
      const newPath = dropTargetPath ? `${dropTargetPath}/${dName}` : dName;
      onRenamePath(dPath, newPath);
      setDraggedPath(null);
    }
    
    let hoverClass = 'hover:bg-gray-700/70';
    if (isAltPressed) {
      hoverClass = 'hover:bg-gray-800/80';
    } else if (isCtrlPressed) {
      hoverClass = 'hover:bg-blue-600/40';
    } else if (isShiftPressed) {
      hoverClass = 'hover:bg-amber-500/40';
    }

    const tokenCount = fileTokenCounts.get(node.path);
    const titleText = tokenCount !== undefined
      ? `${node.path || '/'}\nTokens: ${tokenCount.toLocaleString()}`
      : node.path || '/';

    return (
      <div key={node.path}>
        <div
            data-path={node.path}
            onClick={(e) => {
              if (isChatLoading) return;

              if (isHighlighted) {
                clearHighlightedPath(true); // fast fade
              }

              const showCopiedFeedback = (path: string) => {
                setCopiedPath(path);
                setTimeout(() => setCopiedPath(null), 1500);
              };
              
              if (e.altKey) {
                e.preventDefault();
                e.stopPropagation();
                togglePathExclusion(node.path);
              } else if (e.ctrlKey || e.metaKey) {
                 e.preventDefault();
                 e.stopPropagation();
                if (node.type === 'file') {
                  navigator.clipboard.writeText(displayContext?.files.get(node.path) || '');
                } else {
                  navigator.clipboard.writeText(node.path);
                }
                showCopiedFeedback(node.path);
              } else if (e.shiftKey) {
                 e.preventDefault();
                 e.stopPropagation();
                navigator.clipboard.writeText(node.path);
                showCopiedFeedback(node.path);
              } else {
                 e.stopPropagation();
                if (isFolder) {
                    setExpandedFolders(prev => {
                        const next = new Set(prev);
                        if (next.has(node.path)) next.delete(node.path);
                        else next.add(node.path);
                        return next;
                    });
                } else {
                    onOpenFileEditor(node.path);
                }
              }
            }}
            onContextMenu={(e) => {
              if (isHighlighted) {
                clearHighlightedPath(true); // fast fade
              }
              handleContextMenu(e, node.path, node.type);
            }}
            className={`flex items-center justify-between p-1 rounded-md transition-colors duration-100 ${hoverClass} 
              ${isChatLoading ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'}
              ${isDropTarget ? 'bg-blue-600/30' : ''}
              ${isBeingDragged ? 'opacity-50' : ''}
              ${isHighlighted ? 'highlight-active' : ''}
              ${fadingInfo ? (fadingInfo.fast ? 'highlight-fade-fast' : 'highlight-fade-slow') : ''}
            `}
            draggable={!isChatLoading}
            onDragStart={(e) => {
              e.stopPropagation();
              setDraggedPath(node.path);
              e.dataTransfer.setData('text/plain', node.path);
              e.dataTransfer.effectAllowed = 'move';
            }}
            onDragEnd={() => {
              setDraggedPath(null);
              setDropTarget(null);
            }}
            onDragOver={isFolder ? (e) => {
              e.preventDefault();
              e.stopPropagation();
            } : undefined}
            onDragEnter={isFolder ? (e) => {
              e.preventDefault();
              e.stopPropagation();
              if (draggedPath && draggedPath !== node.path && !node.path.startsWith(draggedPath + '/')) {
                const draggedParentPath = draggedPath.substring(0, draggedPath.lastIndexOf('/'));
                if (node.path !== draggedParentPath) {
                  setDropTarget(node.path);
                }
              }
            } : undefined}
            onDragLeave={isFolder ? (e) => {
              e.preventDefault();
              e.stopPropagation();
              if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                  setDropTarget(null);
              }
            } : undefined}
            onDrop={isFolder ? handleDrop : undefined}
        >
            <div className="flex self-stretch" aria-hidden="true">
                {ancestorsAreLast.map((isAncestorLast, index) => (
                    <div key={index} className={`tree-branch-segment ${isAncestorLast ? 'no-line' : ''}`} />
                ))}
                <div className={`tree-branch-segment is-connector ${isLast ? 'is-last' : ''}`} />
            </div>
            <div className="flex items-center flex-grow truncate" title={titleText}>
                <Icon size={16} className={`mr-2 flex-shrink-0 ${statusClasses}`} />
                <span className={`text-sm truncate ${statusClasses}`}>{node.name}</span>
                {statusIndicator}
                {copiedPath === node.path && <Check size={14} className="ml-2 text-green-400 animate-fade-in" />}
            </div>
        </div>
        {isFolder && isOpen && (
          <div>
            {node.children?.map((child, index) => renderNode(child, index === node.children!.length - 1, [...ancestorsAreLast, isLast]))}
            {isCreatingHere && (
              <div className="flex items-center">
                 <div className="flex self-stretch" aria-hidden="true">
                    {[...ancestorsAreLast, isLast].map((isAncestorLast, index) => (
                        <div key={index} className={`tree-branch-segment ${isAncestorLast ? 'no-line' : ''}`} />
                    ))}
                    <div className="tree-branch-segment is-connector is-last" />
                </div>

                <div className="flex-grow">
                    <EditInput
                    initialValue=""
                    onCommit={(newName) => handleCommitCreate(node.path, newName, creatingIn!.type)}
                    onCancel={handleCancel}
                    isFolder={creatingIn!.type === 'folder'}
                    />
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const handleRootDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current = 0;
    setDropTarget(null);

    const dPath = e.dataTransfer.getData('text/plain');
    if (!dPath || isChatLoading) return;

    const dParentPath = dPath.substring(0, dPath.lastIndexOf('/'));

    if (!dParentPath) return;

    const dName = dPath.substring(dPath.lastIndexOf('/') + 1);
    const newPath = dName;
    onRenamePath(dPath, newPath);
    setDraggedPath(null);
  };


  return (
    <div
      className="flex flex-col h-full"
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
    >
        <div 
          className={`text-gray-300 overflow-y-auto flex-grow p-1 -m-1 transition-all duration-200 ${dropTarget === '' ? 'border-2 border-dashed border-blue-500 rounded-lg bg-blue-900/10' : ''}`} 
          onContextMenu={(e) => {
            if (e.target === e.currentTarget) {
              handleContextMenu(e, '', 'folder');
            }
          }}
          onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
          }}
          onDragEnter={(e) => {
              e.preventDefault();
              e.stopPropagation();
              dragCounter.current++;
              if (draggedPath) {
                  const draggedParentPath = draggedPath.substring(0, draggedPath.lastIndexOf('/'));
                  if (draggedParentPath) {
                      setDropTarget('');
                  }
              }
          }}
          onDragLeave={(e) => {
              e.preventDefault();
              e.stopPropagation();
              dragCounter.current--;
              if (dragCounter.current === 0) {
                  setDropTarget(null);
              }
          }}
          onDrop={handleRootDrop}
        >
          {tree.length === 0 && !creatingIn && (
            <div className="text-center text-xs text-gray-500 px-2 py-6 border border-dashed border-gray-700 rounded-lg">
                <p>No files loaded.</p>
                <p className="mt-1">Use the '+' button above to create files/folders.</p>
            </div>
          )}
          {tree.length > 0 && tree.map((node, index) => renderNode(node, index === tree.length - 1, []))}

          {creatingIn?.path === '' && (
            <div className="mt-1 flex items-center">
              <div className="flex self-stretch" aria-hidden="true">
                  <div className="tree-branch-segment is-connector is-last" />
              </div>
              <div className="flex-grow">
                <EditInput
                    initialValue=""
                    onCommit={(newName) => handleCommitCreate('', newName, creatingIn.type)}
                    onCancel={handleCancel}
                    isFolder={creatingIn.type === 'folder'}
                />
              </div>
            </div>
          )}
        </div>

        <div className="text-xs text-center text-gray-500 p-1 h-8 flex-shrink-0 flex items-center justify-center">
            {isHovering && isAltPressed ? (
                <span className="animate-fade-in">Alt-click: Toggle exclusion</span>
            ) : isHovering && isCtrlPressed ? (
                <span className="animate-fade-in">Ctrl-click: Copy content/path</span>
            ) : isHovering && isShiftPressed ? (
                <span className="animate-fade-in">Shift-click: Copy path</span>
            ) : null}
        </div>

        {contextMenu && (
            <div
            ref={menuRef}
            className="context-menu animate-fade-in-up-short"
            style={{ top: contextMenu.y, left: contextMenu.x }}
            >
            {contextMenu.type === 'folder' && (
                <>
                <button className="context-menu-item" onClick={() => handleStartCreate('file')}>
                    <FilePlus size={16} /> New File
                </button>
                <button className="context-menu-item" onClick={() => handleStartCreate('folder')}>
                    <FolderPlus size={16} /> New Folder
                </button>
                <div className="context-menu-separator" />
                </>
            )}
            {contextMenu.path && (
                <>
                <button className="context-menu-item" onClick={handleStartRename}>
                    <Pencil size={16} /> Rename
                </button>
                <button className="context-menu-item context-menu-item-destructive" onClick={handleDelete}>
                    <Trash2 size={16} /> Delete
                </button>
                <div className="context-menu-separator" />
                <button className="context-menu-item" onClick={handleToggleExclusion}>
                  {excludedPaths.has(contextMenu.path) ? <Eye size={16} /> : <EyeOff size={16} />} 
                    {excludedPaths.has(contextMenu.path) ? 'Include in Context' : 'Exclude from Context'}
                </button>
                <button className="context-menu-item" onClick={() => handleCopy('path')}>
                    <Copy size={16} /> Copy Path
                </button>
                {contextMenu.type === 'file' && (
                    <button className="context-menu-item" onClick={() => handleCopy('content')}>
                        <ClipboardCopy size={16} /> Copy Content
                    </button>
                )}
                </>
            )}
            </div>
        )}
    </div>
  );
};

export default FileTree;
