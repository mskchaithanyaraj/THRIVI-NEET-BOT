const express = require("express");
const { google } = require("googleapis");
const path = require("path");
const fs = require("fs");
const nodemailer = require("nodemailer");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

const FOLDER_ID = process.env.FOLDER_ID;
const TOKEN_PATH = path.join(__dirname, "token.json");
const OAUTH_CREDS_PATH = path.join(__dirname, "oauth_credentials.json");

let oAuth2Client = null;

// Email transporter setup
let emailTransporter = null;
if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
  emailTransporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
  console.log("✉️  Email service configured");
} else {
  console.log(
    "⚠️  Email not configured (add EMAIL_USER and EMAIL_PASS to .env)",
  );
}

// Function to send email with form links
async function sendFormEmail(formTitle, editLink, shareLink) {
  if (!emailTransporter || !process.env.RECIPIENT_EMAIL) {
    console.log("⚠️  Email not sent: missing configuration");
    return { success: false, error: "Email not configured" };
  }

  try {
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: process.env.RECIPIENT_EMAIL,
      subject: `🎓 ${formTitle} - Ready!`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 10px 10px 0 0; text-align: center; }
            .content { background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px; }
            .button { display: inline-block; padding: 15px 30px; margin: 10px 5px; background: #667eea; color: white; text-decoration: none; border-radius: 8px; font-weight: bold; }
            .button:hover { background: #5568d3; }
            .button.secondary { background: #28a745; }
            .info { background: white; padding: 15px; border-left: 4px solid #667eea; margin: 20px 0; border-radius: 5px; }
            .footer { text-align: center; color: #666; font-size: 12px; margin-top: 20px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🎓 NEET Quiz Ready!</h1>
              <p style="margin: 0; opacity: 0.9;">${formTitle}</p>
            </div>
            <div class="content">
              <p>Hi! 👋</p>
              <p>Your daily NEET quiz has been created and is ready to go!</p>
              
              <div class="info">
                <strong>📝 Form Title:</strong><br>
                ${formTitle}
              </div>

              <div style="background: #fff3cd; padding: 15px; border-radius: 5px; border-left: 4px solid #ffc107;">
                <strong>📩 Neet Quiz Link (for students):</strong><br>
                <code style="word-break: break-all; font-size: 12px;">${shareLink}</code>
              </div>

              
            </div>
            <div class="footer">
              <p>Good luck, you need it :)</p>
              <p>Automated by NEET Quiz Creator - Chaithu 🤖</p>
              <p>Created on ${new Date().toLocaleString("en-US")}</p>
            </div>
          </div>
        </body>
        </html>
      `,
    };

    await emailTransporter.sendMail(mailOptions);
    console.log(`✅ Email sent to ${process.env.RECIPIENT_EMAIL}`);
    return { success: true };
  } catch (error) {
    console.error("❌ Email sending failed:", error.message);
    return { success: false, error: error.message };
  }
}

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

// Check if user is already authenticated
app.get("/check-auth", (req, res) => {
  try {
    // Check if token file exists
    if (!fs.existsSync(TOKEN_PATH)) {
      return res.json({ authenticated: false });
    }

    // Try to load and verify token
    const token = JSON.parse(fs.readFileSync(TOKEN_PATH));

    // Initialize OAuth client if not already done
    if (!oAuth2Client) {
      oAuth2Client = getOAuthClient();
    }

    oAuth2Client.setCredentials(token);

    res.json({ authenticated: true });
  } catch (error) {
    res.json({ authenticated: false, error: error.message });
  }
});

// Logout - clear token
app.post("/logout", (req, res) => {
  try {
    if (fs.existsSync(TOKEN_PATH)) {
      fs.unlinkSync(TOKEN_PATH);
    }
    oAuth2Client = null;
    res.json({ success: true });
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

    // Send email with form links
    console.log("📧 Sending email notification...");
    const emailResult = await sendFormEmail(formTitle, editLink, shareLink);

    res.json({
      success: true,
      formId,
      editLink,
      shareLink,
      emailSent: emailResult.success,
      emailError: emailResult.error,
    });
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
