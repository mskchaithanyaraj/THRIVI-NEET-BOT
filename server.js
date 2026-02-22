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

**MATHEMATICAL NOTATION RULES (EXTREMELY IMPORTANT):**
1. **NEVER use LaTeX, TeX, or any markup language for mathematical formulas**
2. **ALL mathematical symbols MUST be written in plain text or Unicode**
3. **Examples of acceptable formats:**
   - Superscripts: Use Unicode (Ca²⁺, CO₂, H₂O, 10³, m²) or plain text (Ca2+, CO2, H2O, 10^3, m^2)
   - Subscripts: Use Unicode (H₂O, CO₂, C₆H₁₂O₆) or plain text (H2O, CO2, C6H12O6)
   - Greek letters: Use Unicode (α, β, γ, Δ, λ, μ, π, Σ) or spell out (alpha, beta, gamma, Delta, lambda, mu, pi, sigma)
   - Fractions: Write as "3/4" or "0.75", not as complex notation
   - Equations: Write linearly like "E = mc^2" or "PV = nRT"
   - Chromosomes: Write as "2n = 12" or "n + 1" or "2n + 1"
   - Concentration: Write as "10^6 per mL" or "1 million per mL"
4. **VERIFY every option has actual text content - NO EMPTY OPTIONS**
5. **For Physics/Chemistry with calculations:**
   - Use simple format: "F = ma", "v = u + at"
   - Numbers: "9.8 m/s^2", "3.0 × 10^8 m/s"
   - Units: "20 cm", "1.5 g/mol", "300 K"

**CORRECT FORMAT EXAMPLES:**
Good Biology Option: "A diploid organism with 2n = 24 chromosomes"
Good Chemistry Option: "The enthalpy change is -890 kJ/mol for complete combustion"
Good Physics Option: "The velocity increases from 10 m/s to 25 m/s in 3 seconds"
Bad Option: "The value is  ()" ← NEVER DO THIS (empty/incomplete)
Bad Option: "$\\Delta H = -890$" ← NEVER DO THIS (LaTeX)

**Quality Guidelines:**
1. Questions should be NEET-standard with authentic medical entrance exam difficulty
2. **Prioritize topics that appear frequently in NEET previous year papers and have high weightage**
3. **Model questions after actual NEET exam patterns - use similar phrasing, complexity, and concept combinations**
4. Options should be plausible and well-distributed (not obviously wrong)
5. **CRITICAL: Every option MUST contain complete, readable text - NO EMPTY or PARTIAL options**
6. Explanations should be educational and help students learn, referencing NEET trends where applicable
7. Physics/Chemistry: Include numerical problems, equations, and reactions that are NEET favorites
8. Biology: Cover anatomy, physiology, taxonomy, genetics, ecology comprehensively - focus on NCERT-based high-yield topics
9. Avoid ambiguous wording - questions should have ONE clear correct answer
10. Use proper scientific terminology and nomenclature as per NEET standards
11. For numerical questions, show calculation steps in explanation (in plain text format)
12. **Consider cross-topic integrations that NEET frequently tests (e.g., biomolecules + metabolism, mechanics + thermodynamics)**
13. **BEFORE submitting, verify EVERY option in EVERY question has actual text content**

**FINAL CHECKLIST (Verify before responding):**
✓ All mathematical symbols are in plain text or Unicode (NO LaTeX)
✓ Every option has complete, readable text (minimum 10 characters)
✓ No empty strings, no placeholders like (), no missing formulas
✓ All numerical values are clearly written (e.g., "20 cm", "1.5 mol/L")
✓ Chemical formulas use simple notation (H2O, Ca2+, CO2)
✓ Valid JSON format with no syntax errors

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
      if (!q.q || typeof q.q !== "string") {
        return res.json({
          success: false,
          error: `Question ${i + 1}: Missing or invalid question text`,
        });
      }

      // Check for problematic patterns in question text
      const qText = q.q.trim();
      if (qText.includes(" ()") || qText.includes("() ")) {
        return res.json({
          success: false,
          error: `Question ${i + 1}: Question contains empty parentheses - likely missing mathematical notation. Please use plain text like "2n = 12" instead of LaTeX.`,
        });
      }
      if (qText.match(/\s+per\s+mL/i) && qText.match(/\(\s*\)\s+per/i)) {
        return res.json({
          success: false,
          error: `Question ${i + 1}: Question has missing value before "per mL". Example: use "10^6 per mL" instead of "() per mL"`,
        });
      }

      if (!Array.isArray(q.opts) || q.opts.length !== 4) {
        return res.json({
          success: false,
          error: `Question ${i + 1}: Must have exactly 4 options`,
        });
      }

      // Validate each option is a non-empty, meaningful string
      for (let j = 0; j < q.opts.length; j++) {
        const opt = q.opts[j];

        // Check basic type and empty string
        if (typeof opt !== "string") {
          return res.json({
            success: false,
            error: `Question ${i + 1}, Option ${j + 1}: Not a string (found ${typeof opt})`,
          });
        }

        const trimmedOpt = opt.trim();

        // Check if empty after trimming
        if (trimmedOpt === "") {
          return res.json({
            success: false,
            error: `Question ${i + 1}, Option ${j + 1}: Empty option text`,
          });
        }

        // Check minimum length (at least 2 characters)
        if (trimmedOpt.length < 2) {
          return res.json({
            success: false,
            error: `Question ${i + 1}, Option ${j + 1}: Option too short ("${trimmedOpt}") - minimum 2 characters`,
          });
        }

        // Check for problematic patterns that indicate incomplete rendering
        const problematicPatterns = [
          { pattern: /^\(\)$/, desc: "only empty parentheses" },
          { pattern: /^\s*\(\s*\)\s*$/, desc: "only empty parentheses" },
          {
            pattern: /\(\s*\)\s+and\s+\(\s*\)/i,
            desc: "multiple empty parentheses (missing chromosome notation like '2n+1 and 2n-1')",
          },
          {
            pattern: /trisomic\s+\(\s*\)/i,
            desc: "trisomic with empty parentheses (should be like 'trisomic (2n+1)')",
          },
          {
            pattern: /monosomic\s+\(\s*\)/i,
            desc: "monosomic with empty parentheses (should be like 'monosomic (2n-1)')",
          },
          {
            pattern: /containing\s+\(\s*\)\s+chromosomes/i,
            desc: "missing chromosome count",
          },
          { pattern: /^\$+$/, desc: "only dollar signs (LaTeX remnant)" },
          { pattern: /^\\+$/, desc: "only backslashes (LaTeX remnant)" },
          { pattern: /^\s*\s*$/, desc: "only empty angle brackets" },
          {
            pattern: /\(\s*\)\s+per\s+mL/i,
            desc: "missing value before 'per mL' (should be like '10^6 per mL')",
          },
          { pattern: /^\s*per\s+/i, desc: "starts with 'per' (missing value)" },
          {
            pattern: /\s{5,}/,
            desc: "excessive whitespace (possible stripped content)",
          },
          { pattern: /^\s*\s*$/i, desc: "empty mu symbol placeholders" },
        ];

        for (const { pattern, desc } of problematicPatterns) {
          if (pattern.test(trimmedOpt)) {
            return res.json({
              success: false,
              error: `Question ${i + 1}, Option ${j + 1}: Invalid option format - ${desc}. Value: "${trimmedOpt.substring(0, 100)}"`,
            });
          }
        }

        // Log options for debugging (only first 60 chars)
        console.log(
          `Q${i + 1} Opt${j + 1}: "${trimmedOpt.substring(0, 60)}${trimmedOpt.length > 60 ? "..." : ""}"`,
        );
      }

      if (typeof q.ans !== "number" || q.ans < 0 || q.ans > 3) {
        return res.json({
          success: false,
          error: `Question ${i + 1}: Answer index must be 0-3`,
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

    console.log(`📋 Loaded ${questions.length} questions from file`);

    // Create question requests
    const requests = questions.map((question, index) => {
      // Validate question text
      const qText = question.q?.trim() || "";
      if (!qText) {
        throw new Error(`Question ${index + 1}: Missing question text`);
      }

      // Check for problematic patterns in question text
      if (qText.includes(" ()") || qText.includes("() ")) {
        throw new Error(
          `Question ${index + 1}: Question contains empty parentheses "()". This indicates missing mathematical notation. Please regenerate questions using plain text format like "2n = 12" instead of LaTeX.`,
        );
      }

      // Ensure answer index is valid first
      const answerIndex = parseInt(question.ans);
      if (
        isNaN(answerIndex) ||
        answerIndex < 0 ||
        answerIndex >= question.opts.length
      ) {
        throw new Error(
          `Question ${index + 1}: Invalid answer index ${question.ans}`,
        );
      }

      // Ensure options are properly formatted strings and store cleaned values
      const cleanedOptions = question.opts.map((opt, optIdx) => {
        const optValue =
          typeof opt === "string" ? opt.trim() : String(opt).trim();

        if (!optValue) {
          throw new Error(
            `Question ${index + 1}, Option ${optIdx + 1}: Empty option detected`,
          );
        }

        // Check minimum length
        if (optValue.length < 2) {
          throw new Error(
            `Question ${index + 1}, Option ${optIdx + 1}: Option too short ("${optValue}") - minimum 2 characters required`,
          );
        }

        // Check for problematic patterns
        const problematicPatterns = [
          { pattern: /^\(\)$/, desc: "only empty parentheses" },
          { pattern: /^\s*\(\s*\)\s*$/, desc: "only empty parentheses" },
          {
            pattern: /\(\s*\)\s+and\s+\(\s*\)/i,
            desc: "contains empty parentheses like '() and ()' (missing chromosome notation)",
          },
          {
            pattern: /trisomic\s+\(\s*\)/i,
            desc: "trisomic with empty parentheses (should be 'trisomic (2n+1)')",
          },
          {
            pattern: /monosomic\s+\(\s*\)/i,
            desc: "monosomic with empty parentheses (should be 'monosomic (2n-1)')",
          },
          {
            pattern: /containing\s+\(\s*\)\s+chromosomes/i,
            desc: "missing chromosome count",
          },
          {
            pattern: /of\s+\(\s*\)/i,
            desc: "contains 'of ()' - missing value",
          },
          {
            pattern: /\(\s*\)\s+per\s+mL/i,
            desc: "missing value before 'per mL' (should be '10^6 per mL')",
          },
          { pattern: /^\s*per\s+/i, desc: "starts with 'per' (missing value)" },
        ];

        for (const { pattern, desc } of problematicPatterns) {
          if (pattern.test(optValue)) {
            throw new Error(
              `Question ${index + 1}, Option ${optIdx + 1}: Invalid option - ${desc}.\nValue: "${optValue.substring(0, 100)}"\n\n⚠️ This indicates the AI used LaTeX/mathematical notation that wasn't rendered. Please regenerate questions with the updated prompt that enforces plain text formatting.`,
            );
          }
        }

        return optValue;
      });

      // Use the cleaned option value for the correct answer
      const correctAnswerValue = cleanedOptions[answerIndex];

      // Final validation: Ensure correctAnswerValue is valid for Google Forms API
      if (!correctAnswerValue || correctAnswerValue.trim().length === 0) {
        throw new Error(
          `Question ${index + 1}: Correct answer value is empty or invalid. Answer index: ${answerIndex}`,
        );
      }

      // Validate all options one more time before creating API structure
      cleanedOptions.forEach((opt, idx) => {
        if (!opt || opt.length < 2) {
          throw new Error(
            `Question ${index + 1}, Option ${idx + 1}: Invalid option for Google Forms API - option.value requires at least 2 characters. Current: "${opt}"`,
          );
        }
      });

      console.log(
        `Q${index + 1}: Answer=${answerIndex}, Value="${correctAnswerValue.substring(0, 30)}..."`,
      );

      // Create the Google Forms API request structure
      const optionObjects = cleanedOptions.map((opt) => {
        // Double-check each option has a valid value property
        if (!opt || typeof opt !== "string" || opt.trim().length === 0) {
          throw new Error(`Invalid option.value: "${opt}"`);
        }
        return { value: opt };
      });

      return {
        createItem: {
          item: {
            title: question.q,
            questionItem: {
              question: {
                required: true,
                choiceQuestion: {
                  type: "RADIO",
                  options: optionObjects,
                  shuffle: false,
                },
                grading: {
                  pointValue: 4,
                  correctAnswers: {
                    answers: [{ value: correctAnswerValue }],
                  },
                },
              },
            },
          },
          location: { index: index },
        },
      };
    });

    // Debug: Log first question structure
    if (requests.length > 0) {
      console.log("📋 First question structure:");
      console.log(JSON.stringify(requests[0], null, 2).substring(0, 500));
    }

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
    console.error("❌ Error creating form:", error);
    console.error("Error details:", {
      message: error.message,
      code: error.code,
      errors: error.errors,
      stack: error.stack,
    });

    let errorMessage = error.message || "Failed to create form";

    // Provide helpful message for common issues
    if (error.message && error.message.includes("option.value")) {
      errorMessage = `❌ Invalid question options detected. ${error.message}\n\n📝 Solution: The current questions.json contains empty or improperly formatted options (like empty parentheses). Please:\n1. Generate a NEW prompt in Step 3 (the updated prompt enforces plain text formatting)\n2. Get NEW questions from AI\n3. Paste and save the new JSON\n4. Then create the form`;
    } else if (
      error.message &&
      (error.message.includes("empty parentheses") ||
        error.message.includes("LaTeX"))
    ) {
      errorMessage = `${error.message}\n\n📝 Solution: Please generate new questions using the updated prompt that enforces plain text formatting (no LaTeX).`;
    }

    res.json({
      success: false,
      error: errorMessage,
      details: error.errors || error.details || null,
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`\n🚀 NEET Quiz Creator Server Started!`);
  console.log(`\n📱 Open in your browser:`);
  console.log(`   http://localhost:${PORT}\n`);
  console.log(`Press Ctrl+C to stop\n`);
});
