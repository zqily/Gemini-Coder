import React, { useState, useCallback, useEffect, useRef } from 'react';
import Sidebar from './components/Sidebar';
import MainContent from './components/MainContent';
import SettingsModal from './components/SettingsModal';
import type { ChatMessage, AttachedFile, Mode, ModeId } from './types';
import { runChat } from './services/geminiService';
import { useApiKey } from './hooks/useApiKey';
import { Bot, CodeXml } from './components/icons';

// Custom hook to detect window size
const useWindowSize = () => {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return isMobile;
};

const MODES: Record<ModeId, Mode> = {
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
    systemInstruction: "As a seasoned programmer, your task is to write code for User. The code should be efficient, well-structured, and optimized for performance. Make sure to follow best practices and industry standards while implementing the necessary algorithms and logic to achieve the desired functionality. Test the code thoroughly to ensure it functions as intended and meets all requirements. Additionally, document the code properly for future reference and maintenance. Write using markdown, and avoid Diff markers."
  }
};


/**
 * The main application component.
 * Manages the overall application state including chat history, API key,
 * and UI states like sidebar and modal visibility.
 */
const App: React.FC = () => {
  const isMobile = useWindowSize();
  const [isSidebarOpen, setIsSidebarOpen] = useState(!isMobile);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState('gemini-flash-latest');
  const [apiKey, setApiKey] = useApiKey();
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [selectedMode, setSelectedMode] = useState<ModeId>('default');
  const cancellationRef = useRef(false);
  
  // On initial load, open settings if no API key is found.
  useEffect(() => {
    if (!apiKey) {
      setIsSettingsModalOpen(true);
    }
  }, [apiKey]);


  /**
   * Clears the current chat history to start a new conversation.
   */
  const handleNewChat = () => {
    setChatHistory([]);
    if (isMobile) {
      setIsSidebarOpen(false);
    }
  };
  
  /**
   * Toggles the sidebar visibility.
   */
  const toggleSidebar = () => setIsSidebarOpen(prev => !prev);

  /**
   * Signals the ongoing API request to stop.
   */
  const handleStopGeneration = useCallback(() => {
    cancellationRef.current = true;
  }, []);

  /**
   * Handles the submission of a new prompt from the user.
   * It constructs the user message, updates the chat history,
   * and calls the Gemini API to get a response.
   */
  const handlePromptSubmit = useCallback(async (prompt: string, files: AttachedFile[]) => {
    if (!apiKey) {
      alert("Please set your Gemini API key in the settings.");
      setIsSettingsModalOpen(true);
      return;
    }
    if (!prompt.trim() && files.length === 0) return;

    setIsLoading(true);
    cancellationRef.current = false; // Reset cancellation flag on new submission

    const userParts = [];
    if (prompt) {
      userParts.push({ text: prompt });
    }
    files.forEach(file => {
      userParts.push({
        inlineData: {
          mimeType: file.type,
          data: file.content.split(',')[1] // remove data url prefix
        }
      });
    });

    const newUserMessage: ChatMessage = {
      role: 'user',
      parts: userParts
    };

    const updatedChatHistory = [...chatHistory, newUserMessage];
    setChatHistory(updatedChatHistory);
    
    try {
      const systemInstruction = MODES[selectedMode].systemInstruction;
      const stream = await runChat(apiKey, selectedModel, updatedChatHistory, systemInstruction);
      let modelResponse = "";
      const modelMessage: ChatMessage = { role: 'model', parts: [{ text: '' }] };
      let currentHistory = [...updatedChatHistory, modelMessage];
      setChatHistory(currentHistory);

      for await (const chunk of stream) {
        if (cancellationRef.current) {
          break; // Exit the loop if cancellation is requested
        }
        modelResponse += chunk.text;
        currentHistory = [...updatedChatHistory, { role: 'model', parts: [{ text: modelResponse }] }];
        setChatHistory(currentHistory);
      }

    } catch (error) {
      console.error(error);
      const errorMessage: ChatMessage = {
        role: 'model',
        parts: [{ text: `Error: ${error instanceof Error ? error.message : 'An unknown error occurred'}` }]
      };
      setChatHistory(prev => {
        const historyWithoutLastUserMessage = prev.filter(m => m !== newUserMessage);
        return [...historyWithoutLastUserMessage, errorMessage]
      });
    } finally {
      setIsLoading(false);
      cancellationRef.current = false; // Ensure flag is reset
    }
  }, [apiKey, chatHistory, selectedModel, selectedMode]);

  return (
    <div className="flex h-screen w-full bg-[#131314] text-gray-200 font-sans overflow-hidden">
      <Sidebar
        isOpen={isSidebarOpen}
        setIsOpen={setIsSidebarOpen}
        onNewChat={handleNewChat}
        onOpenSettings={() => setIsSettingsModalOpen(true)}
        isMobile={isMobile}
      />
      <MainContent
        isSidebarOpen={isSidebarOpen}
        toggleSidebar={toggleSidebar}
        isMobile={isMobile}
        chatHistory={chatHistory}
        isLoading={isLoading}
        selectedModel={selectedModel}
        setSelectedModel={setSelectedModel}
        onSubmit={handlePromptSubmit}
        onStop={handleStopGeneration}
        selectedMode={selectedMode}
        setSelectedMode={setSelectedMode}
        modes={MODES}
      />
      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        apiKey={apiKey}
        setApiKey={setApiKey}
      />
    </div>
  );
};

export default App;