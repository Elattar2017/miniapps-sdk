/**
 * Expression Engine - Safe expression evaluation using recursive descent parser
 * @module schema/ExpressionEngine
 *
 * Implements a formal EBNF grammar WITHOUT eval() or Function().
 * Safety: max 500 chars, max AST depth 10, max eval time 5ms.
 *
 * Grammar:
 * expression   -> ternary
 * ternary      -> logicalOr ('?' expression ':' expression)?
 * logicalOr    -> logicalAnd ('||' logicalAnd)*
 * logicalAnd   -> equality ('&&' equality)*
 * equality     -> comparison (('==' | '!=' | '===' | '!==') comparison)?
 * comparison   -> addition (('<' | '>' | '<=' | '>=') addition)?
 * addition     -> multiplication (('+' | '-') multiplication)*
 * multiplication -> unary (('*' | '/' | '%') unary)*
 * unary        -> ('!' | '-')? primary
 * primary      -> number | string | boolean | null | undefined
 *              |  memberAccess | '(' expression ')'
 * memberAccess -> identifier ('.' identifier | '[' expression ']' | '(' args? ')')*
 * args         -> expression (',' expression)*
 */

import { logger } from '../utils/logger';
import { isExpressionSafe } from '../utils/validation';
import { SDKError } from '../kernel/errors/SDKError';
import { EXPRESSION_LIMITS } from '../constants';
import type { PerformanceBudget } from '../kernel/telemetry/PerformanceBudget';

const exprLogger = logger.child({ component: 'ExpressionEngine' });

// ---------------------------------------------------------------------------
// Token types
// ---------------------------------------------------------------------------

type TokenType =
  | 'NUMBER'
  | 'STRING'
  | 'BOOLEAN'
  | 'NULL'
  | 'UNDEFINED'
  | 'IDENTIFIER'
  | 'OPERATOR'
  | 'LPAREN'
  | 'RPAREN'
  | 'LBRACKET'
  | 'RBRACKET'
  | 'DOT'
  | 'QUESTION'
  | 'COLON'
  | 'COMMA'
  | 'EOF';

interface Token {
  type: TokenType;
  value: string;
  position: number;
}

// ---------------------------------------------------------------------------
// Allowed method whitelist (safe methods on values)
// ---------------------------------------------------------------------------

const ALLOWED_METHODS: ReadonlySet<string> = new Set([
  'includes',
  'toString',
  'indexOf',
  'slice',
  'trim',
  'toUpperCase',
  'toLowerCase',
  'startsWith',
  'endsWith',
  'join',
  'map',
  'filter',
  'find',
  'some',
  'every',
  'concat',
  'flat',
  'reverse',
  'sort',
]);

const ALLOWED_PROPERTIES: ReadonlySet<string> = new Set([
  'length',
]);

// ---------------------------------------------------------------------------
// Tokenizer (Lexer)
// ---------------------------------------------------------------------------

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let pos = 0;

  while (pos < source.length) {
    const ch = source[pos];

    // Whitespace - skip
    if (/\s/.test(ch)) {
      pos++;
      continue;
    }

    // Numbers (integer or float)
    if (/\d/.test(ch) || (ch === '.' && pos + 1 < source.length && /\d/.test(source[pos + 1]))) {
      const start = pos;
      while (pos < source.length && /[\d.]/.test(source[pos])) {
        pos++;
      }
      tokens.push({ type: 'NUMBER', value: source.slice(start, pos), position: start });
      continue;
    }

    // Strings (single or double quoted)
    if (ch === '"' || ch === "'") {
      const quote = ch;
      const start = pos;
      pos++; // skip opening quote
      let str = '';
      while (pos < source.length && source[pos] !== quote) {
        if (source[pos] === '\\' && pos + 1 < source.length) {
          pos++; // skip backslash
          const escaped = source[pos];
          switch (escaped) {
            case 'n': str += '\n'; break;
            case 't': str += '\t'; break;
            case 'r': str += '\r'; break;
            case '\\': str += '\\'; break;
            default: str += escaped; break;
          }
        } else {
          str += source[pos];
        }
        pos++;
      }
      if (pos >= source.length) {
        throw SDKError.expression(`Unterminated string at position ${start}`);
      }
      pos++; // skip closing quote
      tokens.push({ type: 'STRING', value: str, position: start });
      continue;
    }

    // Identifiers, booleans, null, undefined
    if (/[a-zA-Z_$]/.test(ch)) {
      const start = pos;
      while (pos < source.length && /[a-zA-Z0-9_$]/.test(source[pos])) {
        pos++;
      }
      const word = source.slice(start, pos);

      if (word === 'true' || word === 'false') {
        tokens.push({ type: 'BOOLEAN', value: word, position: start });
      } else if (word === 'null') {
        tokens.push({ type: 'NULL', value: word, position: start });
      } else if (word === 'undefined') {
        tokens.push({ type: 'UNDEFINED', value: word, position: start });
      } else {
        tokens.push({ type: 'IDENTIFIER', value: word, position: start });
      }
      continue;
    }

    // Multi-character operators
    const remaining = source.slice(pos);

    // Three-character operators
    if (remaining.startsWith('===') || remaining.startsWith('!==')) {
      tokens.push({ type: 'OPERATOR', value: remaining.slice(0, 3), position: pos });
      pos += 3;
      continue;
    }

    // Two-character operators
    if (
      remaining.startsWith('==') ||
      remaining.startsWith('!=') ||
      remaining.startsWith('<=') ||
      remaining.startsWith('>=') ||
      remaining.startsWith('||') ||
      remaining.startsWith('&&')
    ) {
      tokens.push({ type: 'OPERATOR', value: remaining.slice(0, 2), position: pos });
      pos += 2;
      continue;
    }

    // Single-character operators and punctuation
    switch (ch) {
      case '+': case '-': case '*': case '/': case '%':
      case '<': case '>': case '!':
        tokens.push({ type: 'OPERATOR', value: ch, position: pos });
        pos++;
        continue;
      case '(':
        tokens.push({ type: 'LPAREN', value: ch, position: pos });
        pos++;
        continue;
      case ')':
        tokens.push({ type: 'RPAREN', value: ch, position: pos });
        pos++;
        continue;
      case '[':
        tokens.push({ type: 'LBRACKET', value: ch, position: pos });
        pos++;
        continue;
      case ']':
        tokens.push({ type: 'RBRACKET', value: ch, position: pos });
        pos++;
        continue;
      case '.':
        tokens.push({ type: 'DOT', value: ch, position: pos });
        pos++;
        continue;
      case '?':
        tokens.push({ type: 'QUESTION', value: ch, position: pos });
        pos++;
        continue;
      case ':':
        tokens.push({ type: 'COLON', value: ch, position: pos });
        pos++;
        continue;
      case ',':
        tokens.push({ type: 'COMMA', value: ch, position: pos });
        pos++;
        continue;
      default:
        throw SDKError.expression(`Unexpected character "${ch}" at position ${pos}`);
    }
  }

  tokens.push({ type: 'EOF', value: '', position: pos });
  return tokens;
}

// ---------------------------------------------------------------------------
// Parser + Evaluator (recursive descent, direct evaluation)
// ---------------------------------------------------------------------------

class Parser {
  private tokens: Token[];
  private pos: number;
  private context: Record<string, unknown>;
  private depth: number;
  private deadline: number;

  constructor(
    tokens: Token[],
    context: Record<string, unknown>,
    deadlineMs: number,
  ) {
    this.tokens = tokens;
    this.pos = 0;
    this.context = context;
    this.depth = 0;
    this.deadline = deadlineMs;
  }

  /** Entry point - parse full expression */
  parse(): unknown {
    const result = this.expression();
    if (this.current().type !== 'EOF') {
      throw SDKError.expression(
        `Unexpected token "${this.current().value}" at position ${this.current().position}`,
      );
    }
    return result;
  }

  // -----------------------------------------------------------------------
  // Grammar rules
  // -----------------------------------------------------------------------

  private expression(): unknown {
    this.checkDepthAndTime();
    return this.ternary();
  }

  private ternary(): unknown {
    const condition = this.logicalOr();
    if (this.match('QUESTION')) {
      const consequent = this.expression();
      this.expect('COLON', ':');
      const alternate = this.expression();
      return condition ? consequent : alternate;
    }
    return condition;
  }

  private logicalOr(): unknown {
    let left = this.logicalAnd();
    while (this.matchOperator('||')) {
      const right = this.logicalAnd();
      left = left || right;
    }
    return left;
  }

  private logicalAnd(): unknown {
    let left = this.equality();
    while (this.matchOperator('&&')) {
      const right = this.equality();
      left = left && right;
    }
    return left;
  }

  private equality(): unknown {
    let left = this.comparison();
    if (this.matchOperator('===')) {
      const right = this.comparison();
      return left === right;
    }
    if (this.matchOperator('!==')) {
      const right = this.comparison();
      return left !== right;
    }
    if (this.matchOperator('==')) {
      const right = this.comparison();
      // eslint-disable-next-line eqeqeq
      return left == right;
    }
    if (this.matchOperator('!=')) {
      const right = this.comparison();
      // eslint-disable-next-line eqeqeq
      return left != right;
    }
    return left;
  }

  private comparison(): unknown {
    const left = this.addition();
    if (this.matchOperator('<')) {
      return (left as number) < (this.addition() as number);
    }
    if (this.matchOperator('>')) {
      return (left as number) > (this.addition() as number);
    }
    if (this.matchOperator('<=')) {
      return (left as number) <= (this.addition() as number);
    }
    if (this.matchOperator('>=')) {
      return (left as number) >= (this.addition() as number);
    }
    return left;
  }

  private addition(): unknown {
    let left = this.multiplication();
    while (true) {
      if (this.matchOperator('+')) {
        const right = this.multiplication();
        left = (left as number) + (right as number);
      } else if (this.matchOperator('-')) {
        const right = this.multiplication();
        left = (left as number) - (right as number);
      } else {
        break;
      }
    }
    return left;
  }

  private multiplication(): unknown {
    let left = this.unary();
    while (true) {
      if (this.matchOperator('*')) {
        const right = this.unary();
        left = (left as number) * (right as number);
      } else if (this.matchOperator('/')) {
        const right = this.unary();
        if ((right as number) === 0) {
          throw SDKError.expression('Division by zero');
        }
        left = (left as number) / (right as number);
      } else if (this.matchOperator('%')) {
        const right = this.unary();
        if ((right as number) === 0) {
          throw SDKError.expression('Modulo by zero');
        }
        left = (left as number) % (right as number);
      } else {
        break;
      }
    }
    return left;
  }

  private unary(): unknown {
    if (this.matchOperator('!')) {
      return !this.unary();
    }
    if (this.matchOperator('-')) {
      return -(this.unary() as number);
    }
    return this.primary();
  }

  private primary(): unknown {
    this.checkDepthAndTime();

    const token = this.current();

    // Number literal
    if (token.type === 'NUMBER') {
      this.advance();
      return parseFloat(token.value);
    }

    // String literal
    if (token.type === 'STRING') {
      this.advance();
      return token.value;
    }

    // Boolean literal
    if (token.type === 'BOOLEAN') {
      this.advance();
      return token.value === 'true';
    }

    // null
    if (token.type === 'NULL') {
      this.advance();
      return null;
    }

    // undefined
    if (token.type === 'UNDEFINED') {
      this.advance();
      return undefined;
    }

    // Parenthesised expression
    if (token.type === 'LPAREN') {
      this.advance(); // skip '('
      this.depth++;
      const value = this.expression();
      this.depth--;
      this.expect('RPAREN', ')');
      return this.memberAccessTail(value);
    }

    // Identifier (variable access / member chain)
    if (token.type === 'IDENTIFIER') {
      return this.memberAccess();
    }

    throw SDKError.expression(
      `Unexpected token "${token.value}" (${token.type}) at position ${token.position}`,
    );
  }

  /**
   * memberAccess -> identifier ('.' identifier | '[' expression ']' | '(' args? ')')*
   */
  private memberAccess(): unknown {
    const token = this.current();
    this.advance();

    // Resolve the root identifier from context
    let value = this.resolveIdentifier(token.value);

    return this.memberAccessTail(value);
  }

  private memberAccessTail(value: unknown): unknown {
    while (true) {
      this.checkDepthAndTime();

      // Dot access: .identifier
      if (this.current().type === 'DOT') {
        this.advance(); // skip '.'
        const prop = this.current();
        if (prop.type !== 'IDENTIFIER') {
          throw SDKError.expression(
            `Expected property name after "." at position ${prop.position}`,
          );
        }
        this.advance();

        // Check for method call: .method(args)
        if (this.current().type === 'LPAREN') {
          value = this.methodCall(value, prop.value);
        } else {
          // Property access
          value = this.safePropertyAccess(value, prop.value);
        }
        continue;
      }

      // Direct function call: fn(args) — e.g. $t('key')
      if (this.current().type === 'LPAREN' && typeof value === 'function') {
        this.advance(); // skip '('
        this.depth++;

        const args: unknown[] = [];
        if (this.current().type !== 'RPAREN') {
          args.push(this.expression());
          while (this.current().type === 'COMMA') {
            this.advance(); // skip ','
            args.push(this.expression());
          }
        }

        this.depth--;
        this.expect('RPAREN', ')');

        value = (value as (...fnArgs: unknown[]) => unknown)(...args);
        continue;
      }

      // Bracket access: [expression]
      if (this.current().type === 'LBRACKET') {
        this.advance(); // skip '['
        this.depth++;
        const index = this.expression();
        this.depth--;
        this.expect('RBRACKET', ']');
        if (value == null) {
          value = undefined;
        } else {
          value = (value as Record<string, unknown>)[String(index)];
        }
        continue;
      }

      break;
    }

    return value;
  }

  /**
   * Parse and execute a method call: identifier.method(arg1, arg2, ...)
   */
  private methodCall(target: unknown, methodName: string): unknown {
    this.advance(); // skip '('
    this.depth++;

    // Parse arguments
    const args: unknown[] = [];
    if (this.current().type !== 'RPAREN') {
      args.push(this.expression());
      while (this.current().type === 'COMMA') {
        this.advance(); // skip ','
        args.push(this.expression());
      }
    }

    this.depth--;
    this.expect('RPAREN', ')');

    // Validate method is allowed
    if (!ALLOWED_METHODS.has(methodName)) {
      throw SDKError.expression(
        `Method "${methodName}" is not allowed. Allowed: ${[...ALLOWED_METHODS].join(', ')}`,
      );
    }

    if (target == null) {
      throw SDKError.expression(
        `Cannot call method "${methodName}" on ${target === null ? 'null' : 'undefined'}`,
      );
    }

    const method = (target as Record<string, unknown>)[methodName];
    if (typeof method !== 'function') {
      throw SDKError.expression(
        `"${methodName}" is not a function on the target value`,
      );
    }

    return (method as (...fnArgs: unknown[]) => unknown).call(target, ...args);
  }

  /**
   * Safely access a property, blocking prototype/constructor access.
   */
  private safePropertyAccess(target: unknown, property: string): unknown {
    // Block dangerous property access
    if (
      property === '__proto__' ||
      property === 'constructor' ||
      property === 'prototype'
    ) {
      throw SDKError.expression(
        `Access to "${property}" is forbidden for security reasons`,
      );
    }

    if (target == null) {
      return undefined;
    }

    // Allow .length and other whitelisted properties directly
    if (ALLOWED_PROPERTIES.has(property)) {
      return (target as Record<string, unknown>)[property];
    }

    // For plain objects and arrays, allow property access
    if (typeof target === 'object') {
      return (target as Record<string, unknown>)[property];
    }

    // For strings, allow .length
    if (typeof target === 'string' && property === 'length') {
      return target.length;
    }

    return undefined;
  }

  /**
   * Resolve a root identifier from the expression context.
   *
   * Supported prefixes:
   *   $data   -> context.data
   *   $state  -> context.state
   *   $user   -> context.user
   *   $item   -> context.item
   *   $index  -> context.index
   *   other   -> context[name]
   */
  private resolveIdentifier(name: string): unknown {
    // Context variable prefixes
    if (name.startsWith('$')) {
      // First check full name with $ (e.g. $t function in context)
      if (name in this.context) {
        return this.context[name];
      }
      // Then try stripped prefix (e.g. $data -> context.data)
      const contextKey = name.slice(1);
      if (contextKey in this.context) {
        return this.context[contextKey];
      }
      return undefined;
    }

    // Plain identifiers resolve from context root
    if (name in this.context) {
      return this.context[name];
    }

    return undefined;
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  private current(): Token {
    return this.tokens[this.pos] ?? { type: 'EOF', value: '', position: -1 };
  }

  private advance(): Token {
    const token = this.current();
    this.pos++;
    return token;
  }

  /** Match any token type and advance if matched */
  private match(type: TokenType): boolean {
    if (this.current().type === type) {
      this.advance();
      return true;
    }
    return false;
  }

  /** Match a specific operator value and advance if matched */
  private matchOperator(op: string): boolean {
    if (this.current().type === 'OPERATOR' && this.current().value === op) {
      this.advance();
      return true;
    }
    return false;
  }

  /** Expect a specific token type (and optionally value), or throw */
  private expect(type: TokenType, value?: string): Token {
    const token = this.current();
    if (token.type !== type || (value !== undefined && token.value !== value)) {
      throw SDKError.expression(
        `Expected "${value ?? type}" but found "${token.value}" (${token.type}) at position ${token.position}`,
      );
    }
    return this.advance();
  }

  /** Guard: depth and time limits */
  private checkDepthAndTime(): void {
    if (this.depth > EXPRESSION_LIMITS.MAX_AST_DEPTH) {
      throw SDKError.expression(
        `Expression exceeds maximum AST depth of ${EXPRESSION_LIMITS.MAX_AST_DEPTH}`,
      );
    }
    if (Date.now() > this.deadline) {
      throw SDKError.expression(
        `Expression evaluation exceeded time limit of ${EXPRESSION_LIMITS.MAX_EVAL_TIME_MS}ms`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// ExpressionEngine public API
// ---------------------------------------------------------------------------

export class ExpressionEngine {
  private readonly performanceBudget?: PerformanceBudget;
  private evaluationCount = 0;
  private totalEvalTimeMs = 0;

  constructor(performanceBudget?: PerformanceBudget) {
    this.performanceBudget = performanceBudget;
  }

  /**
   * Evaluate a single expression string against a context object.
   *
   * @param expression - Raw expression (may be wrapped in `${ ... }`)
   * @param context - Variables available to the expression ($data, $state, etc.)
   * @returns The evaluated result
   * @throws SDKError on safety violations or parse errors
   */
  evaluate(expression: string, context: Record<string, unknown>): unknown {
    if (typeof expression !== 'string' || expression.length === 0) {
      return expression;
    }

    // Strip `${ ... }` wrapper if present
    let source = expression;
    if (source.startsWith('${') && source.endsWith('}')) {
      source = source.slice(2, -1).trim();
    }

    if (source.length === 0) {
      return '';
    }

    // Safety pre-check (banned patterns, max length)
    const safety = isExpressionSafe(source);
    if (!safety.safe) {
      throw SDKError.expression(
        `Unsafe expression: ${safety.reason}`,
        { context: { expression: source } },
      );
    }

    const startTime = Date.now();
    try {
      // Tokenize
      const tokens = tokenize(source);

      // Parse & evaluate with a deadline
      const deadline = Date.now() + EXPRESSION_LIMITS.MAX_EVAL_TIME_MS;
      const parser = new Parser(tokens, context, deadline);

      const result = parser.parse();
      const durationMs = Date.now() - startTime;
      this.evaluationCount++;
      this.totalEvalTimeMs += durationMs;
      if (this.performanceBudget) {
        this.performanceBudget.recordTiming('expression_eval', durationMs);
      }
      return result;
    } catch (error: unknown) {
      const durationMs = Date.now() - startTime;
      this.evaluationCount++;
      this.totalEvalTimeMs += durationMs;
      if (this.performanceBudget) {
        this.performanceBudget.recordTiming('expression_eval', durationMs);
      }
      if (error instanceof SDKError) {
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      throw SDKError.expression(`Expression evaluation failed: ${message}`, {
        context: { expression: source },
      });
    }
  }

  /**
   * Validate an expression for syntax correctness without evaluating it.
   * Returns { valid: true } if the expression can be tokenized and parsed,
   * or { valid: false, error: string } if there is a syntax error or
   * safety violation (banned words).
   *
   * Runtime errors (undefined variable access) are NOT treated as invalid —
   * only structural/syntax issues.
   */
  validate(expression: string): { valid: boolean; error?: string } {
    if (typeof expression !== 'string' || expression.length === 0) {
      return { valid: true };
    }

    let source = expression;
    if (source.startsWith('${') && source.endsWith('}')) {
      source = source.slice(2, -1).trim();
    }

    if (source.length === 0) {
      return { valid: true };
    }

    // Safety pre-check (banned patterns, max length)
    const safety = isExpressionSafe(source);
    if (!safety.safe) {
      return { valid: false, error: `Unsafe expression: ${safety.reason}` };
    }

    try {
      // Tokenize
      const tokens = tokenize(source);
      // Parse with a dummy context and a generous deadline — we only care about syntax
      const deadline = Date.now() + 50;
      const parser = new Parser(tokens, {}, deadline);
      parser.parse();
      return { valid: true };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      // If the error is about undefined variable access, that's a runtime issue — still valid syntax
      if (message.includes('Undefined variable') || message.includes('Cannot read') || message.includes('not a function')) {
        return { valid: true };
      }
      return { valid: false, error: message };
    }
  }

  /**
   * Check whether a string value looks like an expression that needs evaluation.
   *
   * Returns true if the value:
   * - Is wrapped in `${ ... }`
   * - Starts with `$` (variable reference)
   */
  isExpression(value: string): boolean {
    if (typeof value !== 'string') return false;
    return (
      value.includes('${') ||
      value.startsWith('$')
    );
  }

  /**
   * Resolve all `${...}` template expressions within a text string,
   * replacing each with its evaluated value.
   *
   * @example
   * resolveExpressions('Hello ${$data.name}!', { data: { name: 'World' } })
   * // => 'Hello World!'
   */
  resolveExpressions(
    text: string,
    context: Record<string, unknown>,
  ): string {
    if (typeof text !== 'string') return String(text ?? '');

    // Pass 1: Replace all ${...} occurrences
    let result = text.replace(/\$\{([^}]+)\}/g, (_match, expr: string) => {
      try {
        const res = this.evaluate(expr.trim(), context);
        return res == null ? '' : String(res);
      } catch (error: unknown) {
        exprLogger.warn(`Failed to resolve expression "${expr}"`, {
          expression: expr,
          error: error instanceof Error ? error.message : String(error),
        });
        return '';
      }
    });

    // Pass 2: Replace bare $t('...') calls that weren't inside ${...}
    result = result.replace(/\$t\(([^)]+)\)/g, (_match, args: string) => {
      try {
        const res = this.evaluate(`$t(${args})`, context);
        return res == null ? '' : String(res);
      } catch {
        return _match;
      }
    });

    return result;
  }

  /**
   * Recursively resolve all expressions in an object tree.
   *
   * - String values starting with a dollar sign are evaluated as direct expressions.
   * - String values containing template markers are resolved as template expressions.
   * - Nested objects are recursed.
   * - Arrays are mapped element-by-element.
   * - Primitives (number, boolean, null, undefined) are preserved as-is.
   *
   * @returns A new object with all expressions resolved (input is not mutated).
   */
  resolveObjectExpressions(
    obj: Record<string, unknown>,
    context: Record<string, unknown>,
  ): Record<string, unknown> {
    if (obj == null || typeof obj !== 'object') return {};

    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = this.resolveValue(value, context);
    }
    return result;
  }

  private resolveValue(value: unknown, context: Record<string, unknown>): unknown {
    if (value === null || value === undefined) return value;

    if (typeof value === 'string') {
      // Direct expression: starts with dollar sign
      if (value.startsWith('$')) {
        try {
          return this.evaluate(value, context);
        } catch {
          return value; // Return original on error
        }
      }
      // Template expression: contains dollar-brace pattern
      if (value.includes('${')) {
        return this.resolveExpressions(value, context);
      }
      return value;
    }

    if (Array.isArray(value)) {
      return value.map(item => this.resolveValue(item, context));
    }

    if (typeof value === 'object') {
      return this.resolveObjectExpressions(value as Record<string, unknown>, context);
    }

    // numbers, booleans - preserve as-is
    return value;
  }

  /**
   * Get profiling statistics for expression evaluations.
   */
  getProfilingStats(): {
    evaluationCount: number;
    totalEvalTimeMs: number;
    averageEvalTimeMs: number;
  } {
    return {
      evaluationCount: this.evaluationCount,
      totalEvalTimeMs: this.totalEvalTimeMs,
      averageEvalTimeMs: this.evaluationCount > 0
        ? this.totalEvalTimeMs / this.evaluationCount
        : 0,
    };
  }

  /**
   * Reset profiling counters.
   */
  resetProfilingStats(): void {
    this.evaluationCount = 0;
    this.totalEvalTimeMs = 0;
  }
}
