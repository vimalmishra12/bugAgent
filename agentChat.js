require('dotenv').config({ path: 'agent.env' });

const axios = require('axios');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const messages = [
  {
    role: 'system',
    content: `
You are an expert QA Analyst and Requirement Understanding Assistant.

Your responsibilities:
- Understand software requirements deeply
- Generate QA test scenarios
- Generate edge cases
- Generate accessibility test cases
- Identify risks
- Identify regression impact
- Answer follow-up questions
- Maintain conversation context
`
  }
];

function ask(question) {

  return new Promise((resolve) => {
    rl.question(question, resolve);
  });
}

async function chooseRepo(repos) {

  if (!repos || repos.length === 0) {
    return process.env.GITHUB_REPO;
  }

  if (repos.length === 1) {
    return repos[0];
  }

  console.log('\nSelect Repository:\n');

  repos.forEach((repo, index) => {
    console.log(`${index + 1}. ${repo}`);
  });

  const ans = await ask('\nEnter repo number: ');

  const idx = parseInt(ans, 10) - 1;

  if (!isNaN(idx) && repos[idx]) {
    return repos[idx];
  }

  console.log('\nInvalid selection. Using default repo.');

  return process.env.GITHUB_REPO;
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
      '\n❌ Failed to fetch GitHub issue:',
      error.response?.data || error.message
    );

    return null;
  }
}

async function callAI() {

  try {

    const response = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: process.env.OPENROUTER_MODEL || 'google/gemini-2.5-flash',
        messages,
        max_tokens: 2000
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const aiMessage =
      response.data.choices[0].message.content;

    messages.push({
      role: 'assistant',
      content: aiMessage
    });

    return aiMessage;

  } catch (error) {

    console.error(
      '\n❌ AI request failed:',
      error.response?.data || error.message
    );

    return null;
  }
}

async function startAgentChat() {

  console.log('\n===================================');
  console.log('AI Requirement Understanding Agent');
  console.log('===================================\n');

  if (
    !process.env.OPENROUTER_API_KEY ||
    !process.env.GITHUB_TOKEN ||
    !process.env.GITHUB_OWNER
  ) {

    console.error(
      '\n❌ Missing required variables in agent.env'
    );

    process.exit(1);
  }

  const repoString =
    process.env.GITHUB_REPO_OPTIONS ||
    process.env.GITHUB_REPO;

  const repoList = repoString
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  const selectedRepo = await chooseRepo(repoList);

  const issueNumber = await ask(
    '\nEnter GitHub Issue Number: '
  );

  console.log('\n⏳ Fetching GitHub issue...\n');

  const issueData = await fetchGithubIssue(
    selectedRepo,
    issueNumber
  );

  if (!issueData) {
    rl.close();
    return;
  }

  console.log('✅ Issue fetched successfully.\n');

  console.log('===================================');
  console.log('GITHUB ISSUE');
  console.log('===================================\n');

  console.log(`TITLE:\n${issueData.title}\n`);

  console.log('DESCRIPTION:\n');

  console.log(issueData.body || 'No description.');

  const issueContext = `
GITHUB ISSUE DETAILS

TITLE:
${issueData.title}

DESCRIPTION:
${issueData.body || 'No description available'}

STATE:
${issueData.state}

ISSUE URL:
${issueData.html_url}

Please deeply understand this requirement.
All future questions will be related to this issue.
`;

  messages.push({
    role: 'user',
    content: issueContext
  });

  messages.push({
    role: 'user',
    content: `
Please analyze this requirement and provide:

1. Requirement Summary
2. QA Test Scenarios
3. Edge Cases
4. Accessibility Concerns
5. Regression Risk Areas
6. Open Questions
`
  });

  console.log('\n⏳ AI Generating Initial Analysis...\n');

  const initialReply = await callAI();

  if (initialReply) {

    console.log('===================================');
    console.log('AI INITIAL ANALYSIS');
    console.log('===================================\n');

    console.log(initialReply);
  }

  console.log('\n===================================');
  console.log('INTERACTIVE AI CHAT STARTED');
  console.log('===================================\n');

  console.log('Examples:');
  console.log('- Generate regression checklist');
  console.log('- Give accessibility test cases');
  console.log('- What APIs may be impacted?');
  console.log('- Generate negative scenarios');
  console.log('- Create dev subtasks');
  console.log('\nType "exit" to quit.\n');

  while (true) {

    const userInput = await ask('\nYou: ');

    if (
      userInput.trim().toLowerCase() === 'exit'
    ) {
      break;
    }

    if (!userInput.trim()) {
      continue;
    }

    messages.push({
      role: 'user',
      content: userInput
    });

    console.log('\n⏳ AI Thinking...\n');

    const aiReply = await callAI();

    if (aiReply) {

      console.log('\nAI:\n');

      console.log(aiReply);
    }
  }

  console.log('\n👋 Closing AI Requirement Agent...\n');

  rl.close();
}

startAgentChat();