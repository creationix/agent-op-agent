// Encantis Compiler - Subset to WAT
// Compiles a subset of Encantis language to WebAssembly Text format

interface Token {
  type: 'keyword' | 'identifier' | 'type' | 'number' | 'string' | 'operator' | 'EOF';
  value: string | number;
  line: number;
  col: number;
  float?: boolean;
}

interface ASTNode {
  type: string;
  [key: string]: any;
}

export class EncantisCompiler {
  private source: string;
  private filename: string;
  private pos = 0;
  private line = 1;
  private col = 1;
  private tokens: Token[] = [];
  private current = 0;
  errors: string[] = [];
  private functions = new Map<string, { params: Array<{name: string, type: string}>, returnType: string | null }>();

  constructor(source: string, filename: string) {
    this.source = source;
    this.filename = filename;
  }

  // ============ TOKENIZER ============

  tokenize(): Token[] {
    while (this.pos < this.source.length) {
      this.skipWhitespaceAndComments();
      if (this.pos >= this.source.length) break;

      const start = { line: this.line, col: this.col };
      const ch = this.source[this.pos];

      // Numbers
      if (/[0-9]/.test(ch)) {
        this.tokens.push(this.readNumber(start));
        continue;
      }

      // Identifiers and keywords
      if (/[a-zA-Z_]/.test(ch)) {
        this.tokens.push(this.readIdentifier(start));
        continue;
      }

      // Strings
      if (ch === '"') {
        this.tokens.push(this.readString(start));
        continue;
      }

      // Multi-char operators
      const twoChar = this.source.slice(this.pos, this.pos + 2);
      if (['->','<=','>=','==','!=','&&','||'].includes(twoChar)) {
        this.nextChar(); this.nextChar();
        this.tokens.push({ type: 'operator', value: twoChar, ...start });
        continue;
      }

      // Single-char tokens
      if ('+-*/%<>=!&|^~(){}[]:;,.'.includes(ch)) {
        this.nextChar();
        this.tokens.push({ type: 'operator', value: ch, ...start });
        continue;
      }

      this.error(`Unexpected character: ${ch}`, start);
      this.nextChar();
    }

    this.tokens.push({ type: 'EOF', value: '', line: this.line, col: this.col });
    return this.tokens;
  }

  private skipWhitespaceAndComments(): void {
    while (this.pos < this.source.length) {
      const ch = this.source[this.pos];
      if (ch === ' ' || ch === '\t' || ch === '\r') {
        this.nextChar();
      } else if (ch === '\n') {
        this.nextChar();
        this.line++;
        this.col = 1;
      } else if (this.source.slice(this.pos, this.pos + 2) === '--') {
        while (this.pos < this.source.length && this.source[this.pos] !== '\n') {
          this.nextChar();
        }
      } else {
        break;
      }
    }
  }

  private nextChar(): void {
    this.pos++;
    this.col++;
  }

  private readNumber(start: { line: number; col: number }): Token {
    let value = '';

    // Handle hex/binary
    if (this.source[this.pos] === '0' && this.pos + 1 < this.source.length) {
      const next = this.source[this.pos + 1];
      if (next === 'x' || next === 'X') {
        value = '0x';
        this.nextChar(); this.nextChar();
        while (/[0-9a-fA-F_]/.test(this.source[this.pos] || '')) {
          if (this.source[this.pos] !== '_') value += this.source[this.pos];
          this.nextChar();
        }
        return { type: 'number', value: parseInt(value, 16), ...start };
      }
      if (next === 'b' || next === 'B') {
        this.nextChar(); this.nextChar();
        while (/[01_]/.test(this.source[this.pos] || '')) {
          if (this.source[this.pos] !== '_') value += this.source[this.pos];
          this.nextChar();
        }
        return { type: 'number', value: parseInt(value, 2), ...start };
      }
    }

    while (/[0-9_]/.test(this.source[this.pos] || '')) {
      if (this.source[this.pos] !== '_') value += this.source[this.pos];
      this.nextChar();
    }

    // Float?
    if (this.source[this.pos] === '.' && /[0-9]/.test(this.source[this.pos + 1] || '')) {
      value += '.';
      this.nextChar();
      while (/[0-9_]/.test(this.source[this.pos] || '')) {
        if (this.source[this.pos] !== '_') value += this.source[this.pos];
        this.nextChar();
      }
      return { type: 'number', value: parseFloat(value), ...start, float: true };
    }

    return { type: 'number', value: parseInt(value, 10), ...start };
  }

  private readIdentifier(start: { line: number; col: number }): Token {
    let value = '';
    while (/[a-zA-Z0-9_]/.test(this.source[this.pos] || '')) {
      value += this.source[this.pos];
      this.nextChar();
    }

    const keywords = ['func','local','var','if','else','elif','while','do','block','loop','end','break','continue','export','import','memory','return','true','false','nil'];
    const types = ['i32','u32','i64','u64','f32','f64','i8','i16','u8','u16','bool','void'];

    if (keywords.includes(value)) {
      return { type: 'keyword', value, ...start };
    }
    if (types.includes(value)) {
      return { type: 'type', value, ...start };
    }
    return { type: 'identifier', value, ...start };
  }

  private readString(start: { line: number; col: number }): Token {
    let value = '';
    this.nextChar(); // skip opening quote
    while (this.pos < this.source.length && this.source[this.pos] !== '"') {
      if (this.source[this.pos] === '\\' && this.pos + 1 < this.source.length) {
        this.nextChar();
        const esc = this.source[this.pos];
        if (esc === 'n') value += '\n';
        else if (esc === 't') value += '\t';
        else if (esc === 'r') value += '\r';
        else if (esc === '\\') value += '\\';
        else if (esc === '"') value += '"';
        else value += esc;
      } else {
        value += this.source[this.pos];
      }
      this.nextChar();
    }
    this.nextChar(); // skip closing quote
    return { type: 'string', value, ...start };
  }

  // ============ PARSER ============

  parse(): ASTNode {
    const ast: ASTNode = { type: 'module', functions: [], exports: [] };

    while (!this.isAtEnd()) {
      if (this.check('keyword', 'export')) {
        this.advance();
        if (this.check('keyword', 'func')) {
          const fn = this.parseFunction();
          fn.exported = true;
          ast.functions.push(fn);
          ast.exports.push(fn.name);
        }
      } else if (this.check('keyword', 'func')) {
        ast.functions.push(this.parseFunction());
      } else {
        this.error(`Unexpected token: ${this.peek().value}`);
        this.advance();
      }
    }

    return ast;
  }

  private parseFunction(): ASTNode {
    this.expect('keyword', 'func');
    const name = this.expect('identifier').value as string;
    this.expect('operator', '(');

    const params: Array<{name: string, type: string}> = [];
    while (!this.check('operator', ')')) {
      const paramName = this.expect('identifier').value as string;
      this.expect('operator', ':');
      const paramType = this.parseType();
      params.push({ name: paramName, type: paramType });
      if (this.check('operator', ',')) this.advance();
    }
    this.expect('operator', ')');

    let returnType: string | null = null;
    if (this.check('operator', '->')) {
      this.advance();
      returnType = this.parseType();
    }

    this.expect('operator', '{');
    const body = this.parseBlock();
    this.expect('operator', '}');

    this.functions.set(name, { params, returnType });

    return { type: 'function', name, params, returnType, body };
  }

  private parseType(): string {
    if (this.check('type')) {
      return this.advance().value as string;
    }
    if (this.check('identifier')) {
      return this.advance().value as string;
    }
    this.error('Expected type');
    return 'i32';
  }

  private parseBlock(): ASTNode {
    const statements: ASTNode[] = [];
    while (!this.check('operator', '}') && !this.isAtEnd()) {
      statements.push(this.parseStatement());
    }
    return { type: 'block', statements };
  }

  private parseStatement(): ASTNode {
    if (this.check('keyword', 'local') || this.check('keyword', 'var')) {
      return this.parseLocalDecl();
    }
    if (this.check('keyword', 'if')) {
      return this.parseIf();
    }
    if (this.check('keyword', 'while')) {
      return this.parseWhile();
    }
    if (this.check('keyword', 'return')) {
      this.advance();
      const value = this.parseExpression();
      return { type: 'return', value };
    }

    // Expression statement (could be assignment or just expression)
    const expr = this.parseExpression();

    // Check for assignment
    if (this.check('operator', '=') && expr.type === 'identifier') {
      this.advance();
      const value = this.parseExpression();
      return { type: 'assign', name: expr.name, value };
    }

    return { type: 'expr', value: expr };
  }

  private parseLocalDecl(): ASTNode {
    this.advance(); // skip 'local' or 'var'
    const name = this.expect('identifier').value as string;

    let varType = 'i32';
    if (this.check('operator', ':')) {
      this.advance();
      varType = this.parseType();
    }

    let init: ASTNode | null = null;
    if (this.check('operator', '=')) {
      this.advance();
      init = this.parseExpression();
    }

    return { type: 'local', name, varType, init };
  }

  private parseIf(): ASTNode {
    this.expect('keyword', 'if');
    const condition = this.parseExpression();
    this.expect('operator', '{');
    const thenBlock = this.parseBlock();
    this.expect('operator', '}');

    let elseBlock: ASTNode | null = null;
    if (this.check('keyword', 'else')) {
      this.advance();
      if (this.check('keyword', 'if')) {
        elseBlock = { type: 'block', statements: [this.parseIf()] };
      } else {
        this.expect('operator', '{');
        elseBlock = this.parseBlock();
        this.expect('operator', '}');
      }
    }

    return { type: 'if', condition, thenBlock, elseBlock };
  }

  private parseWhile(): ASTNode {
    this.expect('keyword', 'while');
    const condition = this.parseExpression();
    this.expect('operator', '{');
    const body = this.parseBlock();
    this.expect('operator', '}');

    return { type: 'while', condition, body };
  }

  private parseExpression(): ASTNode {
    return this.parseOr();
  }

  private parseOr(): ASTNode {
    let left = this.parseAnd();
    while (this.check('operator', '||')) {
      this.advance();
      const right = this.parseAnd();
      left = { type: 'binary', op: '||', left, right };
    }
    return left;
  }

  private parseAnd(): ASTNode {
    let left = this.parseEquality();
    while (this.check('operator', '&&')) {
      this.advance();
      const right = this.parseEquality();
      left = { type: 'binary', op: '&&', left, right };
    }
    return left;
  }

  private parseEquality(): ASTNode {
    let left = this.parseComparison();
    while (this.check('operator', '==') || this.check('operator', '!=')) {
      const op = this.advance().value as string;
      const right = this.parseComparison();
      left = { type: 'binary', op, left, right };
    }
    return left;
  }

  private parseComparison(): ASTNode {
    let left = this.parseAdditive();
    while (this.check('operator', '<') || this.check('operator', '>') ||
           this.check('operator', '<=') || this.check('operator', '>=')) {
      const op = this.advance().value as string;
      const right = this.parseAdditive();
      left = { type: 'binary', op, left, right };
    }
    return left;
  }

  private parseAdditive(): ASTNode {
    let left = this.parseMultiplicative();
    while (this.check('operator', '+') || this.check('operator', '-')) {
      const op = this.advance().value as string;
      const right = this.parseMultiplicative();
      left = { type: 'binary', op, left, right };
    }
    return left;
  }

  private parseMultiplicative(): ASTNode {
    let left = this.parseUnary();
    while (this.check('operator', '*') || this.check('operator', '/') || this.check('operator', '%')) {
      const op = this.advance().value as string;
      const right = this.parseUnary();
      left = { type: 'binary', op, left, right };
    }
    return left;
  }

  private parseUnary(): ASTNode {
    if (this.check('operator', '-') || this.check('operator', '!')) {
      const op = this.advance().value as string;
      const operand = this.parseUnary();
      return { type: 'unary', op, operand };
    }
    return this.parseCall();
  }

  private parseCall(): ASTNode {
    let expr = this.parsePrimary();

    while (this.check('operator', '(')) {
      this.advance();
      const args: ASTNode[] = [];
      while (!this.check('operator', ')')) {
        args.push(this.parseExpression());
        if (this.check('operator', ',')) this.advance();
      }
      this.expect('operator', ')');
      expr = { type: 'call', callee: expr.name, args };
    }

    return expr;
  }

  private parsePrimary(): ASTNode {
    if (this.check('number')) {
      const tok = this.advance();
      return { type: 'number', value: tok.value, float: tok.float };
    }
    if (this.check('identifier')) {
      return { type: 'identifier', name: this.advance().value };
    }
    if (this.check('keyword', 'true')) {
      this.advance();
      return { type: 'number', value: 1 };
    }
    if (this.check('keyword', 'false')) {
      this.advance();
      return { type: 'number', value: 0 };
    }
    if (this.check('operator', '(')) {
      this.advance();
      const expr = this.parseExpression();
      this.expect('operator', ')');
      return expr;
    }

    this.error(`Unexpected token in expression: ${this.peek().value}`);
    this.advance();
    return { type: 'number', value: 0 };
  }

  // Parser helpers
  private peek(): Token { return this.tokens[this.current]; }
  private isAtEnd(): boolean { return this.peek().type === 'EOF'; }
  private check(type: string, value?: string | number): boolean {
    const tok = this.peek();
    if (value !== undefined) return tok.type === type && tok.value === value;
    return tok.type === type;
  }
  private advance(): Token {
    if (!this.isAtEnd()) this.current++;
    return this.tokens[this.current - 1];
  }
  private expect(type: string, value?: string | number): Token {
    if (this.check(type, value)) return this.advance();
    const tok = this.peek();
    this.error(`Expected ${value || type}, got ${tok.value}`);
    return tok;
  }

  private error(msg: string, loc?: { line: number; col: number }): void {
    const location = loc || this.peek();
    this.errors.push(`${this.filename}:${location.line}:${location.col}: ${msg}`);
  }

  // ============ CODE GENERATOR ============

  generate(ast: ASTNode): string {
    let wat = '(module\n';

    // Generate functions
    for (const fn of ast.functions) {
      wat += this.genFunction(fn);
    }

    // Generate exports
    for (const name of ast.exports) {
      wat += `  (export "${name}" (func $${name}))\n`;
    }

    wat += ')\n';
    return wat;
  }

  private genFunction(fn: ASTNode): string {
    let code = `  (func $${fn.name}`;

    // Parameters
    for (const param of fn.params) {
      code += ` (param $${param.name} ${this.watType(param.type)})`;
    }

    // Return type
    if (fn.returnType) {
      code += ` (result ${this.watType(fn.returnType)})`;
    }

    code += '\n';

    // Collect locals
    const locals = this.collectLocals(fn.body);
    for (const [name, type] of locals) {
      code += `    (local $${name} ${this.watType(type)})\n`;
    }

    // Generate body
    code += this.genBlock(fn.body, fn.returnType, 2);

    code += '  )\n';
    return code;
  }

  private collectLocals(block: ASTNode, locals = new Map<string, string>()): Map<string, string> {
    for (const stmt of block.statements) {
      if (stmt.type === 'local') {
        locals.set(stmt.name, stmt.varType);
      }
      if (stmt.type === 'if') {
        this.collectLocals(stmt.thenBlock, locals);
        if (stmt.elseBlock) this.collectLocals(stmt.elseBlock, locals);
      }
      if (stmt.type === 'while') {
        this.collectLocals(stmt.body, locals);
      }
    }
    return locals;
  }

  private genBlock(block: ASTNode, returnType: string | null, indent: number): string {
    let code = '';

    const stmts = block.statements;
    for (let i = 0; i < stmts.length; i++) {
      const stmt = stmts[i];
      const isLast = i === stmts.length - 1;
      code += this.genStatement(stmt, returnType, indent, isLast);
    }

    return code;
  }

  private genStatement(stmt: ASTNode, returnType: string | null, indent: number, isLast: boolean): string {
    const pad = '    '.repeat(indent);

    switch (stmt.type) {
      case 'local': {
        let code = '';
        if (stmt.init) {
          code += this.genExpr(stmt.init, indent);
          code += `${pad}local.set $${stmt.name}\n`;
        }
        return code;
      }

      case 'assign': {
        let code = this.genExpr(stmt.value, indent);
        code += `${pad}local.set $${stmt.name}\n`;
        return code;
      }

      case 'return': {
        return this.genExpr(stmt.value, indent);
      }

      case 'expr': {
        let code = this.genExpr(stmt.value, indent);
        // Drop result if not last statement with return type
        if (!isLast || !returnType) {
          code += `${pad}drop\n`;
        }
        return code;
      }

      case 'if': {
        let code = this.genExpr(stmt.condition, indent);

        if (returnType && isLast) {
          // If expression (returns value)
          code += `${pad}(if (result ${this.watType(returnType)})\n`;
          code += `${pad}  (then\n`;
          code += this.genBlock(stmt.thenBlock, returnType, indent + 2);
          code += `${pad}  )\n`;
          if (stmt.elseBlock) {
            code += `${pad}  (else\n`;
            code += this.genBlock(stmt.elseBlock, returnType, indent + 2);
            code += `${pad}  )\n`;
          } else {
            code += `${pad}  (else\n`;
            code += `${pad}    ${this.watType(returnType)}.const 0\n`;
            code += `${pad}  )\n`;
          }
          code += `${pad})\n`;
        } else {
          // If statement (no value)
          code += `${pad}(if\n`;
          code += `${pad}  (then\n`;
          code += this.genBlock(stmt.thenBlock, null, indent + 2);
          code += `${pad}  )\n`;
          if (stmt.elseBlock) {
            code += `${pad}  (else\n`;
            code += this.genBlock(stmt.elseBlock, null, indent + 2);
            code += `${pad}  )\n`;
          }
          code += `${pad})\n`;
        }
        return code;
      }

      case 'while': {
        let code = `${pad}(block $break\n`;
        code += `${pad}  (loop $continue\n`;
        code += this.genExpr(stmt.condition, indent + 2);
        code += `${pad}    i32.eqz\n`;
        code += `${pad}    br_if $break\n`;
        code += this.genBlock(stmt.body, null, indent + 2);
        code += `${pad}    br $continue\n`;
        code += `${pad}  )\n`;
        code += `${pad})\n`;
        return code;
      }
    }

    return '';
  }

  private genExpr(expr: ASTNode, indent: number): string {
    const pad = '    '.repeat(indent);

    switch (expr.type) {
      case 'number':
        if (expr.float) {
          return `${pad}f64.const ${expr.value}\n`;
        }
        return `${pad}i32.const ${expr.value}\n`;

      case 'identifier':
        return `${pad}local.get $${expr.name}\n`;

      case 'binary': {
        let code = this.genExpr(expr.left, indent);
        code += this.genExpr(expr.right, indent);

        const ops: Record<string, string> = {
          '+': 'i32.add', '-': 'i32.sub', '*': 'i32.mul',
          '/': 'i32.div_s', '%': 'i32.rem_s',
          '<': 'i32.lt_s', '>': 'i32.gt_s',
          '<=': 'i32.le_s', '>=': 'i32.ge_s',
          '==': 'i32.eq', '!=': 'i32.ne',
          '&&': 'i32.and', '||': 'i32.or'
        };

        code += `${pad}${ops[expr.op] || 'i32.add'}\n`;
        return code;
      }

      case 'unary': {
        if (expr.op === '-') {
          let code = `${pad}i32.const 0\n`;
          code += this.genExpr(expr.operand, indent);
          code += `${pad}i32.sub\n`;
          return code;
        }
        if (expr.op === '!') {
          let code = this.genExpr(expr.operand, indent);
          code += `${pad}i32.eqz\n`;
          return code;
        }
        return this.genExpr(expr.operand, indent);
      }

      case 'call': {
        let code = '';
        for (const arg of expr.args) {
          code += this.genExpr(arg, indent);
        }
        code += `${pad}call $${expr.callee}\n`;
        return code;
      }
    }

    return `${pad}i32.const 0\n`;
  }

  private watType(type: string): string {
    const map: Record<string, string> = {
      'i32': 'i32', 'u32': 'i32',
      'i64': 'i64', 'u64': 'i64',
      'f32': 'f32', 'f64': 'f64',
      'bool': 'i32', 'void': ''
    };
    return map[type] || 'i32';
  }

  // ============ COMPILE ============

  compile(): { wat: string | null; errors: string[] } {
    this.tokenize();
    if (this.errors.length > 0) return { wat: null, errors: this.errors };

    const ast = this.parse();
    if (this.errors.length > 0) return { wat: null, errors: this.errors };

    const wat = this.generate(ast);
    return { wat, errors: this.errors };
  }
}

// Test if run directly
if (import.meta.main) {
  const testCode = `-- Main program
func add(a:i32, b:i32) -> i32 {
  a + b
}

func factorial(n:i32) -> i32 {
  if n <= 1 {
    1
  } else {
    n * factorial(n - 1)
  }
}

export func main() -> i32 {
  local x:i32 = add(10, 20)
  local y:i32 = factorial(5)
  x + y
}`;

  const compiler = new EncantisCompiler(testCode, 'test.ents');
  const result = compiler.compile();

  if (result.errors.length > 0) {
    console.error('Errors:', result.errors);
  } else {
    console.log('WAT Output:');
    console.log(result.wat);
  }
}
