import React, { useState, useCallback, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import MainContent from './components/MainContent';
import SettingsModal from './components/SettingsModal';
import type { ChatMessage, AttachedFile } from './types';
import { runChat } from './services/geminiService';
import { useApiKey } from './hooks/useApiKey';

/**
 * The main application component.
 * Manages the overall application state including chat history, API key,
 * and UI states like sidebar and modal visibility.
 */
const App: React.FC = () => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState('gemini-flash-latest');
  const [apiKey, setApiKey] = useApiKey();
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);

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
  };

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
      const stream = await runChat(apiKey, selectedModel, updatedChatHistory);
      let modelResponse = "";
      const modelMessage: ChatMessage = { role: 'model', parts: [{ text: '' }] };
      let currentHistory = [...updatedChatHistory, modelMessage];
      setChatHistory(currentHistory);

      for await (const chunk of stream) {
        const chunkText = chunk.text;
        modelResponse += chunkText;
        currentHistory = [...updatedChatHistory, { role: 'model', parts: [{ text: modelResponse }] }];
        setChatHistory(currentHistory);
      }

    } catch (error) {
      console.error(error);
      const errorMessage: ChatMessage = {
        role: 'model',
        parts: [{ text: `Error: ${error instanceof Error ? error.message : 'An unknown error occurred'}` }]
      };
      setChatHistory(prev => [...prev.slice(0, -1), errorMessage]);
    } finally {
      setIsLoading(false);
    }
  }, [apiKey, chatHistory, selectedModel]);

  return (
    <div className="flex h-screen w-full bg-[#131314] text-gray-200 font-sans overflow-hidden">
      <Sidebar
        isOpen={isSidebarOpen}
        setIsOpen={setIsSidebarOpen}
        onNewChat={handleNewChat}
        onOpenSettings={() => setIsSettingsModalOpen(true)}
      />
      <MainContent
        isSidebarOpen={isSidebarOpen}
        chatHistory={chatHistory}
        isLoading={isLoading}
        selectedModel={selectedModel}
        setSelectedModel={setSelectedModel}
        onSubmit={handlePromptSubmit}
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