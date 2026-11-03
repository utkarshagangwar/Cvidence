# ATS Resume Builder

A powerful, AI-powered resume builder that creates ATS-friendly resumes with humanized content. Features secure backend API proxy, resume parsing, and comprehensive ATS scoring.

## 🚀 Features

- **AI-Powered Content Generation** - Uses OpenRouter API to generate professional, humanized resume content
- **ATS-Friendly Format** - All content follows strict ATS compliance rules
- **Resume Parsing** - Upload PDF/DOCX files and parse them into editable sections
- **ATS Scoring** - Get detailed section-by-section ATS compatibility analysis
- **Export Options** - Download as PDF or DOCX
- **Secure Architecture** - API key stored in environment variables, never exposed to frontend

## 🔒 Security

This application uses a **secure backend proxy** pattern:
- Your OpenRouter API key is stored in Vercel environment variables
- The frontend never sees or stores your API key
- All AI requests are proxied through the backend with:
  - Rate limiting (100 requests per 15 minutes per IP)
  - Input validation
  - CORS protection
  - Helmet security headers

## 📁 Project Structure

```
├── index.html          # Frontend application (single HTML file)
├── api/
│   └── index.js        # Backend Express server (Vercel serverless)
├── package.json        # Node.js dependencies
├── vercel.json         # Vercel deployment configuration
├── .env.example        # Environment variables template
└── README.md           # This file
```

## 🛠️ Deployment to Vercel

### Step 1: Push to GitHub
Push your project to a GitHub repository.

### Step 2: Import to Vercel
1. Go to [vercel.com](https://vercel.com)
2. Click "New Project"
3. Import your GitHub repository

### Step 3: Configure Environment Variables
In your Vercel project settings, add the following environment variable:

| Name | Value |
|------|-------|
| `OPENROUTER_API_KEY` | Your OpenRouter API key (get one free at [openrouter.ai/keys](https://openrouter.ai/keys)) |

You can also add it via Vercel CLI:
```bash
vercel env add OPENROUTER_API_KEY
```

### Step 4: Deploy
Vercel will automatically deploy your application. The API routes will be handled by the Express server in `api/index.js`.

## 🧪 Local Development

### Prerequisites
- Node.js 18+
- npm or yarn

### Setup

1. **Clone the repository**
   ```bash
   git clone <your-repo-url>
   cd ats-resume-builder
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Create environment file**
   ```bash
   cp .env.example .env
   ```

4. **Add your API key to `.env`**
   ```
   OPENROUTER_API_KEY=paste-your-openrouter-key
   ```

5. **Start the backend server**
   ```bash
   npm run dev
   ```

6. **Open the frontend**
   Open `index.html` in your browser or serve it:
   ```bash
   npx serve .
   ```

## 📡 API Endpoints

All endpoints are served from `/api/`:

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check and API status |
| GET | `/api/models` | List available AI models |
| POST | `/api/chat` | AI chat completion proxy |
| POST | `/api/parse-resume` | Parse resume text with AI |

## 🎯 Usage

1. **Set Target Role & Industry** - The app will prompt you to enter your target job title and industry
2. **Fill in Details** - Add your contact info, experience, education, skills, and projects
3. **Generate with AI** - Click "Generate All with AI" or generate individual sections
4. **Check ATS Score** - View detailed ATS compatibility analysis
5. **Download** - Export as PDF or DOCX

## 📋 ATS Compliance Rules

All generated content follows these rules:
- Plain text only (no special characters)
- Bullet points start with strong action verbs
- Past tense for previous roles, present tense for current
- 1-2 lines per bullet (max ~25 words)
- No first-person pronouns
- No filler phrases ("results-driven", "dynamic professional")
- Specific, quantified achievements

## 🔧 Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENROUTER_API_KEY` | Yes | Your OpenRouter API key |
| `PORT` | No | Server port (default: 3001) |

## 📄 License

MIT License - See LICENSE file for details.
