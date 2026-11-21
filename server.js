require('dotenv').config();
const express = require('express');
const path = require('path');
const multer = require('multer');
const { GoogleGenAI } = require('@google/genai');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware for parsing JSON and urlencoded bodies
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static frontend files from 'public'
app.use(express.static(path.join(__dirname, 'public')));

// Multer memory storage configuration with strict 5MB limit and image-only MIME filter
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5 MB maximum
  },
  fileFilter: (req, file, cb) => {
    if (file && file.mimetype && file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only image files (JPEG, PNG, WEBP, etc.) are allowed.'));
    }
  }
});

// Initialize Google GenAI client
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.warn('[MediTrack Warning] GEMINI_API_KEY is not defined in environment variables.');
}
const ai = new GoogleGenAI({ apiKey });

// Ordered failover cascade models
const CASCADE_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash",
  "gemini-3.5-flash",
  "gemini-3.5-flash-lite"
];

/**
 * Executes a Gemini request with automatic multi-model failover.
 * Retries on HTTP 503, 429, or rate limit/unavailable errors with a 700ms backoff.
 */
async function generateWithCascade({ contents, config, systemInstruction }) {
  let lastError = null;

  for (let i = 0; i < CASCADE_MODELS.length; i++) {
    const model = CASCADE_MODELS[i];
    try {
      console.log(`[MediTrack AI] Attempting generation with model: ${model}`);
      const response = await ai.models.generateContent({
        model,
        contents,
        config: {
          ...config,
          systemInstruction: systemInstruction || undefined
        }
      });
      console.log(`[MediTrack AI] Successfully generated response with model: ${model}`);
      return { response, modelUsed: model };
    } catch (err) {
      lastError = err;
      const errMsg = err?.message || String(err);
      const status = err?.status || err?.statusCode || (errMsg.match(/\b(503|429)\b/) ? parseInt(errMsg.match(/\b(503|429)\b/)[0]) : null);
      
      console.warn(`[MediTrack AI] Model ${model} failed (Status: ${status || 'N/A'}): ${errMsg}`);

      const isTransient = status === 503 || status === 429 ||
        errMsg.includes('503') || errMsg.includes('429') ||
        errMsg.includes('RESOURCE_EXHAUSTED') || errMsg.includes('UNAVAILABLE') ||
        errMsg.includes('overloaded');

      if (i < CASCADE_MODELS.length - 1) {
        const waitTime = isTransient ? 700 : 300;
        console.log(`[MediTrack AI] Waiting ${waitTime}ms before failing over to ${CASCADE_MODELS[i + 1]}...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        continue;
      }
    }
  }

  throw lastError;
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'MediTrack',
    timestamp: new Date().toISOString()
  });
});

/**
 * Endpoint 1: POST /api/parse-prescription
 * Accepts optional real image photo of medicine strip/prescription and/or spoken text.
 * Strictly uses live Gemini API with structured JSON responseSchema.
 */
app.post('/api/parse-prescription', (req, res, next) => {
  upload.single('image')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
    next();
  });
}, async (req, res) => {
  try {
    const text = req.body?.text?.trim() || '';
    const hasImage = Boolean(req.file && req.file.buffer);

    if (!hasImage && !text) {
      return res.status(400).json({
        success: false,
        error: 'Please provide either a prescription photo or written/voice instructions.'
      });
    }

    const contents = [];

    if (hasImage) {
      contents.push({
        inlineData: {
          mimeType: req.file.mimetype,
          data: req.file.buffer.toString('base64')
        }
      });
    }

    const promptText = `
You are an expert clinical pharmacist and geriatric accessibility specialist.
Carefully review the prescription image and/or the patient's spoken/written note:
${text ? `Patient / Spoken Note: "${text}"` : '(No additional text provided)'}

Extract all scheduled medicines into a senior-friendly daily routine.
Guidelines:
1. "timeSlot" MUST be strictly one of: "Morning", "Afternoon", "Evening", "Night".
2. "exactTime" MUST be formatted as "HH:MM AM" or "HH:MM PM" (e.g. "08:00 AM", "01:00 PM", "07:00 PM", "10:00 PM").
3. "foodInstruction" MUST be strictly one of: "Before Food", "After Food", "With Water".
4. "plainPurpose" MUST be a warm, crystal-clear 1-sentence explanation an elderly person understands without complex medical jargon (e.g. "Helps keep your blood pressure gentle and your heart steady.").
5. "precautionTip" MUST be a simple safety reminder (e.g. "Drink a full glass of water and sit upright for 10 minutes.").
6. "caregiverNote" MUST be a concise summary for family or caregivers regarding key adherence tips or potential interactions.
`;
    contents.push({ text: promptText });

    const responseSchema = {
      type: "OBJECT",
      properties: {
        medicines: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: {
              name: { type: "STRING" },
              dosage: { type: "STRING" },
              timeSlot: { type: "STRING", enum: ["Morning", "Afternoon", "Evening", "Night"] },
              exactTime: { type: "STRING" },
              foodInstruction: { type: "STRING", enum: ["Before Food", "After Food", "With Water"] },
              plainPurpose: { type: "STRING" },
              precautionTip: { type: "STRING" }
            },
            required: ["name", "dosage", "timeSlot", "exactTime", "foodInstruction", "plainPurpose", "precautionTip"]
          }
        },
        caregiverNote: { type: "STRING" }
      },
      required: ["medicines", "caregiverNote"]
    };

    const cascadeResult = await generateWithCascade({
      contents,
      config: {
        responseMimeType: "application/json",
        responseSchema
      }
    });

    const parsedData = JSON.parse(cascadeResult.response.text);

    return res.json({
      success: true,
      modelUsed: cascadeResult.modelUsed,
      data: parsedData
    });
  } catch (err) {
    console.error('[MediTrack Error] /api/parse-prescription failed:', err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to analyze prescription.'
    });
  }
});

/**
 * Endpoint 2: POST /api/care-check
 * Accepts active medicines JSON and returns structured safety advice and elderly spoken summary.
 */
app.post('/api/care-check', async (req, res) => {
  try {
    const medicines = req.body?.medicines;
    if (!Array.isArray(medicines) || medicines.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Please provide a non-empty array of active medicines to evaluate.'
      });
    }

    const promptText = `
You are an expert geriatric pharmacologist and caring family doctor reviewing this elderly patient's active medicine schedule:
${JSON.stringify(medicines, null, 2)}

Please analyze:
1. Are medicines timed safely throughout the day (Morning, Afternoon, Evening, Night)?
2. Are food instructions followed (Before Food vs After Food)?
3. Are there any common interaction risks or timing spacing advice to follow?
4. Formulate "spokenSummary": A warm, encouraging, plain-language audio script specifically written to be read aloud via Text-to-Speech to an elderly patient (e.g. "Good day! Here is your daily medicine check. You have 3 medicines scheduled today...").
`;

    const responseSchema = {
      type: "OBJECT",
      properties: {
        overallStatus: { type: "STRING" },
        safetyAdvice: {
          type: "ARRAY",
          items: { type: "STRING" }
        },
        spokenSummary: { type: "STRING" }
      },
      required: ["overallStatus", "safetyAdvice", "spokenSummary"]
    };

    const cascadeResult = await generateWithCascade({
      contents: [{ text: promptText }],
      config: {
        responseMimeType: "application/json",
        responseSchema
      }
    });

    const parsedData = JSON.parse(cascadeResult.response.text);

    return res.json({
      success: true,
      modelUsed: cascadeResult.modelUsed,
      data: parsedData
    });
  } catch (err) {
    console.error('[MediTrack Error] /api/care-check failed:', err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to perform safety and care check.'
    });
  }
});

// Start server if executed directly
if (require.main === module) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[MediTrack] Server running at http://localhost:${PORT}`);
    console.log(`[MediTrack] Open in your browser: http://localhost:${PORT} or http://127.0.0.1:${PORT}`);
  });
}

module.exports = app;
