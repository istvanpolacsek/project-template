// PreToolUse(ExitPlanMode) hook: a plan can only be submitted with a complete "Task setup" section.
// Disable with PLAN_GATE=off. Unknown situations (no plan text found) never block.
import { deny, parseTaskSetup, readPlan, readStdin, validateTaskSetup } from './lib/ticket.mjs';

if (process.env.PLAN_GATE === 'off') process.exit(0);

const plan = readPlan(readStdin());
if (plan === null) process.exit(0);

const problems = validateTaskSetup(parseTaskSetup(plan));
if (problems.length) {
  deny(
    [
      'Plan not submitted: the Task setup section is incomplete.',
      ...problems.map((p) => `- ${p}`),
      'Add/fix the `## Task setup` section at the top of the plan file (shape: see the plan-mode task setup check) and call ExitPlanMode again.',
    ].join('\n'),
  );
}
