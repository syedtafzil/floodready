# FloodReady 🌊

FloodReady is a situational flood assessment assistant powered by Google's Gemini API. It assists users facing rising water or flood threats by structuring reported observations into:
1. **Plain-Language Summary:** A clear breakdown of what is happening.
2. **Critical Missing Details:** Vital situational facts (e.g., rising rate, vulnerable occupants, access routes) that emergency teams and family need.
3. **Suggested Next Steps:** Actionable safety suggestions clearly designated as AI suggestions.

---

## 🔒 Security & Privacy Notice
* **Private API Key Isolation:** Your `GEMINI_API_KEY` is kept exclusively on your local server within `.env.local`.
* **Zero Browser Exposure:** The key is never transferred to the browser, stored in client-side code, or displayed in the UI.
* **Git Protection:** `.env.local` is listed in `.gitignore` to prevent inadvertent commits to GitHub.

---

## ⚠️ Emergency Disclaimer
* **AI Suggestions Are Unverified:** All assessments are informational suggestions to assist situational clarity. They are **not** official emergency orders or rescue dispatch.
* **No Invented Numbers:** FloodReady never invents or claims verified emergency phone numbers. Always contact your local authorized emergency dispatchers during life-threatening crises.

---

## 🚀 Quick Start

### 1. Add your Gemini API Key
Open `.env.local` in your editor and add your key on line 3:
```env
GEMINI_API_KEY=your_actual_gemini_api_key
```

### 2. Start the App
You can start the app in any of the following ways:

#### Option A: Double-click `start.bat`
Just double-click `start.bat` in the project folder. It will launch the local server and open `http://localhost:3000` in your browser.

#### Option B: Terminal (PowerShell)
```powershell
powershell -ExecutionPolicy Bypass -File server.ps1
```

#### Option C: Node.js (if Node.js is installed)
```bash
node server.js
```
Then open [http://localhost:3000](http://localhost:3000) in your browser.
