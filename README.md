# MindVault: Your Personal RAG AI Knowledge Assistant

MindVault is a privacy-focused, personal knowledge vault that allows you to upload your documents and have intelligent conversations with them. Using **Retrieval-Augmented Generation (RAG)**, MindVault ensures that the AI's answers are grounded in your specific data, providing accurate and context-aware responses.

## 🚀 Features

- **Multi-Format Support**: Upload PDF, DOCX, and TXT files (up to 10MB).
- **RAG-Powered Chat**: Grounded conversations using your own documents as the source of truth.
- **Privacy-First**: Documents are processed and indexed for your session.
- **Gemini Integration**: Leverages Google's Gemini API for high-quality embeddings and text generation.
- **Modern UI**: A polished, responsive interface built with Tailwind CSS and Framer Motion.

## 🛠️ Tech Stack

- **Frontend**: React, Vite, Tailwind CSS, Lucide React, Framer Motion.
- **Backend**: Node.js, Express, Multer (for file handling).
- **AI/ML**: Google Gemini API (@google/genai).
- **Parsing**: `pdf-parse`, `mammoth` (for DOCX).
- **Deployment**: Optimized for Vercel and GitHub.

## 🚦 Getting Started

### Prerequisites

- Node.js (v18 or higher)
- A Google Gemini API Key (Get one at [aistudio.google.com](https://aistudio.google.com/app/apikey))

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/your-username/mindvault.git
   cd mindvault
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   Create a `.env` file in the root directory and add your API key:
   ```env
   GEMINI_API_KEY=your_actual_api_key_here
   ```

4. Start the development server:
   ```bash
   npm run dev
   ```

5. Open your browser and navigate to `http://localhost:3000`.

## 📦 Deployment

### Deploy to Vercel

This project is pre-configured for Vercel. 

1. Push your code to GitHub.
2. Connect your repository to Vercel.
3. Add `GEMINI_API_KEY` to your Vercel project's **Environment Variables**.
4. Deploy!

## 📄 License

This project is licensed under the Apache-2.0 License.
