
import React, { useState, useCallback } from 'react';
import Sidebar from './components/Sidebar';
import MainContent from './components/MainContent';
import type { ChatMessage, AttachedFile } from './types';
import { runChat } from './services/geminiService';

const App: React.FC = () => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState('gemini-flash-latest');

  const handleNewChat = () => {
    setChatHistory([]);
  };

  const handlePromptSubmit = useCallback(async (prompt: string, files: AttachedFile[]) => {
    // FIX: Removed API key check to align with environment variable guidelines.
    if (!prompt && files.length === 0) return;

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
      // FIX: Call runChat without apiKey as it's now handled by environment variables.
      const stream = await runChat(selectedModel, updatedChatHistory);
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
      setChatHistory(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  // FIX: Removed apiKey from dependency array.
  }, [chatHistory, selectedModel]);

  return (
    <div className="flex h-screen w-full bg-[#131314] text-gray-200 font-sans">
      <Sidebar
        isOpen={isSidebarOpen}
        setIsOpen={setIsSidebarOpen}
        onNewChat={handleNewChat}
        // FIX: Removed onOpenSettings prop as settings modal is removed.
      />
      <MainContent
        isSidebarOpen={isSidebarOpen}
        chatHistory={chatHistory}
        isLoading={isLoading}
        selectedModel={selectedModel}
        setSelectedModel={setSelectedModel}
        onSubmit={handlePromptSubmit}
      />
      {/* FIX: Removed SettingsModal to adhere to API key guidelines. */}
    </div>
  );
};

export default App;
