# Gemini Code Assistant

Gemini Code Assistant is a local-first web application designed to be a powerful coding partner. It leverages Google's Gemini family of models, providing a rich, interactive environment to chat about your code, generate new files, and modify your existing project structure directly from the browser.

Because it stores your Google Gemini API key in your browser's local storage, this application is designed to be run **locally only** and should **not** be hosted on a public server.

![Gemini Code Assistant interface](/github/assets/UI.webp) 

---

## Key Features

-   **Local Project Sync:** Load an entire local folder into the app's context. It respects `.gitignore` and custom `.gcignore` files to keep your context clean.
-   **Multiple Coder Modes:**
    -   **Default Mode:** A standard chat assistant for questions and code snippets.
    -   **Simple Coder:** A powerful mode that can directly create, modify, rename, and delete files in your synced project.
    -   **Advanced Coder:** A multi-phase agent for complex, multi-file tasks. It plans, drafts, reviews, and then implements code for higher-quality results.
-   **Interactive File Tree:** Full CRUD (Create, Read, Update, Delete) functionality for files and folders right from the sidebar, including drag-and-drop renaming/moving.
-   **Built-in File Editor:** Click on any file in the tree to open it in a modal editor for quick edits.
-   **Drag & Drop Support:** Easily add individual files (images, code, PDFs, etc.) to the chat context by dragging them onto the application window.
-   **Privacy-Focused:** Your code and API key remain on your local machine, stored securely in your browser's local storage.

---

## Getting Started

### Prerequisites

1.  **Node.js and npm:** You must have Node.js (which includes npm) installed on your system. You can download it from [nodejs.org](https://nodejs.org/).
2.  **Google Gemini API Key:** You need a free API key from Google AI Studio.
    -   Visit [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey) to generate your key.

### Installation & Usage

#### For Windows Users (Easy Method)

1.  Clone or download this repository to your local machine.
2.  Navigate to the project's root folder.
3.  Double-click the `start.bat` file. This will automatically install all necessary dependencies and start the local development server.
4.  Your default web browser should open to `http://localhost:3000`.

#### For All Other Users (Manual Method)

1.  Clone or download this repository.
2.  Open your terminal or command prompt and navigate to the project's root folder.
3.  Install the project dependencies by running:
    ```bash
    npm install
    ```
4.  Start the local development server by running:
    ```bash
    npm run dev
    ```
5.  Open your web browser and go to the local address shown in the terminal (usually `http://localhost:5173`).

### First-Time Setup

When you first open the application, you will be prompted to enter your Google Gemini API key. You can do this by clicking the **Settings & API** button in the sidebar or the **Help (?)** icon in the main view. Paste your key into the input field and click save. The app is now ready to use!

---

## How to Use

1.  **Start a Chat:** Simply type your request into the prompt input at the bottom and press Enter.
2.  **Add Project Context:** Click the **Upload Folder** button in the sidebar to load a local project. The file tree will appear, and its contents will be available to the AI.
3.  **Use Coder Modes:** Select "Simple Coder" or "Advanced Coder" before sending a prompt to allow the AI to perform file system operations.
4.  **Manage Files:**
    -   **Click** a file to open it in the editor.
    -   **Right-click** a file or folder for more options (rename, delete, create new).
    -   **Alt-click** a file or folder to exclude it from the context sent to the AI.
    -   **Drag & drop** files/folders to move them.

## License

This project is open-source and available under the MIT License.