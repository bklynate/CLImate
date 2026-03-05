import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { evaluate } from 'mathjs';

const calculateSchema = z.object({
  expression: z
    .string()
    .describe(
      'A mathematical expression to evaluate using mathjs. Supports: arithmetic (+, -, *, /, %), exponents (^), parentheses, unit conversions ("12.7 cm to inch"), trig ("sin(45 deg)"), constants (pi, e), and more. Examples: "82 - 44 - 22", "sqrt(144)", "round(100/3, 2)", "12.7 cm to inch", "sin(45 deg) ^ 2".'
    ),
  context: z
    .string()
    .nullable()
    .optional()
    .describe(
      'Brief explanation of what this calculation represents, e.g. "remaining games in 82-game NBA season given 44W + 22L"'
    ),
});

export const calculateTool = tool(
  async ({ expression, context }) => {
    try {
      const result = evaluate(expression);

      const output: Record<string, unknown> = {
        expression,
        result: typeof result === 'object' ? result.toString() : result,
      };

      if (context) {
        output.context = context;
      }

      return JSON.stringify(output, null, 2);
    } catch (error) {
      return JSON.stringify({
        error: true,
        expression,
        message: error instanceof Error ? error.message : String(error),
        hint: 'Check expression syntax. Supports: arithmetic, exponents (^), parentheses, unit conversions ("5 cm to inch"), trig ("sin(45 deg)"), constants (pi, e), and more. See mathjs docs for full reference.',
      }, null, 2);
    }
  },
  {
    name: 'calculate',
    description:
      'Evaluate a mathematical expression and return the numeric result. MUST be used whenever a response depends on any arithmetic, counting, percentages, unit conversions, or derived numbers — no matter how simple the math appears. Supports: basic arithmetic, exponents (^), parentheses, unit conversions ("12.7 cm to inch"), trigonometry ("sin(45 deg)"), constants (pi, e), and much more. Always use this tool instead of performing mental math.',
    schema: calculateSchema,
  }
);
