/**
 * NeuroDEX Skills Registry
 * Skills are reusable prompt templates that give the AI agent
 * specialized behaviors for common development tasks.
 * Triggered by slash commands: /commit, /review, /debug, etc.
 */

export interface Skill {
  id: string;
  name: string;
  description: string;
  category: SkillCategory;
  trigger: string; // slash command e.g. "commit"
  aliases?: string[];
  prompt: string; // System prompt injection
  inputRequired?: boolean;
  inputHint?: string;
  tags: string[];
}

export type SkillCategory =
  | 'git'
  | 'code'
  | 'debug'
  | 'test'
  | 'docs'
  | 'security'
  | 'devops'
  | 'review'
  | 'refactor'
  | 'ai'
  | 'system'
  | 'writing';

export const BUILTIN_SKILLS: Skill[] = [
  // ── GIT ──────────────────────────────────────────────────────────────────
  {
    id: 'commit', name: 'Smart Commit', category: 'git', trigger: 'commit',
    description: 'Analyze staged changes and create a well-formatted commit message',
    prompt: `Analyze the staged git changes using Bash("git diff --staged").
Create a commit message following Conventional Commits format:
- type(scope): short description (max 72 chars)
- Blank line
- Detailed explanation if needed
- List breaking changes with BREAKING CHANGE:
Types: feat, fix, docs, style, refactor, test, chore, perf, ci
Run: git commit -m "..." after confirming with user.`,
    tags: ['git', 'commit', 'conventional-commits']
  },
  {
    id: 'pr', name: 'Create PR', category: 'git', trigger: 'pr', aliases: ['pull-request'],
    description: 'Create a pull request with auto-generated description',
    prompt: `Create a GitHub Pull Request:
1. Run git log to see commits since branching from main
2. Run git diff main...HEAD to see all changes
3. Summarize changes into a PR title and description
4. Use gh pr create with a comprehensive body covering:
   - What changed and why
   - Testing done
   - Screenshots if UI changes
   - Breaking changes`,
    tags: ['git', 'github', 'pr']
  },
  {
    id: 'branch', name: 'Create Branch', category: 'git', trigger: 'branch',
    description: 'Create a properly named feature/fix/chore branch',
    prompt: `Create a new git branch with proper naming convention.
Ask the user what the branch is for, then:
- feature/description-kebab-case
- fix/issue-description
- chore/task-description
- hotfix/critical-fix
Run git checkout -b <branch-name>`,
    inputRequired: true, inputHint: 'Describe what the branch is for',
    tags: ['git', 'branch']
  },
  {
    id: 'log', name: 'Git Log', category: 'git', trigger: 'log',
    description: 'Show beautiful git history summary',
    prompt: `Show git history in a readable format:
Run: git log --oneline --graph --decorate -20
Then summarize the recent changes in plain language.`,
    tags: ['git', 'history']
  },
  {
    id: 'stash', name: 'Git Stash', category: 'git', trigger: 'stash',
    description: 'Intelligently stash or pop changes',
    prompt: `Help manage git stash. Check git status and stash list.
If there are uncommitted changes, stash them with a descriptive message.
If stash list has items, help the user choose which to pop.`,
    tags: ['git', 'stash']
  },

  // ── CODE ─────────────────────────────────────────────────────────────────
  {
    id: 'explain', name: 'Explain Code', category: 'code', trigger: 'explain',
    description: 'Explain what code does in plain language',
    prompt: `Explain the provided code clearly:
- What it does at a high level
- Key algorithms or patterns used
- Any potential issues or gotchas
- Dependencies and their purpose
Be concise but thorough. Use analogies for complex concepts.`,
    inputRequired: true, inputHint: 'Paste code or provide file path',
    tags: ['code', 'explain', 'learning']
  },
  {
    id: 'optimize', name: 'Optimize Code', category: 'code', trigger: 'optimize',
    description: 'Analyze and optimize code for performance',
    prompt: `Analyze the code for performance issues:
1. Profile bottlenecks (algorithmic complexity, memory, I/O)
2. Identify unnecessary re-renders/computations
3. Suggest specific optimizations with before/after examples
4. Measure impact when possible
Focus on real improvements, not premature optimization.`,
    tags: ['code', 'performance', 'optimization']
  },
  {
    id: 'types', name: 'Add Types', category: 'code', trigger: 'types',
    description: 'Add TypeScript types to JavaScript code',
    prompt: `Add proper TypeScript types to the code:
1. Infer types from usage and context
2. Use strict types (avoid 'any')
3. Add interfaces/types for complex objects
4. Add return types to all functions
5. Use generics where appropriate
Modify files using Edit tool.`,
    tags: ['typescript', 'types', 'code-quality']
  },
  {
    id: 'translate', name: 'Translate Language', category: 'code', trigger: 'translate',
    description: 'Translate code from one language to another',
    prompt: `Translate the provided code to the target language.
Preserve: logic, variable names (adapted to conventions), comments.
Adapt: idioms, standard library calls, patterns to target language style.
Ask for target language if not specified.`,
    inputRequired: true, inputHint: 'e.g. "translate this Python to TypeScript"',
    tags: ['translate', 'multilanguage']
  },

  // ── DEBUG ─────────────────────────────────────────────────────────────────
  {
    id: 'debug', name: 'Debug Issue', category: 'debug', trigger: 'debug',
    description: 'Systematically debug an error or unexpected behavior',
    prompt: `Debug the issue systematically:
1. Understand the error message and stack trace
2. Read relevant files to understand context
3. Identify the root cause (not just the symptom)
4. Propose a fix with explanation
5. Check for related issues
Never guess — read the actual code before suggesting fixes.`,
    tags: ['debug', 'error', 'fix']
  },
  {
    id: 'trace', name: 'Stack Trace', category: 'debug', trigger: 'trace',
    description: 'Analyze a stack trace and find the root cause',
    prompt: `Analyze the stack trace:
1. Find the originating error (often not the top frame)
2. Read the relevant source files at the error lines
3. Identify what condition triggered the error
4. Suggest the minimal fix
5. Check if there are related issues`,
    tags: ['debug', 'stack-trace', 'error']
  },
  {
    id: 'perf', name: 'Profile Performance', category: 'debug', trigger: 'perf',
    description: 'Find performance bottlenecks',
    prompt: `Analyze performance issues:
1. Run profiling commands if available (node --prof, py-spy, etc.)
2. Check for O(n²) loops, unnecessary re-computations
3. Look for missing indexes in database queries
4. Check network/I/O blocking patterns
5. Suggest specific fixes with expected improvement`,
    tags: ['performance', 'profiling', 'debug']
  },

  // ── TEST ──────────────────────────────────────────────────────────────────
  {
    id: 'test', name: 'Write Tests', category: 'test', trigger: 'test',
    description: 'Generate comprehensive tests for code',
    prompt: `Write tests for the provided code:
1. Identify the testing framework being used (jest, vitest, pytest, etc.)
2. Cover: happy path, edge cases, error cases, boundary conditions
3. Use descriptive test names that explain the scenario
4. Mock external dependencies appropriately
5. Aim for >80% coverage on critical paths
Write tests using Write/Edit tools.`,
    tags: ['test', 'tdd', 'quality']
  },
  {
    id: 'tdd', name: 'TDD Flow', category: 'test', trigger: 'tdd',
    description: 'Red-green-refactor TDD cycle',
    prompt: `Guide through Test-Driven Development:
1. Write a failing test first (Red)
2. Write minimal code to make it pass (Green)
3. Refactor for clarity and efficiency (Refactor)
4. Repeat for next requirement
Enforce: no production code without a failing test first.`,
    tags: ['tdd', 'test', 'methodology']
  },
  {
    id: 'coverage', name: 'Check Coverage', category: 'test', trigger: 'coverage',
    description: 'Analyze test coverage and add missing tests',
    prompt: `Analyze test coverage:
1. Run coverage command (jest --coverage, pytest --cov, etc.)
2. Identify uncovered code paths
3. Prioritize: critical paths > edge cases > error handling
4. Write tests for uncovered sections
Show coverage report and add tests using Write tool.`,
    tags: ['coverage', 'test', 'quality']
  },

  // ── REVIEW ────────────────────────────────────────────────────────────────
  {
    id: 'review', name: 'Code Review', category: 'review', trigger: 'review',
    description: 'Thorough code review with actionable feedback',
    prompt: `Perform a thorough code review:
Check for:
- Correctness: bugs, logic errors, off-by-ones
- Security: SQL injection, XSS, auth bypasses, secrets in code
- Performance: unnecessary complexity, N+1 queries
- Maintainability: naming, coupling, SOLID principles
- Error handling: missing try/catch, unhandled promises
- Tests: coverage, test quality
Give specific line-level feedback with severity (critical/major/minor).`,
    tags: ['review', 'quality', 'security']
  },
  {
    id: 'security-audit', name: 'Security Audit', category: 'security', trigger: 'security',
    description: 'Audit code for security vulnerabilities (OWASP Top 10)',
    prompt: `Security audit — check for OWASP Top 10 and common vulnerabilities:
1. SQL/NoSQL Injection
2. Broken Authentication
3. Sensitive Data Exposure (hardcoded secrets, unencrypted data)
4. XXE and XML issues
5. Broken Access Control
6. Security Misconfiguration
7. XSS (Cross-Site Scripting)
8. Insecure Deserialization
9. Known Vulnerable Components (check package.json/requirements.txt)
10. Insufficient Logging
For each finding: severity, location, remediation.`,
    tags: ['security', 'owasp', 'audit', 'vulnerabilities']
  },

  // ── REFACTOR ──────────────────────────────────────────────────────────────
  {
    id: 'refactor', name: 'Refactor', category: 'refactor', trigger: 'refactor',
    description: 'Refactor code for clarity and maintainability',
    prompt: `Refactor the code:
1. Extract repeated logic into functions
2. Improve naming for clarity
3. Reduce complexity (cyclomatic, cognitive)
4. Apply appropriate design patterns
5. Eliminate dead code
6. Ensure behavior is preserved
Make incremental changes, test after each step.`,
    tags: ['refactor', 'clean-code', 'maintainability']
  },
  {
    id: 'dry', name: 'DRY Code', category: 'refactor', trigger: 'dry',
    description: "Apply Don't Repeat Yourself principle",
    prompt: `Find and eliminate code duplication:
1. Search for similar code patterns using Grep
2. Extract common logic into shared functions/modules
3. Use generics/templates where appropriate
4. Ensure the abstraction is worth it (Rule of Three)
Modify files using Edit tool, preserve behavior.`,
    tags: ['dry', 'refactor', 'duplication']
  },

  // ── DOCS ──────────────────────────────────────────────────────────────────
  {
    id: 'docs', name: 'Write Docs', category: 'docs', trigger: 'docs',
    description: 'Generate documentation for code',
    prompt: `Write comprehensive documentation:
1. JSDoc/TSDoc for functions and classes
2. README.md if missing or outdated
3. API documentation for public interfaces
4. Usage examples
5. Architecture overview if complex
Match the existing documentation style.`,
    tags: ['docs', 'jsdoc', 'readme']
  },
  {
    id: 'readme', name: 'Update README', category: 'docs', trigger: 'readme',
    description: 'Create or update README.md',
    prompt: `Create/update README.md with:
1. Project name and description
2. Features list
3. Installation instructions
4. Usage examples (with code blocks)
5. Configuration options
6. API reference (if applicable)
7. Contributing guide
8. License
Read existing code to extract accurate information.`,
    tags: ['readme', 'docs', 'markdown']
  },
  {
    id: 'changelog', name: 'Update Changelog', category: 'docs', trigger: 'changelog',
    description: 'Generate CHANGELOG from git history',
    prompt: `Generate/update CHANGELOG.md:
1. Run git log since last tag/version
2. Group commits by type (feat, fix, docs, etc.)
3. Format as Keep a Changelog standard
4. Include breaking changes prominently
Write to CHANGELOG.md using Write tool.`,
    tags: ['changelog', 'docs', 'git']
  },

  // ── DEVOPS ────────────────────────────────────────────────────────────────
  {
    id: 'dockerfile', name: 'Write Dockerfile', category: 'devops', trigger: 'dockerfile',
    description: 'Create an optimized Dockerfile',
    prompt: `Create an optimized Dockerfile:
1. Read package.json or requirements to understand the app
2. Use appropriate base image (slim/alpine)
3. Multi-stage build for smaller images
4. Layer caching optimization (copy package.json first)
5. Non-root user for security
6. Health check
7. .dockerignore file
Write Dockerfile and .dockerignore using Write tool.`,
    tags: ['docker', 'devops', 'containerization']
  },
  {
    id: 'ci', name: 'Setup CI', category: 'devops', trigger: 'ci',
    description: 'Create GitHub Actions / CI pipeline',
    prompt: `Set up CI/CD pipeline:
1. Detect the project type and test framework
2. Create .github/workflows/ci.yml with:
   - Lint check
   - Type check
   - Test run with coverage
   - Build verification
3. Cache dependencies for speed
4. Matrix testing for multiple Node/Python versions if needed
Write workflow files using Write tool.`,
    tags: ['ci', 'github-actions', 'devops']
  },
  {
    id: 'deploy', name: 'Deploy Config', category: 'devops', trigger: 'deploy',
    description: 'Create deployment configuration',
    prompt: `Create deployment configuration. Ask the user for:
- Target platform (Vercel, Railway, Fly.io, AWS, GCP, etc.)
- Environment (production/staging)
Read project structure, then create appropriate config files.`,
    inputRequired: true, inputHint: 'Target platform and environment',
    tags: ['deploy', 'devops', 'hosting']
  },

  // ── SYSTEM ────────────────────────────────────────────────────────────────
  {
    id: 'scaffold', name: 'Scaffold Project', category: 'code', trigger: 'scaffold',
    description: 'Scaffold a new project or module structure',
    prompt: `Scaffold the project/module structure.
Ask for: project type, language, framework.
Create appropriate directory structure, config files, entry points.
Follow best practices for the chosen tech stack.`,
    inputRequired: true, inputHint: 'e.g. "React app with TypeScript and Vite"',
    tags: ['scaffold', 'boilerplate', 'setup']
  },
  {
    id: 'deps', name: 'Audit Dependencies', category: 'system', trigger: 'deps',
    description: 'Audit and update project dependencies',
    prompt: `Audit project dependencies:
1. Run npm audit / pip audit / cargo audit
2. Check for outdated packages (npm outdated)
3. Identify unused dependencies
4. Check license compatibility
5. Suggest updates with migration notes for breaking changes
Report findings and execute safe updates.`,
    tags: ['dependencies', 'audit', 'security', 'npm']
  },
  {
    id: 'env', name: 'Setup Environment', category: 'system', trigger: 'env',
    description: 'Create .env.example and validate environment',
    prompt: `Analyze environment variables usage:
1. Grep for process.env / os.environ / ENV usage
2. Create .env.example with all required variables (no values)
3. Create validation code to check required envs at startup
4. Add to README.md
Never commit actual .env values.`,
    tags: ['environment', 'config', 'setup']
  },
  {
    id: 'migrate', name: 'Database Migration', category: 'system', trigger: 'migrate',
    description: 'Create or analyze database migrations',
    prompt: `Help with database migrations:
1. Detect the ORM/migration tool (Prisma, Drizzle, Alembic, Flyway, etc.)
2. Analyze schema changes needed
3. Generate migration file
4. Check for data loss risks
5. Suggest rollback strategy
Always test migrations on a copy before production.`,
    tags: ['database', 'migration', 'sql']
  },

  // ── AI ────────────────────────────────────────────────────────────────────
  {
    id: 'prompt', name: 'Improve Prompt', category: 'ai', trigger: 'prompt',
    description: 'Improve an AI prompt for better results',
    prompt: `Improve the AI prompt:
1. Add clear role/context
2. Specify output format
3. Add constraints and requirements
4. Include examples (few-shot) if helpful
5. Break complex tasks into steps
6. Test the improved prompt mentally`,
    inputRequired: true, inputHint: 'Paste the prompt to improve',
    tags: ['ai', 'prompting', 'llm']
  },
  {
    id: 'agent', name: 'Design Agent', category: 'ai', trigger: 'agent',
    description: 'Design an AI agent architecture',
    prompt: `Design an AI agent for the described task:
1. Define the agent's goal and scope
2. List required tools/capabilities
3. Design the agent loop (observe → plan → act → reflect)
4. Handle failure and retry logic
5. Define success criteria
6. Suggest implementation with Claude Agent SDK`,
    inputRequired: true, inputHint: 'Describe what the agent should do',
    tags: ['ai', 'agent', 'architecture']
  },

  // ── WRITING ───────────────────────────────────────────────────────────────
  {
    id: 'standup', name: 'Daily Standup', category: 'writing', trigger: 'standup',
    description: 'Generate daily standup from git activity',
    prompt: `Generate daily standup report:
1. Run git log --since="24 hours ago" --author=$(git config user.email) --oneline
2. Summarize in standup format:
   - Yesterday: what was done
   - Today: what's planned (based on in-progress items)
   - Blockers: any issues to flag
Keep it brief and professional.`,
    tags: ['standup', 'writing', 'productivity']
  },
  {
    id: 'ticket', name: 'Write Ticket', category: 'writing', trigger: 'ticket',
    description: 'Write a detailed issue/ticket description',
    prompt: `Write a well-structured issue ticket:
1. Clear title (action + subject)
2. Problem statement
3. Acceptance criteria (checkboxes)
4. Technical notes if needed
5. Priority and labels suggestion
Format as GitHub issue markdown.`,
    inputRequired: true, inputHint: 'Describe the feature or bug',
    tags: ['ticket', 'issue', 'writing', 'planning']
  },

  // ── SPECIAL ───────────────────────────────────────────────────────────────
  {
    id: 'wtf', name: 'WTF is this?', category: 'code', trigger: 'wtf',
    description: 'Explain mysterious legacy code',
    prompt: `Explain this mysterious code in simple terms.
What does it do? Why might it have been written this way?
Is it safe? Should it be replaced?
Be honest about uncertainty. Check git blame/log for context.`,
    tags: ['explain', 'legacy', 'wtf']
  },
  {
    id: 'todo-finder', name: 'Find TODOs', category: 'code', trigger: 'todos',
    description: 'Find all TODOs and FIXMEs in the codebase',
    prompt: `Find all TODO, FIXME, HACK, XXX, DEPRECATED comments:
1. Use Grep to search recursively
2. Group by severity (FIXME > TODO > HACK)
3. Count per file
4. Suggest which ones to tackle first
5. Create a TodoWrite list of actionable items`,
    tags: ['todo', 'tech-debt', 'maintenance']
  },
  {
    id: 'size', name: 'Analyze Bundle Size', category: 'devops', trigger: 'bundle',
    description: 'Analyze and reduce bundle/build size',
    prompt: `Analyze build/bundle size:
1. Run build with analysis flag (webpack-bundle-analyzer, vite build --report)
2. Identify large dependencies
3. Find duplicate packages
4. Suggest: tree-shaking, dynamic imports, alternative lighter packages
5. Estimate savings for each suggestion`,
    tags: ['bundle', 'performance', 'optimization']
  },
];

export class SkillsRegistry {
  private skills: Map<string, Skill> = new Map();
  private customSkills: Skill[] = [];

  constructor() {
    for (const skill of BUILTIN_SKILLS) {
      this.skills.set(skill.id, skill);
      this.skills.set(skill.trigger, skill);
      for (const alias of skill.aliases ?? []) {
        this.skills.set(alias, skill);
      }
    }
  }

  find(triggerOrId: string): Skill | undefined {
    return this.skills.get(triggerOrId.toLowerCase().replace(/^\//, ''));
  }

  listAll(): Skill[] {
    const seen = new Set<string>();
    return [...BUILTIN_SKILLS, ...this.customSkills].filter(s => {
      if (seen.has(s.id)) return false;
      seen.add(s.id);
      return true;
    });
  }

  listByCategory(category: SkillCategory): Skill[] {
    return this.listAll().filter(s => s.category === category);
  }

  getCategories(): SkillCategory[] {
    return [...new Set(this.listAll().map(s => s.category))];
  }

  addCustomSkill(skill: Skill): void {
    this.customSkills.push(skill);
    this.skills.set(skill.id, skill);
    this.skills.set(skill.trigger, skill);
  }

  buildSystemPrompt(skill: Skill, userInput?: string): string {
    return `${skill.prompt}${userInput ? `\n\nUser request: ${userInput}` : ''}`;
  }
}

export const skillsRegistry = new SkillsRegistry();
