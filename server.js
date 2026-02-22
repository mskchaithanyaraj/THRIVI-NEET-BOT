const express = require("express");
const { google } = require("googleapis");
const { GoogleGenerativeAI } = require("@google/generative-ai");
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

// Initialize Gemini AI
let genAI = null;
if (process.env.GEMINI_API_KEY) {
  genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  console.log("🤖 Gemini AI configured");
} else {
  console.log("⚠️  Gemini AI not configured (add GEMINI_API_KEY to .env)");
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

// Function to calculate difficulty distribution per subject
function calculateDifficultyDistribution(
  subjectCount,
  easy,
  medium,
  hard,
  veryHard,
) {
  if (subjectCount === 0) {
    return { easy: 0, medium: 0, hard: 0, veryHard: 0 };
  }

  const ratioSum = easy + medium + hard + veryHard;

  // Handle edge case: if all ratios are 0, distribute evenly
  if (ratioSum === 0) {
    const perDifficulty = Math.floor(subjectCount / 4);
    const remainder = subjectCount % 4;
    return {
      easy: perDifficulty + (remainder > 0 ? 1 : 0),
      medium: perDifficulty + (remainder > 1 ? 1 : 0),
      hard: perDifficulty + (remainder > 2 ? 1 : 0),
      veryHard: perDifficulty,
    };
  }

  // Calculate proportional distribution
  const easyCount = Math.round((subjectCount * easy) / ratioSum);
  const mediumCount = Math.round((subjectCount * medium) / ratioSum);
  const hardCount = Math.round((subjectCount * hard) / ratioSum);
  const veryHardCount = Math.round((subjectCount * veryHard) / ratioSum);

  // Adjust for rounding errors to match exact count
  let total = easyCount + mediumCount + hardCount + veryHardCount;
  let distribution = {
    easy: easyCount,
    medium: mediumCount,
    hard: hardCount,
    veryHard: veryHardCount,
  };

  // If total doesn't match due to rounding, adjust the largest category
  if (total !== subjectCount) {
    const diff = subjectCount - total;
    const largest = Object.keys(distribution).reduce((a, b) =>
      distribution[a] > distribution[b] ? a : b,
    );
    distribution[largest] += diff;
  }

  // Ensure no negative values
  Object.keys(distribution).forEach((key) => {
    if (distribution[key] < 0) distribution[key] = 0;
  });

  return distribution;
}

// Function to build AI prompt based on user parameters
function buildQuestionPrompt(params) {
  const {
    botany,
    zoology,
    physics,
    chemistry,
    easy,
    medium,
    hard,
    veryHard,
    questionTypes,
    botanyTopics,
    zoologyTopics,
    physicsTopics,
    chemistryTopics,
  } = params;

  const totalQuestions = botany + zoology + physics + chemistry;
  const difficultyRatio = [easy, medium, hard, veryHard].join(":");

  // Calculate per-subject difficulty distribution
  const botanyDiff = calculateDifficultyDistribution(
    botany,
    easy,
    medium,
    hard,
    veryHard,
  );
  const zoologyDiff = calculateDifficultyDistribution(
    zoology,
    easy,
    medium,
    hard,
    veryHard,
  );
  const physicsDiff = calculateDifficultyDistribution(
    physics,
    easy,
    medium,
    hard,
    veryHard,
  );
  const chemistryDiff = calculateDifficultyDistribution(
    chemistry,
    easy,
    medium,
    hard,
    veryHard,
  );

  // Build difficulty breakdown text
  let difficultyBreakdown = "";
  if (botany > 0) {
    difficultyBreakdown += `  - Botany (${botany} total): ${botanyDiff.easy} Easy, ${botanyDiff.medium} Medium, ${botanyDiff.hard} Hard, ${botanyDiff.veryHard} Very Hard\n`;
  }
  if (zoology > 0) {
    difficultyBreakdown += `  - Zoology (${zoology} total): ${zoologyDiff.easy} Easy, ${zoologyDiff.medium} Medium, ${zoologyDiff.hard} Hard, ${zoologyDiff.veryHard} Very Hard\n`;
  }
  if (physics > 0) {
    difficultyBreakdown += `  - Physics (${physics} total): ${physicsDiff.easy} Easy, ${physicsDiff.medium} Medium, ${physicsDiff.hard} Hard, ${physicsDiff.veryHard} Very Hard\n`;
  }
  if (chemistry > 0) {
    difficultyBreakdown += `  - Chemistry (${chemistry} total): ${chemistryDiff.easy} Easy, ${chemistryDiff.medium} Medium, ${chemistryDiff.hard} Hard, ${chemistryDiff.veryHard} Very Hard\n`;
  }

  // Build topic preferences section
  let topicPreferences = "";
  const topicsList = [];

  if (botanyTopics && botany > 0) {
    topicsList.push(`- Botany: Focus on ${botanyTopics}`);
  }
  if (zoologyTopics && zoology > 0) {
    topicsList.push(`- Zoology: Focus on ${zoologyTopics}`);
  }
  if (physicsTopics && physics > 0) {
    topicsList.push(`- Physics: Focus on ${physicsTopics}`);
  }
  if (chemistryTopics && chemistry > 0) {
    topicsList.push(`- Chemistry: Focus on ${chemistryTopics}`);
  }

  if (topicsList.length > 0) {
    topicPreferences = `\n**Preferred Topics:**\n${topicsList.join("\n")}\nIf topics are specified, prioritize questions from these areas while maintaining the subject distribution.\n`;
  }

  // Build question types description
  const typeDescriptions = [];
  if (questionTypes.includes("lengthy"))
    typeDescriptions.push(
      "lengthy questions with detailed scenarios or long problem statements",
    );
  if (questionTypes.includes("timeTaking"))
    typeDescriptions.push(
      "time-consuming questions requiring multiple steps or calculations",
    );
  if (questionTypes.includes("oneLine"))
    typeDescriptions.push(
      "concise one-line questions testing quick recall or direct concepts",
    );
  if (questionTypes.includes("confusing"))
    typeDescriptions.push(
      "confusing questions with similar-looking options or tricky wording",
    );
  if (questionTypes.includes("conceptual"))
    typeDescriptions.push(
      "conceptual questions testing deep understanding of principles",
    );
  if (questionTypes.includes("application"))
    typeDescriptions.push(
      "application-based questions requiring real-world problem-solving",
    );

  const typeString =
    typeDescriptions.length > 0
      ? typeDescriptions.join("; ")
      : "a balanced mix of question types";

  return `You are an expert NEET (National Eligibility cum Entrance Test) exam question generator with deep knowledge of NEET exam patterns, previous year questions, and high-weightage topics. Create exactly ${totalQuestions} high-quality multiple-choice questions for NEET preparation with the following specifications:

**IMPORTANT: NEET 2026 Exam Alignment**
- Prioritize topics and question patterns that have appeared frequently in previous NEET exams
- Focus on high-weightage topics that are statistically important for NEET 2026
- Emulate the style, difficulty, and depth of actual NEET previous year questions
- Include concepts that have been repeatedly tested across multiple NEET years
- Consider current NEET 2026 syllabus trends and commonly tested areas

**Subject Distribution:**
- Botany: ${botany} questions
- Zoology: ${zoology} questions  
- Physics: ${physics} questions
- Chemistry: ${chemistry} questions
${topicPreferences}
**Difficulty Distribution (Ratio ${difficultyRatio} applied per subject):**
Apply this difficulty distribution for EACH subject separately:
${difficultyBreakdown}
Difficulty Guidelines:
- Easy: Basic recall, direct formula application, fundamental concepts
- Medium: Multi-step problems, application of concepts, moderate complexity
- Hard: Complex problem-solving, deep conceptual understanding, tricky scenarios
- Very Hard: Advanced application, integration of multiple concepts, NEET-level challenging

**Question Types:**
Create questions with these characteristics: ${typeString}

**FORMAT REQUIREMENTS (CRITICAL):**
You MUST respond with ONLY a valid JSON array. No markdown, no code blocks, no extra text.

Each question object must have:
{
  "q": "The question text",
  "opts": ["Option 1", "Option 2", "Option 3", "Option 4"],
  "ans": 0,
  "explanation": "Detailed explanation of the correct answer and why others are wrong",
  "subject": "Botany/Zoology/Physics/Chemistry",
  "difficulty": "Easy/Medium/Hard/Very Hard",
  "type": "lengthy/timeTaking/oneLine/confusing/conceptual/application"
}

**Quality Guidelines:**
1. Questions should be NEET-standard with authentic medical entrance exam difficulty
2. **Prioritize topics that appear frequently in NEET previous year papers and have high weightage**
3. **Model questions after actual NEET exam patterns - use similar phrasing, complexity, and concept combinations**
4. Options should be plausible and well-distributed (not obviously wrong)
5. Explanations should be educational and help students learn, referencing NEET trends where applicable
6. Physics/Chemistry: Include numerical problems, equations, and reactions that are NEET favorites
7. Biology: Cover anatomy, physiology, taxonomy, genetics, ecology comprehensively - focus on NCERT-based high-yield topics
8. Avoid ambiguous wording - questions should have ONE clear correct answer
9. Use proper scientific terminology and nomenclature as per NEET standards
10. For numerical questions, show calculation steps in explanation
11. **Consider cross-topic integrations that NEET frequently tests (e.g., biomolecules + metabolism, mechanics + thermodynamics)**

**RESPOND WITH JSON ARRAY ONLY - NO OTHER TEXT**`;
}

app.post("/generate-questions", async (req, res) => {
  try {
    const params = req.body;

    // Validate parameters
    const totalQuestions =
      params.botany + params.zoology + params.physics + params.chemistry;
    if (totalQuestions === 0) {
      return res.json({
        success: false,
        error: "Please specify at least one question",
      });
    }

    console.log("📝 Building prompt for Gemini...");
    console.log(`   Total: ${totalQuestions} questions`);
    console.log(
      `   Subjects: B:${params.botany} Z:${params.zoology} P:${params.physics} C:${params.chemistry}`,
    );
    console.log(
      `   Difficulty: ${params.easy}:${params.medium}:${params.hard}:${params.veryHard}`,
    );
    console.log(`   Types: ${params.questionTypes.join(", ")}`);

    // Build the prompt
    const prompt = buildQuestionPrompt(params);

    console.log("✅ Prompt generated, sending to frontend");

    res.json({
      success: true,
      prompt: prompt,
      totalQuestions: totalQuestions,
    });
  } catch (error) {
    console.error("❌ Error generating questions:", error);
    res.json({
      success: false,
      error: error.message || "Failed to generate questions",
    });
  }
});

app.post("/save-questions", async (req, res) => {
  try {
    const { questionsJson } = req.body;

    if (!questionsJson) {
      return res.json({
        success: false,
        error: "No questions data provided",
      });
    }

    // Parse and validate JSON
    let questions;
    try {
      questions = JSON.parse(questionsJson);
    } catch (parseError) {
      return res.json({
        success: false,
        error: "Invalid JSON format. Please check your input.",
      });
    }

    // Validate questions format
    if (!Array.isArray(questions) || questions.length === 0) {
      return res.json({
        success: false,
        error: "Questions must be a non-empty array",
      });
    }

    // Basic validation of question structure
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (
        !q.q ||
        !Array.isArray(q.opts) ||
        q.opts.length !== 4 ||
        typeof q.ans !== "number"
      ) {
        return res.json({
          success: false,
          error: `Invalid question format at question ${i + 1}`,
        });
      }
    }

    // Save to questions.json
    fs.writeFileSync(
      path.join(__dirname, "questions.json"),
      JSON.stringify(questions, null, 2),
    );

    console.log(`✅ Saved ${questions.length} questions successfully`);

    res.json({
      success: true,
      count: questions.length,
      questions: questions,
    });
  } catch (error) {
    console.error("❌ Error saving questions:", error);
    res.json({
      success: false,
      error: error.message || "Failed to save questions",
    });
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
