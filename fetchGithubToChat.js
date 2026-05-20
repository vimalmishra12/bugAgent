require('dotenv').config({ path: 'agent.env' });

const axios = require('axios');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function askIssueNumber() {
  return new Promise((resolve) => {
    rl.question('\nEnter GitHub Issue Number: ', (issueNumber) => {
      resolve(issueNumber.trim());
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

    console.log('\nSelect Repository:\n');

    repos.forEach((repo, index) => {
      console.log(`${index + 1}. ${repo}`);
    });

    rl.question('\nEnter repo number: ', (ans) => {

      const idx = parseInt(ans, 10) - 1;

      if (!isNaN(idx) && repos[idx]) {
        resolve(repos[idx]);
      } else {
        console.log('\nInvalid selection. Using default repo.');
        resolve(process.env.GITHUB_REPO);
      }
    });
  });
}

async function fetchGithubIssue(repo, issueNumber) {

  try {

    const response = await axios.get(
      `https://api.github.com/repos/${process.env.GITHUB_OWNER}/${repo}/issues/${issueNumber}`,
      {
        headers: {
          'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github.v3+json',
          'X-GitHub-Api-Version': '2022-11-28'
        }
      }
    );

    return response.data;

  } catch (error) {

    console.error(
      '\n❌ Failed to fetch issue:',
      error.response?.data || error.message
    );

    return null;
  }
}

async function analyzeIssue(issueData) {

  try {

    const prompt = `
You are a senior QA analyst.

Analyze this GitHub issue carefully.

TITLE:
${issueData.title}

DESCRIPTION:
${issueData.body}

Generate:

1. Requirement Summary
2. QA Test Scenarios
3. Edge Cases
4. Risks
5. Accessibility Concerns
6. Open Questions
`;

    const response = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: process.env.OPENROUTER_MODEL || 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: 'You are an expert QA analyst.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 2000
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    return response.data.choices[0].message.content;

  } catch (error) {

    console.error(
      '\n❌ AI Analysis failed:',
      error.response?.data || error.message
    );

    return null;
  }
}

(async () => {

  if (
    !process.env.OPENROUTER_API_KEY ||
    !process.env.GITHUB_TOKEN ||
    !process.env.GITHUB_OWNER
  ) {

    console.error('\n❌ Missing environment variables in agent.env');
    process.exit(1);
  }

  const repoString =
    process.env.GITHUB_REPO_OPTIONS || process.env.GITHUB_REPO;

  const repoList = repoString
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  const selectedRepo = await chooseRepo(repoList);

  const issueNumber = await askIssueNumber();

  console.log('\n⏳ Fetching GitHub issue...\n');

  const issueData = await fetchGithubIssue(
    selectedRepo,
    issueNumber
  );

  if (!issueData) {
    rl.close();
    return;
  }

  console.log('==============================');
  console.log('GITHUB ISSUE');
  console.log('==============================\n');

  console.log(`Title: ${issueData.title}\n`);

  console.log(issueData.body || 'No description.');

  console.log('\n⏳ Sending issue to AI for analysis...\n');

  const analysis = await analyzeIssue(issueData);

  console.log('==============================');
  console.log('AI ANALYSIS');
  console.log('==============================\n');

  console.log(analysis);

  rl.close();

})();