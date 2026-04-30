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

function formatBugText(bugText) {
  const lines = bugText.replace(/\r\n/g, '\n').split('\n');
  if (lines.length === 0) {
    return '';
  }

  if (!/^\s*Title:/i.test(lines[0])) {
    lines[0] = `Title: ${lines[0]}`;
  }

  return lines.join('\n');
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

async function createIssue(content, repo) {
  const titleMatch = content.match(/^\s*Title:\s*(.+)$/im);
  const title = titleMatch ? titleMatch[1].trim() : content.split('\n').find((line) => line.trim())?.trim() || 'Bug Report';

  const res = await axios.post(
    `https://api.github.com/repos/${process.env.GITHUB_OWNER}/${repo}/issues`,
    {
      title: title,
      body: content
    },
    {
      headers: {
        Authorization: `token ${process.env.GITHUB_TOKEN}`,
      },
    }
  );

  console.log("\n✅ Issue Created:", res.data.html_url);
}

(async () => {
  const bug = await askBug();

  console.log("\n⏳ Formatting bug text...\n");
  const finalBug = formatBugText(bug);

  console.log("=== Improved Bug ===\n");
  console.log(finalBug);

  const repoString = process.env.GITHUB_REPO_OPTIONS || process.env.GITHUB_REPO;
  const repoList = repoString ? repoString.split(',').map((item) => item.trim()).filter(Boolean) : [];
  const selectedRepo = await chooseRepo(repoList);

  const ok = await confirm();

  if (ok) {
    await createIssue(finalBug, selectedRepo);
  } else {
    console.log("❌ Cancelled");
  }

  rl.close();
})();