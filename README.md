# Gemini Code Assistant

This is a locally-hosted web interface designed to act as a powerful coding assistant using Google's Gemini models. It provides a chat-based interface with file system integration, allowing the AI to read your project files and make changes directly.

This application is built with React, TypeScript, and Tailwind CSS, utilizing Vite for the development environment.

## Features

-   **Advanced Chat Interface**: A clean, modern UI for interacting with Gemini models.
-   **Project Context**: Upload an entire project folder. The application intelligently ignores files based on your `.gitignore` and `.gcignore` files, providing the AI with the full context of your codebase.
-   **File System Tools**: In 'Simple Coder' and 'Advanced Coder' modes, Gemini can directly create, modify, delete, and move files within the uploaded project.
-   **Advanced Coder Mode**: A sophisticated, multi-phase agentic workflow for complex coding tasks. The AI will plan, draft, debug, and review its own code before presenting the final implementation.
-   **In-Browser File Editor**: Click on any file in the sidebar to open a full-featured editor modal to view or modify its content.
-   **Context Management**: Easily toggle the inclusion/exclusion of specific files or folders from the context sent to the model using `Alt-click`.
-   **Secure API Key Storage**: Your Google Gemini API key is stored securely in your browser's local storage and is never exposed to any server other than Google's.

## Important Note on Security

This application is designed to be run **locally only**. There is no public-hosted version. This is a deliberate security measure to protect your Google Gemini API key. Your key is sent directly from your browser to the Google API, never passing through a third-party server.

## Getting Started

Follow these instructions to get the project running on your local machine.

### Prerequisites

You must have [Node.js](https://nodejs.org/) (which includes npm) installed on your system.

### Installation & Running

1.  **Clone the repository:**
    ```sh
    git clone https://github.com/zqily/Gemini-Coder.git
    ```

2.  **Navigate to the project directory:**
    ```sh
    cd Gemini-Coder
    ```

3.  **Run the start script:**
    -   On **Windows**, simply double-click and run the `start.bat` file.
    -   On **macOS/Linux**, or as an alternative for Windows, open your terminal and run:
        ```sh
        npm install
        npm run dev
        ```

4.  **Open the application:**
    Once the server is running, your browser should automatically open to the local URL (usually `http://localhost:3000`). If not, open your browser and navigate to that address. Another way is to type `o` and Enter inside the terminal to open it in your default browser.

5.  **Set your API Key:**
    The first time you open the app, you will be prompted to enter your Google Gemini API key in the settings modal. You can get a key from [Google AI Studio](https://aistudio.google.com/app/apikey).
