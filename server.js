const express = require("express");
const { google } = require("googleapis");
const path = require("path");
const fs = require("fs");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

const FOLDER_ID = process.env.FOLDER_ID;
const TOKEN_PATH = path.join(__dirname, "token.json");
const OAUTH_CREDS_PATH = path.join(__dirname, "oauth_credentials.json");

let oAuth2Client = null;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Initialize OAuth2 client
function getOAuthClient() {
  const credentials = JSON.parse(fs.readFileSync(OAUTH_CREDS_PATH));
  const { client_secret, client_id, redirect_uris } =
    credentials.installed || credentials.web;
  return new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
}

// Routes
app.get("/start-auth", (req, res) => {
  try {
    oAuth2Client = getOAuthClient();
    const authUrl = oAuth2Client.generateAuthUrl({
      access_type: "offline",
      scope: [
        "https://www.googleapis.com/auth/forms.body",
        "https://www.googleapis.com/auth/drive",
      ],
    });
    res.json({ success: true, authUrl });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

app.post("/submit-code", async (req, res) => {
  try {
    const { code } = req.body;
    const { tokens } = await oAuth2Client.getToken(code);
    oAuth2Client.setCredentials(tokens);
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens));
    res.json({ success: true });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

app.post("/create-form", async (req, res) => {
  try {
    // Check if we have a token
    if (!oAuth2Client || !fs.existsSync(TOKEN_PATH)) {
      return res.json({ success: false, error: "Not authenticated" });
    }

    // Load token if not already set
    if (!oAuth2Client.credentials || !oAuth2Client.credentials.access_token) {
      const token = JSON.parse(fs.readFileSync(TOKEN_PATH));
      oAuth2Client.setCredentials(token);
    }

    const forms = google.forms({ version: "v1", auth: oAuth2Client });
    const drive = google.drive({ version: "v3", auth: oAuth2Client });

    // Create form with proper title
    const formTitle = `NEET 2026 Daily Test - ${new Date()
      .toLocaleDateString("en-US", {
        month: "2-digit",
        day: "2-digit",
        year: "numeric",
      })
      .replace(/\//g, "-")}`;

    console.log(`Creating form: ${formTitle}`);

    const newForm = await forms.forms.create({
      requestBody: {
        info: {
          title: formTitle,
          documentTitle: formTitle,
        },
      },
    });

    const formId = newForm.data.formId;
    console.log(`Form created with ID: ${formId}`);

    // Move to folder
    await drive.files.update({
      fileId: formId,
      addParents: FOLDER_ID,
      fields: "id,parents",
    });

    // Load questions
    const questions = JSON.parse(
      fs.readFileSync(path.join(__dirname, "questions.json")),
    );

    // Create question requests
    const requests = questions.map((question, index) => ({
      createItem: {
        item: {
          title: question.q,
          questionItem: {
            question: {
              required: true,
              choiceQuestion: {
                type: "RADIO",
                options: question.opts.map((opt) => ({ value: opt })),
                shuffle: false,
              },
              grading: {
                pointValue: 4,
                correctAnswers: {
                  answers: [{ value: question.opts[question.ans] }],
                },
              },
            },
          },
        },
        location: { index: index },
      },
    }));

    // Add questions to form
    await forms.forms.batchUpdate({
      formId,
      requestBody: {
        requests: [
          {
            updateSettings: {
              settings: { quizSettings: { isQuiz: true } },
              updateMask: "quizSettings.isQuiz",
            },
          },
          ...requests,
        ],
      },
    });

    const editLink = `https://docs.google.com/forms/d/${formId}/edit`;
    const shareLink = `https://docs.google.com/forms/d/${formId}/viewform`;

    res.json({ success: true, formId, editLink, shareLink });
  } catch (error) {
    console.error("Error creating form:", error);
    res.json({ success: false, error: error.message });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`\n🚀 NEET Quiz Creator Server Started!`);
  console.log(`\n📱 Open in your browser:`);
  console.log(`   http://localhost:${PORT}\n`);
  console.log(`Press Ctrl+C to stop\n`);
});
