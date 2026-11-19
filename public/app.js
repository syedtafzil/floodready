// FloodReady Client Application
// Note: This client never accesses or handles GEMINI_API_KEY directly.
// All Gemini interactions happen securely on the local backend server.

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('assessmentForm');
  const situationInput = document.getElementById('situationInput');
  const analyzeBtn = document.getElementById('analyzeBtn');
  const clearBtn = document.getElementById('clearBtn');
  const resultsCard = document.getElementById('resultsCard');
  const summaryText = document.getElementById('summaryText');
  const missingDetailsList = document.getElementById('missingDetailsList');
  const suggestedStepsList = document.getElementById('suggestedStepsList');
  const serverNotice = document.getElementById('serverNotice');
  const keyStatusBadge = document.getElementById('keyStatusBadge');
  const keyStatusText = document.getElementById('keyStatusText');
  const copyBtn = document.getElementById('copyBtn');
  const presetChips = document.querySelectorAll('.preset-chip');

  // Sample presets for quick testing
  const sampleScenarios = {
    residential: `Water has entered our ground floor and is currently knee-deep (about 20 inches). It has risen 6 inches in the last hour. We have moved 3 adults and 1 dog to the upper floor. The electrical breaker for the lower level was shut off, but the main power is still on. We have fresh drinking water for about 24 hours.`,
    vehicle: `Driving home on Route 4 near the river crossing, water suddenly covered the roadway ahead and is now creeping up to the bottom of the car doors. The engine stalled. Two adults inside. The current looks fast moving outside. Cell phone battery is at 35%.`,
    neighborhood: `Heavy rainfall for 5 hours. A flood alert was issued for our town basin. Street drainage is backed up, with water overflowing onto sidewalks. No water inside the house yet, but neighbors say the nearby creek is cresting.`
  };

  presetChips.forEach(chip => {
    chip.addEventListener('click', () => {
      const sampleKey = chip.getAttribute('data-sample');
      if (sampleScenarios[sampleKey]) {
        situationInput.value = sampleScenarios[sampleKey];
        situationInput.focus();
      }
    });
  });

  // Check server and API key status on load
  async function checkServerStatus() {
    try {
      const res = await fetch('/api/status');
      if (!res.ok) throw new Error('Server returned non-200');
      const data = await res.json();

      if (data.hasKey) {
        keyStatusBadge.className = 'status-badge connected';
        keyStatusText.textContent = 'Server Ready (API Key Active)';
      } else {
        keyStatusBadge.className = 'status-badge missing-key';
        keyStatusText.textContent = 'Setup needed: GEMINI_API_KEY missing in .env.local';
        showNotice(
          'GEMINI_API_KEY is not set in .env.local. Please open .env.local in your editor, add your API key, and restart or submit when ready.',
          'warning'
        );
      }
    } catch (err) {
      keyStatusBadge.className = 'status-badge error';
      keyStatusText.textContent = 'Server disconnected';
    }
  }

  checkServerStatus();

  // Clear button
  clearBtn.addEventListener('click', () => {
    situationInput.value = '';
    resultsCard.classList.add('hidden');
    hideNotice();
    situationInput.focus();
  });

  // Form submit
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const description = situationInput.value.trim();

    if (!description) {
      showNotice('Please enter a description of the flood situation first.', 'warning');
      return;
    }

    hideNotice();
    setLoading(true);

    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ description })
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || `Server error (${response.status})`);
      }

      displayAssessment(result);
    } catch (err) {
      showNotice(
        `Unable to complete assessment: ${err.message}`,
        'error'
      );
    } finally {
      setLoading(false);
    }
  });

  // Render assessment results
  function displayAssessment(data) {
    // 1. Plain-Language Summary
    summaryText.textContent = data.summary || 'No summary provided.';

    // 2. Critical Missing Details
    missingDetailsList.innerHTML = '';
    const missing = data.missingDetails || [];
    if (missing.length === 0) {
      const li = document.createElement('li');
      li.textContent = 'The description includes most immediate baseline details. Keep monitor of water rise and battery levels.';
      missingDetailsList.appendChild(li);
    } else {
      missing.forEach(item => {
        const li = document.createElement('li');
        li.textContent = item;
        missingDetailsList.appendChild(li);
      });
    }

    // 3. Suggested Next Steps (clearly labeled as suggestions)
    suggestedStepsList.innerHTML = '';
    const steps = data.suggestedNextSteps || [];
    if (steps.length === 0) {
      const li = document.createElement('li');
      li.innerHTML = '<strong>[Suggestion]</strong> Move to higher ground safely and monitor official emergency broadcasts.';
      suggestedStepsList.appendChild(li);
    } else {
      steps.forEach(step => {
        const li = document.createElement('li');
        // Ensure suggestion prefix is prominent
        const formatted = step.startsWith('[Suggestion') ? step : `[AI Suggestion] ${step}`;
        li.innerHTML = `<strong>${escapeHtml(formatted.slice(0, formatted.indexOf(']') + 1))}</strong> ${escapeHtml(formatted.slice(formatted.indexOf(']') + 1))}`;
        suggestedStepsList.appendChild(li);
      });
    }

    resultsCard.classList.remove('hidden');
    resultsCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // Copy assessment to clipboard
  copyBtn.addEventListener('click', () => {
    const summary = summaryText.textContent;
    const missing = Array.from(missingDetailsList.children).map(li => `- ${li.textContent}`).join('\n');
    const steps = Array.from(suggestedStepsList.children).map(li => `- ${li.textContent}`).join('\n');

    const formattedText = `=== FLOODREADY SITUATIONAL ASSESSMENT ===
[AI-Generated Suggestions - Unverified Information]

PLAIN-LANGUAGE SUMMARY:
${summary}

CRITICAL MISSING DETAILS:
${missing}

SUGGESTED NEXT STEPS (UNVERIFIED SUGGESTIONS):
${steps}

NOTICE: In an emergency, contact official local emergency dispatchers. Do not rely solely on AI.`;

    navigator.clipboard.writeText(formattedText).then(() => {
      const originalText = copyBtn.textContent;
      copyBtn.textContent = 'Copied!';
      setTimeout(() => { copyBtn.textContent = originalText; }, 2000);
    }).catch(() => {
      alert('Unable to copy to clipboard.');
    });
  });

  function setLoading(isLoading) {
    if (isLoading) {
      analyzeBtn.disabled = true;
      analyzeBtn.classList.add('btn-loading');
      analyzeBtn.querySelector('.btn-text').textContent = 'Analyzing with Gemini...';
    } else {
      analyzeBtn.disabled = false;
      analyzeBtn.classList.remove('btn-loading');
      analyzeBtn.querySelector('.btn-text').textContent = 'Analyze Situation with Gemini';
    }
  }

  function showNotice(message, type = 'warning') {
    serverNotice.textContent = message;
    serverNotice.className = `notice-box ${type}`;
    serverNotice.classList.remove('hidden');
  }

  function hideNotice() {
    serverNotice.classList.add('hidden');
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
});
