# NEET Quiz Bot

Automated Google Forms quiz creator for NEET 2026 daily tests.

## Features

- ✅ **AI-Powered Question Generation** with multiple AI services
  - **Gemini** (Google) - Fast and free
  - **ChatGPT** (OpenAI) - Temporary chat mode
  - **Claude** (Anthropic) - High quality responses
  - **DeepSeek** - Alternative option
  - Configure questions by subject (Botany, Zoology, Physics, Chemistry)
  - Set difficulty ratios (Easy:Medium:Hard:Very Hard)
  - Choose question types (Lengthy, Time-taking, One-line, Confusing, Conceptual, Application-based)
  - Automatic explanations for each answer
  - **Auto-copy prompt** to clipboard when opening AI
- ✅ Creates Google Forms quizzes with multiple choice questions
- ✅ Automatically sets correct answers and point values (4 points each)
- ✅ Moves forms to designated Google Drive folder
- ✅ **Email notifications** with quiz links
- ✅ OAuth2 authentication for secure access
- ✅ Beautiful web interface with step-by-step guidance

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up Google Cloud Credentials

#### Create OAuth2 Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Enable APIs:
   - Google Forms API
   - Google Drive API
4. Go to **APIs & Services** → **Credentials**
5. Click **Create Credentials** → **OAuth 2.0 Client ID**
6. Choose **Desktop App** as application type
7. Download the credentials
8. Save as `oauth_credentials.json` in the project root

### 3. Configure Environment Variables

1. Copy the example environment file:

```bash
cp .env.example .env
```

2. Edit `.env` and configure the following:

```env
# Required: Google Drive folder ID
FOLDER_ID=your_folder_id_here

# Optional: Server port (default: 3000)
PORT=3000

# Optional but recommended: Email notifications
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-gmail-app-password
RECIPIENT_EMAIL=recipient@example.com

# Optional: AI Question Generation with Gemini
GEMINI_API_KEY=your-gemini-api-key-here
```

**Getting your credentials:**

- **FOLDER_ID**: Open your Google Drive folder and copy the ID from the URL:

  ```
  https://drive.google.com/drive/folders/YOUR_FOLDER_ID_HERE
  ```

- **EMAIL_PASS**: Generate a Gmail App Password at [https://myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)

- **GEMINI_API_KEY**: Get your free API key at [https://makersuite.google.com/app/apikey](https://makersuite.google.com/app/apikey)

### 4. Start the Web Interface

```bash
npm start
```

Then open `http://localhost:3000` in your browser.

**Web Interface Features:**

- ✅ Beautiful step-by-step guided process
- ✅ One-click copy buttons for all URLs and links
- ✅ Automatic browser opening for OAuth
- ✅ Visual feedback and error messages

#### OR Use Command Line

```bash
node createFormOAuth.js
```

### 5. Add Questions

Edit `questions.json` with your quiz questions:

```json
[
  {
    "q": "Question text?",
    "opts": ["Option 1", "Option 2", "Option 3", "Option 4"],
    "ans": 0
  }
]
```

- `q`: Question text
- `opts`: Array of 4 options
- `ans`: Index of correct answer (0-3)

### 6. How It Works

The application workflow:

1. **Authenticate** with Google OAuth2
2. **Generate Questions** (Two options):
   - **AI Generation** (Recommended): Configure parameters and let Gemini AI create custom NEET questions with explanations
   - **Manual**: Edit `questions.json` with your own questions
3. **Create Form**: Automatically creates Google Forms quiz with all questions
4. **Email Delivery**: Sends quiz link to configured email
5. **Outputs** edit and share links for the form

#### Using AI Generation

The AI-powered generator allows you to:

- **Multiple AI Services**: Choose your preferred AI:
  - 🔷 **Gemini** (Google AI Studio) - Fast, free, no login for guest mode
  - 💬 **ChatGPT** (OpenAI) - Opens in temporary chat mode (no history saved)
  - 🧠 **Claude** (Anthropic) - High-quality responses
  - 🔮 **DeepSeek** - Alternative AI option
  - **Auto-copy**: Prompt is automatically copied to clipboard when you click any AI button
- **Subject Distribution**: Specify exact number of questions per subject (Botany, Zoology, Physics, Chemistry)

- **Preferred Topics** (Optional): Focus on specific topics within each subject
  - Examples: "Photosynthesis, Plant Hormones" for Botany
  - "Electrostatics, Magnetism" for Physics
  - "Organic Reactions, Chemical Bonding" for Chemistry
  - Leave empty to cover all NEET syllabus topics
- **Difficulty Control**: Set ratio like 3:2:1:10 for Easy:Medium:Hard:Very Hard questions

- **Question Styles**: Mix different types:
  - 📝 Lengthy (detailed scenarios)
  - ⏱️ Time-taking (multi-step calculations)
  - 💨 One-line (quick recall)
  - 🌀 Confusing (tricky options)
  - 💡 Conceptual (deep understanding)
  - 🔧 Application-based (real-world problems)
- **Auto-Explanations**: Each question includes detailed explanation for learning

**AI Workflow:**

1. Configure your question parameters (subjects, difficulty, types)
2. Click "Build Prompt for AI"
3. Choose any AI service (Gemini, ChatGPT, Claude, or DeepSeek)
4. Prompt is auto-copied - just paste (Ctrl+V) in the AI chat
5. Copy the JSON response from AI
6. Paste it back and click "Save Questions & Continue"
7. Create Google Form with one click!

The script will:

1. Create a new Google Form with today's date
2. Add all questions from `questions.json`
3. Set correct answers and point values
4. Move the form to your specified folder
5. Output edit and share links

## Files

- `server.js` - Web server with beautiful UI
- `public/index.html` - Web interface for easy OAuth and form creation
- `createFormOAuth.js` - Command-line script using OAuth2
- `questions.json` - Quiz questions data
- `.env` - Environment variables (FOLDER_ID, PORT)
- `package.json` - Node dependencies
- `.gitignore` - Protects sensitive files

## Security

**⚠️ NEVER commit these files to Git:**

- `credentials.json`
- `oauth_credentials.json`
- `token.json`
- `.env`

These files contain sensitive authentication data and are protected by `.gitignore`.

**✅ Safe to commit:**

- `.env.example` - Template for environment variables
- `oauth_credentials.json.example` - Template for OAuth credentials

## Troubleshooting

### "Storage quota exceeded" error

- Use OAuth2 authentication (this script) instead of service accounts
- Service accounts have limited storage

### "Access denied" error

- Make sure you've granted all permissions during OAuth flow
- Check that Google Forms API and Drive API are enabled

### Token expired

- Delete `token.json` and run the script again to re-authenticate

## License

MIT
