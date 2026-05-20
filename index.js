require('dotenv').config({ path: 'agent.env' });
const axios = require('axios');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function askBug() {
  return new Promise((resolve) => {
    console.log('Paste your full bug report. End input with a single line containing only EOF.');
    const lines = [];

    rl.on('line', (input) => {
      if (input.trim() === 'EOF') {
        rl.removeAllListeners('line');
        resolve(lines.join('\n'));
      } else {
        lines.push(input);
      }
    });

    rl.prompt();
  });
}

async function formatBugText(bugText) {
  if (!bugText.trim()) return { title: 'Bug Report', body: '' };

  try {
    const response = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: process.env.OPENROUTER_MODEL || 'google/gemini-2.0-flash-001',
        messages: [
          {
            role: 'system',
            content: 'You are a helpful assistant. Format the user\'s bug report into a structured JSON object with exactly three keys: "title", "body", and "severity". The "title" should be a concise summary that preserves critical keywords, feature names, and specific categories (e.g., "Accessibility"). The "body" must be well-structured. Extract the severity from the text if present (e.g., Major, Minor), otherwise set "severity" to null. Correct any spelling or grammar mistakes in the natural language parts of the report, but strictly preserve ALL technical data, code snippets, logs, and original details provided by the user without losing any information. Return ONLY valid JSON.'
          },
          {
            role: 'user',
            content: bugText
          }
        ],
        response_format: { type: 'json_object' },
        max_tokens: 2000
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    let content = response.data.choices[0].message.content.trim();
    // Extract the JSON object from the response more robustly
    const startIdx = content.indexOf('{');
    const endIdx = content.lastIndexOf('}');
    if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
      content = content.substring(startIdx, endIdx + 1);
    }

    return JSON.parse(content);
  } catch (error) {
    console.error('\n❌ AI Formatting failed, falling back to original data.', error.response?.data || error.message);
    // Fallback to avoid losing data if the API fails or returns invalid JSON
    const lines = bugText.split('\n');
    return {
      title: lines.find(line => line.trim())?.trim() || 'Bug Report',
      body: bugText,
      severity: null
    };
  }
}

function askSeverity() {
  return new Promise((resolve) => {
    const sevString = process.env.SEVERITY_OPTIONS || 'Major,Minor,Medium';
    const severities = sevString.split(',').map(s => s.trim()).filter(Boolean);
    
    console.log('\nSelect a severity for this bug:');
    severities.forEach((sev, index) => {
      console.log(`${index + 1}. ${sev}`);
    });
    console.log('0. Skip');

    rl.question('\nEnter severity number: ', (ans) => {
      const idx = parseInt(ans, 10);
      if (idx === 0) {
        resolve(null);
      } else if (!isNaN(idx) && severities[idx - 1]) {
        resolve(severities[idx - 1]);
      } else {
        console.log('Invalid selection, skipping severity.');
        resolve(null);
      }
    });
  });
}

function confirm() {
  return new Promise((resolve) => {
    rl.question('\nCreate GitHub issue? (yes/no): ', (ans) => {
      resolve(ans.toLowerCase() === 'yes');
    });
  });
}

function chooseRepo(repos) {
  return new Promise((resolve) => {
    if (!repos || repos.length === 0) {
      resolve(process.env.GITHUB_REPO);
      return;
    }
    if (repos.length === 1) {
      resolve(repos[0]);
      return;
    }

    console.log('\nSelect a repository to create the issue in:');
    repos.forEach((repo, index) => {
      console.log(`${index + 1}. ${repo}`);
    });

    rl.question('\nEnter repo number: ', (ans) => {
      const idx = parseInt(ans, 10) - 1;
      if (!isNaN(idx) && repos[idx]) {
        resolve(repos[idx]);
      } else {
        console.log('Invalid selection, using default repo.');
        resolve(process.env.GITHUB_REPO);
      }
    });
  });
}

async function createIssue(bugData, repo) {
  try {
    const res = await axios.post(
      `https://api.github.com/repos/${process.env.GITHUB_OWNER}/${repo}/issues`,
      {
        title: bugData.title || 'Bug Report',
        body: bugData.body
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github.v3+json',
          'X-GitHub-Api-Version': '2022-11-28'
        }
      }
    );

    console.log("\n✅ Issue Created:", res.data.html_url);
  } catch (error) {
    console.error('\n❌ Failed to create GitHub issue:', error.response?.data || error.message);
  }
}

(async () => {
  if (!process.env.OPENROUTER_API_KEY || !process.env.GITHUB_TOKEN || !process.env.GITHUB_OWNER) {
    console.error('\n❌ Error: Missing required environment variables. Please check your agent.env file.');
    console.error('Required: OPENROUTER_API_KEY, GITHUB_TOKEN, GITHUB_OWNER');
    process.exit(1);
  }

  const bug = await askBug();

  console.log("\n⏳ Formatting bug text via OpenRouter AI...\n");
  const finalBug = await formatBugText(bug);

  if (!finalBug.severity) {
    finalBug.severity = await askSeverity();
  }

  if (finalBug.severity) {
    finalBug.body = `**Severity:** ${finalBug.severity}\n\n` + finalBug.body;
  }

  console.log("=== Improved Bug ===\n");
  console.log(`Title: ${finalBug.title}\n`);
  console.log(finalBug.body);

  const repoString = process.env.GITHUB_REPO_OPTIONS || process.env.GITHUB_REPO;
  const repoList = repoString ? repoString.split(',').map((item) => item.trim()).filter(Boolean) : [];
  const selectedRepo = await chooseRepo(repoList);

  const ok = await confirm();

  if (ok) {
    await createIssue(finalBug, selectedRepo);
  } else {
    console.log('\nOperation cancelled.');
  }

  rl.close();
})();