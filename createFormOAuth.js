// ALTERNATIVE SOLUTION: Use OAuth2 instead of Service Account
// This will open a browser for you to authenticate with your personal Google account

const { google } = require("googleapis");
const path = require("path");
const fs = require("fs");
require("dotenv").config();

const FOLDER_ID = process.env.FOLDER_ID;
const TOKEN_PATH = path.join(__dirname, "token.json");

// You'll need to create OAuth2 credentials in Google Cloud Console
// and save them as oauth_credentials.json
const OAUTH_CREDS_PATH = path.join(__dirname, "oauth_credentials.json");

async function authorize() {
  let credentials;
  try {
    credentials = JSON.parse(fs.readFileSync(OAUTH_CREDS_PATH));
  } catch (err) {
    console.error("❌ oauth_credentials.json not found!");
    console.error("Create OAuth2 credentials at:");
    console.error("https://console.cloud.google.com/apis/credentials");
    console.error("Download and save as oauth_credentials.json");
    process.exit(1);
  }

  const { client_secret, client_id, redirect_uris } =
    credentials.installed || credentials.web;
  const oAuth2Client = new google.auth.OAuth2(
    client_id,
    client_secret,
    redirect_uris[0],
  );

  // Check if we have a token
  if (fs.existsSync(TOKEN_PATH)) {
    const token = JSON.parse(fs.readFileSync(TOKEN_PATH));
    oAuth2Client.setCredentials(token);
    return oAuth2Client;
  }

  // Get new token
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: "offline",
    scope: [
      "https://www.googleapis.com/auth/forms.body",
      "https://www.googleapis.com/auth/drive",
    ],
  });

  console.log("Authorize this app by visiting:");
  console.log(authUrl);
  console.log("\nPaste the code here:");

  const readline = require("readline").createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    readline.question("Code: ", async (code) => {
      readline.close();
      const { tokens } = await oAuth2Client.getToken(code);
      oAuth2Client.setCredentials(tokens);
      fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens));
      console.log("✅ Token saved to", TOKEN_PATH);
      resolve(oAuth2Client);
    });
  });
}

async function createNeetQuiz(questions) {
  const auth = await authorize();
  const forms = google.forms({ version: "v1", auth });
  const drive = google.drive({ version: "v3", auth });

  const formTitle = `NEET 2026 Daily Test - ${new Date()
    .toLocaleDateString("en-US", {
      month: "2-digit",
      day: "2-digit",
      year: "numeric",
    })
    .replace(/\//g, "-")}`;

  console.log(`\nCreating form: ${formTitle}...`);
  const newForm = await forms.forms.create({
    requestBody: {
      info: {
        title: formTitle,
        documentTitle: formTitle,
      },
    },
  });

  const formId = newForm.data.formId;
  console.log(`✅ Form created: ${formId}`);

  console.log("Moving form to folder...");
  await drive.files.update({
    fileId: formId,
    addParents: FOLDER_ID,
    fields: "id,parents",
  });
  console.log("✅ Form moved to folder");

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
              pointValue: 4, // 4 points per question (NEET style)
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

  console.log("Adding questions...");
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

  console.log(`✅ Edit Link: https://docs.google.com/forms/d/${formId}/edit`);
  console.log(
    `📩 Send Link: https://docs.google.com/forms/d/${formId}/viewform`,
  );
}

const dailyQuestions = require("./questions.json");
createNeetQuiz(dailyQuestions).catch(console.error);
