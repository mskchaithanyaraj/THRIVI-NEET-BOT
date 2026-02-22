# NEET Quiz Bot

Automated Google Forms quiz creator for NEET 2026 daily tests.

## Features

- ✅ Creates Google Forms quizzes with multiple choice questions
- ✅ Automatically sets correct answers and point values (4 points each)
- ✅ Moves forms to designated Google Drive folder
- ✅ OAuth2 authentication for secure access

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

2. Edit `.env` and set your Google Drive folder ID:

```
FOLDER_ID=your_folder_id_here
PORT=3000
```

To find your folder ID, open the folder in Google Drive and copy the ID from the URL:

```
https://drive.google.com/drive/folders/YOUR_FOLDER_ID_HERE
```

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

The application will:

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
