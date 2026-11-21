# MediTrack — Smart Medicine Reminder

> **Problem Statement PS02 — Healthcare & Elderly Accessibility**  
> An intelligent, senior-first medication adherence console powered by **Google Gemini Multimodal AI (`@google/genai`)**, featuring zero-typing onboarding via prescription vision & voice dictation, Web Audio API dose reminder chimes, real-time adherence tracking, and one-click caregiver reporting.

---

## 1. Problem Statement Alignment (PS02 Healthcare — Elderly Medication Adherence)

Elderly individuals frequently face challenges with complex polypharmacy regimens:
- **Small print and illegible medical handwriting** on medication packaging and doctors' prescriptions leading to dosage confusion.
- **Cognitive and vision decline** making conventional smartphone apps and dark SaaS dashboards intimidating and inaccessible.
- **Missed doses or accidental double-dosing** resulting in adverse drug events or preventable hospitalizations.
- **Caregiver anxiety and lack of visibility** where family members and caregivers struggle to stay updated on whether daily medications were taken safely on time.

### How MediTrack Solves This
1. **Senior-First Accessible UI**: Clean, warm alabaster-cream canvas (`#FDFBF7`) with high-contrast `Atkinson Hyperlegible` typography, dynamic 18px–24px text scaling, and minimum 52px touch targets.
2. **Zero-Typing Onboarding**: Elderly users can simply photograph a prescription strip or tap the microphone to speak their doctor's directions.
3. **Structured Timelines**: Automatically organizes medicines into **Morning**, **Afternoon**, **Evening**, and **Night** slots with plain-language "Why I take this" summaries and food instructions.
4. **Interactive Adherence & Auditory Reminders**: Gentle Web Audio synthesizer chimes, browser speech synthesis schedule read-alouds, and one-tap "Mark as Taken" tracking.
5. **Caregiver Transparency**: Instant WhatsApp/SMS report generator formatting completed vs. pending doses for family peace of mind.

---

## 2. Google Services Integration

### Live Google Gemini API (`@google/genai` SDK)
MediTrack interacts directly with Google's latest Gemini models using the official `@google/genai` SDK:
- **Multimodal Prescription Vision**: Analyzes uploaded medicine strip photos alongside natural language instructions.
- **Strict JSON Response Schema**: Enforces structured outputs (`medicines` array and `caregiverNote`) with schema verification, eliminating hallucinations.
- **Multi-Model Failover Cascade**: Robust `generateWithCascade(params)` function in `server.js` executing live models in prioritized order:
  1. `gemini-2.5-flash` (Primary high-speed multimodal model)
  2. `gemini-2.5-flash-lite` (Secondary lightweight failover)
  3. `gemini-2.0-flash` (Resilient fallback)
  - On HTTP `503`, `429`, or transient rate-limits, the server automatically waits 700ms before retrying with the next model.

### Google Cloud Run Deployment
Containerized using a production-ready `Dockerfile` (`node:20-alpine`) exposing port `8080` for serverless deployment on Google Cloud Run or Render.

---

## 3. Senior Accessibility Architecture

| Feature | Implementation | Senior Benefit |
| :--- | :--- | :--- |
| **Typography** | `Atkinson Hyperlegible` + `Plus Jakarta Sans` | Designed specifically for low-vision readability with distinct character shapes. |
| **Dynamic Font Scaler** | Top bar `A` (18px) / `A+` (21px) / `A++` (24px) | Instant UI-wide scaling without breaking layouts. |
| **Schedule Read-Aloud** | Web Speech API (`window.speechSynthesis`) | Seniors can listen to today's pending medicines spoken warmly and clearly. |
| **Gentle Dose Chime** | Web Audio API Synthesizer (C5 `523Hz` & E5 `659Hz`) | Soft acoustic chime replaces startling alarm tones. |
| **Voice Dictation** | Web Speech Recognition (`webkitSpeechRecognition`) | Allows patients with tremors or arthritis to speak their medicine names. |
| **Contrast & Touch** | WCAG AA+ compliant palettes, min 52px buttons | Eliminates misclicks and visual strain. |
| **Live Announcements** | ARIA live region (`aria-live="polite"`) | Full screen-reader support for assistive technologies. |

---

## 4. Security & Zero-Mock Architecture

- **Zero-Mock Policy**: MediTrack never serves hardcoded mock data, fake JSON, or simulation fallbacks. Every analysis call triggers the live Gemini API.
- **API Key Security**: Loaded securely through `process.env.GEMINI_API_KEY` using `dotenv`. Keys are never exposed to client-side code or committed to git.
- **Multer Memory Storage**: File uploads are buffered in RAM with strict validation:
  - Max file size: **5 MB**.
  - MIME-type filter: **Images only** (`image/jpeg`, `image/png`, `image/webp`).
  - No temporary disk files stored, preventing file-system clutter or unauthorized access.
- **Repository Optimization**: `.gitignore` strictly ignores `node_modules/`, `.env`, and log files, keeping total git repo size under 100 KB.

---

## 5. Local Setup & Cloud Deployment

### Prerequisites
- Node.js `>= 20.0.0`
- A valid Google Gemini API Key (`GEMINI_API_KEY`)

### Local Setup
1. Clone the repository and enter the directory:
   ```bash
   git clone <repo-url>
   cd meditrack-smart-reminder
   ```

2. Create a `.env` file in the root directory:
   ```env
   PORT=3000
   GEMINI_API_KEY=your_google_gemini_api_key_here
   ```

3. Install dependencies:
   ```bash
   npm install
   ```

4. Run automated smoke tests:
   ```bash
   npm test
   ```

5. Start the application:
   ```bash
   npm start
   ```
   Open `http://localhost:3000` in your browser.

---

### Docker & Cloud Deployment

Build and run the container locally:
```bash
docker build -t meditrack .
docker run -p 8080:8080 -e GEMINI_API_KEY="your_api_key" meditrack
```

#### Deploy to Google Cloud Run:
```bash
gcloud run deploy meditrack \
  --source . \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars GEMINI_API_KEY="your_api_key"
```

---

## 6. API Reference

### `GET /health`
Returns service status, name, and current timestamp.
```json
{
  "status": "ok",
  "service": "MediTrack",
  "timestamp": "2026-11-21T10:15:00.000Z"
}
```

### `POST /api/parse-prescription`
Accepts `multipart/form-data` with:
- `image`: (Optional) Prescription or packaging photo.
- `text`: (Optional) Voice dictation or natural language text instructions.

Returns parsed medicine schedule with elderly plain-language summaries and caregiver notes.

### `POST /api/care-check`
Accepts `application/json` with:
- `medicines`: Array of active medicine objects.

Returns clinical interaction check, overall status, safety advice, and warm spoken briefing.
