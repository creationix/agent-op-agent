(() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __moduleCache = /* @__PURE__ */ new WeakMap;
  var __toCommonJS = (from) => {
    var entry = __moduleCache.get(from), desc;
    if (entry)
      return entry;
    entry = __defProp({}, "__esModule", { value: true });
    if (from && typeof from === "object" || typeof from === "function")
      __getOwnPropNames(from).map((key) => !__hasOwnProp.call(entry, key) && __defProp(entry, key, {
        get: () => from[key],
        enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
      }));
    __moduleCache.set(from, entry);
    return entry;
  };
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, {
        get: all[name],
        enumerable: true,
        configurable: true,
        set: (newValue) => all[name] = () => newValue
      });
  };

  // compiler.ts
  var exports_compiler = {};
  __export(exports_compiler, {
    EncantisCompiler: () => EncantisCompiler
  });

  class EncantisCompiler {
    source;
    filename;
    pos = 0;
    line = 1;
    col = 1;
    tokens = [];
    current = 0;
    errors = [];
    functions = new Map;
    constructor(source, filename) {
      this.source = source;
      this.filename = filename;
    }
    tokenize() {
      while (this.pos < this.source.length) {
        this.skipWhitespaceAndComments();
        if (this.pos >= this.source.length)
          break;
        const start = { line: this.line, col: this.col };
        const ch = this.source[this.pos];
        if (/[0-9]/.test(ch)) {
          this.tokens.push(this.readNumber(start));
          continue;
        }
        if (/[a-zA-Z_]/.test(ch)) {
          this.tokens.push(this.readIdentifier(start));
          continue;
        }
        if (ch === '"') {
          this.tokens.push(this.readString(start));
          continue;
        }
        const twoChar = this.source.slice(this.pos, this.pos + 2);
        if (["->", "<=", ">=", "==", "!=", "&&", "||"].includes(twoChar)) {
          this.nextChar();
          this.nextChar();
          this.tokens.push({ type: "operator", value: twoChar, ...start });
          continue;
        }
        if ("+-*/%<>=!&|^~(){}[]:;,.".includes(ch)) {
          this.nextChar();
          this.tokens.push({ type: "operator", value: ch, ...start });
          continue;
        }
        this.error(`Unexpected character: ${ch}`, start);
        this.nextChar();
      }
      this.tokens.push({ type: "EOF", value: "", line: this.line, col: this.col });
      return this.tokens;
    }
    skipWhitespaceAndComments() {
      while (this.pos < this.source.length) {
        const ch = this.source[this.pos];
        if (ch === " " || ch === "\t" || ch === "\r") {
          this.nextChar();
        } else if (ch === `
`) {
          this.nextChar();
          this.line++;
          this.col = 1;
        } else if (this.source.slice(this.pos, this.pos + 2) === "--") {
          while (this.pos < this.source.length && this.source[this.pos] !== `
`) {
            this.nextChar();
          }
        } else {
          break;
        }
      }
    }
    nextChar() {
      this.pos++;
      this.col++;
    }
    readNumber(start) {
      let value = "";
      if (this.source[this.pos] === "0" && this.pos + 1 < this.source.length) {
        const next = this.source[this.pos + 1];
        if (next === "x" || next === "X") {
          value = "0x";
          this.nextChar();
          this.nextChar();
          while (/[0-9a-fA-F_]/.test(this.source[this.pos] || "")) {
            if (this.source[this.pos] !== "_")
              value += this.source[this.pos];
            this.nextChar();
          }
          return { type: "number", value: parseInt(value, 16), ...start };
        }
        if (next === "b" || next === "B") {
          this.nextChar();
          this.nextChar();
          while (/[01_]/.test(this.source[this.pos] || "")) {
            if (this.source[this.pos] !== "_")
              value += this.source[this.pos];
            this.nextChar();
          }
          return { type: "number", value: parseInt(value, 2), ...start };
        }
      }
      while (/[0-9_]/.test(this.source[this.pos] || "")) {
        if (this.source[this.pos] !== "_")
          value += this.source[this.pos];
        this.nextChar();
      }
      if (this.source[this.pos] === "." && /[0-9]/.test(this.source[this.pos + 1] || "")) {
        value += ".";
        this.nextChar();
        while (/[0-9_]/.test(this.source[this.pos] || "")) {
          if (this.source[this.pos] !== "_")
            value += this.source[this.pos];
          this.nextChar();
        }
        return { type: "number", value: parseFloat(value), ...start, float: true };
      }
      return { type: "number", value: parseInt(value, 10), ...start };
    }
    readIdentifier(start) {
      let value = "";
      while (/[a-zA-Z0-9_]/.test(this.source[this.pos] || "")) {
        value += this.source[this.pos];
        this.nextChar();
      }
      const keywords = ["func", "local", "var", "if", "else", "elif", "while", "do", "block", "loop", "end", "break", "continue", "export", "import", "memory", "return", "true", "false", "nil"];
      const types = ["i32", "u32", "i64", "u64", "f32", "f64", "i8", "i16", "u8", "u16", "bool", "void"];
      if (keywords.includes(value)) {
        return { type: "keyword", value, ...start };
      }
      if (types.includes(value)) {
        return { type: "type", value, ...start };
      }
      return { type: "identifier", value, ...start };
    }
    readString(start) {
      let value = "";
      this.nextChar();
      while (this.pos < this.source.length && this.source[this.pos] !== '"') {
        if (this.source[this.pos] === "\\" && this.pos + 1 < this.source.length) {
          this.nextChar();
          const esc = this.source[this.pos];
          if (esc === "n")
            value += `
`;
          else if (esc === "t")
            value += "\t";
          else if (esc === "r")
            value += "\r";
          else if (esc === "\\")
            value += "\\";
          else if (esc === '"')
            value += '"';
          else
            value += esc;
        } else {
          value += this.source[this.pos];
        }
        this.nextChar();
      }
      this.nextChar();
      return { type: "string", value, ...start };
    }
    parse() {
      const ast = { type: "module", functions: [], exports: [] };
      while (!this.isAtEnd()) {
        if (this.check("keyword", "export")) {
          this.advance();
          if (this.check("keyword", "func")) {
            const fn = this.parseFunction();
            fn.exported = true;
            ast.functions.push(fn);
            ast.exports.push(fn.name);
          }
        } else if (this.check("keyword", "func")) {
          ast.functions.push(this.parseFunction());
        } else {
          this.error(`Unexpected token: ${this.peek().value}`);
          this.advance();
        }
      }
      return ast;
    }
    parseFunction() {
      this.expect("keyword", "func");
      const name = this.expect("identifier").value;
      this.expect("operator", "(");
      const params = [];
      while (!this.check("operator", ")")) {
        const paramName = this.expect("identifier").value;
        this.expect("operator", ":");
        const paramType = this.parseType();
        params.push({ name: paramName, type: paramType });
        if (this.check("operator", ","))
          this.advance();
      }
      this.expect("operator", ")");
      let returnType = null;
      if (this.check("operator", "->")) {
        this.advance();
        returnType = this.parseType();
      }
      this.expect("operator", "{");
      const body = this.parseBlock();
      this.expect("operator", "}");
      this.functions.set(name, { params, returnType });
      return { type: "function", name, params, returnType, body };
    }
    parseType() {
      if (this.check("type")) {
        return this.advance().value;
      }
      if (this.check("identifier")) {
        return this.advance().value;
      }
      this.error("Expected type");
      return "i32";
    }
    parseBlock() {
      const statements = [];
      while (!this.check("operator", "}") && !this.isAtEnd()) {
        statements.push(this.parseStatement());
      }
      return { type: "block", statements };
    }
    parseStatement() {
      if (this.check("keyword", "local") || this.check("keyword", "var")) {
        return this.parseLocalDecl();
      }
      if (this.check("keyword", "if")) {
        return this.parseIf();
      }
      if (this.check("keyword", "while")) {
        return this.parseWhile();
      }
      if (this.check("keyword", "return")) {
        this.advance();
        const value = this.parseExpression();
        return { type: "return", value };
      }
      const expr = this.parseExpression();
      if (this.check("operator", "=") && expr.type === "identifier") {
        this.advance();
        const value = this.parseExpression();
        return { type: "assign", name: expr.name, value };
      }
      return { type: "expr", value: expr };
    }
    parseLocalDecl() {
      this.advance();
      const name = this.expect("identifier").value;
      let varType = "i32";
      if (this.check("operator", ":")) {
        this.advance();
        varType = this.parseType();
      }
      let init = null;
      if (this.check("operator", "=")) {
        this.advance();
        init = this.parseExpression();
      }
      return { type: "local", name, varType, init };
    }
    parseIf() {
      this.expect("keyword", "if");
      const condition = this.parseExpression();
      this.expect("operator", "{");
      const thenBlock = this.parseBlock();
      this.expect("operator", "}");
      let elseBlock = null;
      if (this.check("keyword", "else")) {
        this.advance();
        if (this.check("keyword", "if")) {
          elseBlock = { type: "block", statements: [this.parseIf()] };
        } else {
          this.expect("operator", "{");
          elseBlock = this.parseBlock();
          this.expect("operator", "}");
        }
      }
      return { type: "if", condition, thenBlock, elseBlock };
    }
    parseWhile() {
      this.expect("keyword", "while");
      const condition = this.parseExpression();
      this.expect("operator", "{");
      const body = this.parseBlock();
      this.expect("operator", "}");
      return { type: "while", condition, body };
    }
    parseExpression() {
      return this.parseOr();
    }
    parseOr() {
      let left = this.parseAnd();
      while (this.check("operator", "||")) {
        this.advance();
        const right = this.parseAnd();
        left = { type: "binary", op: "||", left, right };
      }
      return left;
    }
    parseAnd() {
      let left = this.parseEquality();
      while (this.check("operator", "&&")) {
        this.advance();
        const right = this.parseEquality();
        left = { type: "binary", op: "&&", left, right };
      }
      return left;
    }
    parseEquality() {
      let left = this.parseComparison();
      while (this.check("operator", "==") || this.check("operator", "!=")) {
        const op = this.advance().value;
        const right = this.parseComparison();
        left = { type: "binary", op, left, right };
      }
      return left;
    }
    parseComparison() {
      let left = this.parseAdditive();
      while (this.check("operator", "<") || this.check("operator", ">") || this.check("operator", "<=") || this.check("operator", ">=")) {
        const op = this.advance().value;
        const right = this.parseAdditive();
        left = { type: "binary", op, left, right };
      }
      return left;
    }
    parseAdditive() {
      let left = this.parseMultiplicative();
      while (this.check("operator", "+") || this.check("operator", "-")) {
        const op = this.advance().value;
        const right = this.parseMultiplicative();
        left = { type: "binary", op, left, right };
      }
      return left;
    }
    parseMultiplicative() {
      let left = this.parseUnary();
      while (this.check("operator", "*") || this.check("operator", "/") || this.check("operator", "%")) {
        const op = this.advance().value;
        const right = this.parseUnary();
        left = { type: "binary", op, left, right };
      }
      return left;
    }
    parseUnary() {
      if (this.check("operator", "-") || this.check("operator", "!")) {
        const op = this.advance().value;
        const operand = this.parseUnary();
        return { type: "unary", op, operand };
      }
      return this.parseCall();
    }
    parseCall() {
      let expr = this.parsePrimary();
      while (this.check("operator", "(")) {
        this.advance();
        const args = [];
        while (!this.check("operator", ")")) {
          args.push(this.parseExpression());
          if (this.check("operator", ","))
            this.advance();
        }
        this.expect("operator", ")");
        expr = { type: "call", callee: expr.name, args };
      }
      return expr;
    }
    parsePrimary() {
      if (this.check("number")) {
        const tok = this.advance();
        return { type: "number", value: tok.value, float: tok.float };
      }
      if (this.check("identifier")) {
        return { type: "identifier", name: this.advance().value };
      }
      if (this.check("keyword", "true")) {
        this.advance();
        return { type: "number", value: 1 };
      }
      if (this.check("keyword", "false")) {
        this.advance();
        return { type: "number", value: 0 };
      }
      if (this.check("operator", "(")) {
        this.advance();
        const expr = this.parseExpression();
        this.expect("operator", ")");
        return expr;
      }
      this.error(`Unexpected token in expression: ${this.peek().value}`);
      this.advance();
      return { type: "number", value: 0 };
    }
    peek() {
      return this.tokens[this.current];
    }
    isAtEnd() {
      return this.peek().type === "EOF";
    }
    check(type, value) {
      const tok = this.peek();
      if (value !== undefined)
        return tok.type === type && tok.value === value;
      return tok.type === type;
    }
    advance() {
      if (!this.isAtEnd())
        this.current++;
      return this.tokens[this.current - 1];
    }
    expect(type, value) {
      if (this.check(type, value))
        return this.advance();
      const tok = this.peek();
      this.error(`Expected ${value || type}, got ${tok.value}`);
      return tok;
    }
    error(msg, loc) {
      const location = loc || this.peek();
      this.errors.push(`${this.filename}:${location.line}:${location.col}: ${msg}`);
    }
    generate(ast) {
      let wat = `(module
`;
      for (const fn of ast.functions) {
        wat += this.genFunction(fn);
      }
      for (const name of ast.exports) {
        wat += `  (export "${name}" (func $${name}))
`;
      }
      wat += `)
`;
      return wat;
    }
    genFunction(fn) {
      let code = `  (func $${fn.name}`;
      for (const param of fn.params) {
        code += ` (param $${param.name} ${this.watType(param.type)})`;
      }
      if (fn.returnType) {
        code += ` (result ${this.watType(fn.returnType)})`;
      }
      code += `
`;
      const locals = this.collectLocals(fn.body);
      for (const [name, type] of locals) {
        code += `    (local $${name} ${this.watType(type)})
`;
      }
      code += this.genBlock(fn.body, fn.returnType, 2);
      code += `  )
`;
      return code;
    }
    collectLocals(block, locals = new Map) {
      for (const stmt of block.statements) {
        if (stmt.type === "local") {
          locals.set(stmt.name, stmt.varType);
        }
        if (stmt.type === "if") {
          this.collectLocals(stmt.thenBlock, locals);
          if (stmt.elseBlock)
            this.collectLocals(stmt.elseBlock, locals);
        }
        if (stmt.type === "while") {
          this.collectLocals(stmt.body, locals);
        }
      }
      return locals;
    }
    genBlock(block, returnType, indent) {
      let code = "";
      const stmts = block.statements;
      for (let i = 0;i < stmts.length; i++) {
        const stmt = stmts[i];
        const isLast = i === stmts.length - 1;
        code += this.genStatement(stmt, returnType, indent, isLast);
      }
      return code;
    }
    genStatement(stmt, returnType, indent, isLast) {
      const pad = "    ".repeat(indent);
      switch (stmt.type) {
        case "local": {
          let code = "";
          if (stmt.init) {
            code += this.genExpr(stmt.init, indent);
            code += `${pad}local.set $${stmt.name}
`;
          }
          return code;
        }
        case "assign": {
          let code = this.genExpr(stmt.value, indent);
          code += `${pad}local.set $${stmt.name}
`;
          return code;
        }
        case "return": {
          return this.genExpr(stmt.value, indent);
        }
        case "expr": {
          let code = this.genExpr(stmt.value, indent);
          if (!isLast || !returnType) {
            code += `${pad}drop
`;
          }
          return code;
        }
        case "if": {
          let code = this.genExpr(stmt.condition, indent);
          if (returnType && isLast) {
            code += `${pad}(if (result ${this.watType(returnType)})
`;
            code += `${pad}  (then
`;
            code += this.genBlock(stmt.thenBlock, returnType, indent + 2);
            code += `${pad}  )
`;
            if (stmt.elseBlock) {
              code += `${pad}  (else
`;
              code += this.genBlock(stmt.elseBlock, returnType, indent + 2);
              code += `${pad}  )
`;
            } else {
              code += `${pad}  (else
`;
              code += `${pad}    ${this.watType(returnType)}.const 0
`;
              code += `${pad}  )
`;
            }
            code += `${pad})
`;
          } else {
            code += `${pad}(if
`;
            code += `${pad}  (then
`;
            code += this.genBlock(stmt.thenBlock, null, indent + 2);
            code += `${pad}  )
`;
            if (stmt.elseBlock) {
              code += `${pad}  (else
`;
              code += this.genBlock(stmt.elseBlock, null, indent + 2);
              code += `${pad}  )
`;
            }
            code += `${pad})
`;
          }
          return code;
        }
        case "while": {
          let code = `${pad}(block $break
`;
          code += `${pad}  (loop $continue
`;
          code += this.genExpr(stmt.condition, indent + 2);
          code += `${pad}    i32.eqz
`;
          code += `${pad}    br_if $break
`;
          code += this.genBlock(stmt.body, null, indent + 2);
          code += `${pad}    br $continue
`;
          code += `${pad}  )
`;
          code += `${pad})
`;
          return code;
        }
      }
      return "";
    }
    genExpr(expr, indent) {
      const pad = "    ".repeat(indent);
      switch (expr.type) {
        case "number":
          if (expr.float) {
            return `${pad}f64.const ${expr.value}
`;
          }
          return `${pad}i32.const ${expr.value}
`;
        case "identifier":
          return `${pad}local.get $${expr.name}
`;
        case "binary": {
          let code = this.genExpr(expr.left, indent);
          code += this.genExpr(expr.right, indent);
          const ops = {
            "+": "i32.add",
            "-": "i32.sub",
            "*": "i32.mul",
            "/": "i32.div_s",
            "%": "i32.rem_s",
            "<": "i32.lt_s",
            ">": "i32.gt_s",
            "<=": "i32.le_s",
            ">=": "i32.ge_s",
            "==": "i32.eq",
            "!=": "i32.ne",
            "&&": "i32.and",
            "||": "i32.or"
          };
          code += `${pad}${ops[expr.op] || "i32.add"}
`;
          return code;
        }
        case "unary": {
          if (expr.op === "-") {
            let code = `${pad}i32.const 0
`;
            code += this.genExpr(expr.operand, indent);
            code += `${pad}i32.sub
`;
            return code;
          }
          if (expr.op === "!") {
            let code = this.genExpr(expr.operand, indent);
            code += `${pad}i32.eqz
`;
            return code;
          }
          return this.genExpr(expr.operand, indent);
        }
        case "call": {
          let code = "";
          for (const arg of expr.args) {
            code += this.genExpr(arg, indent);
          }
          code += `${pad}call $${expr.callee}
`;
          return code;
        }
      }
      return `${pad}i32.const 0
`;
    }
    watType(type) {
      const map = {
        i32: "i32",
        u32: "i32",
        i64: "i64",
        u64: "i64",
        f32: "f32",
        f64: "f64",
        bool: "i32",
        void: ""
      };
      return map[type] || "i32";
    }
    compile() {
      this.tokenize();
      if (this.errors.length > 0)
        return { wat: null, errors: this.errors };
      const ast = this.parse();
      if (this.errors.length > 0)
        return { wat: null, errors: this.errors };
      const wat = this.generate(ast);
      return { wat, errors: this.errors };
    }
  }
  if (__require.main == module) {
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
    const compiler = new EncantisCompiler(testCode, "test.ents");
    const result = compiler.compile();
    if (result.errors.length > 0) {
      console.error("Errors:", result.errors);
    } else {
      console.log("WAT Output:");
      console.log(result.wat);
    }
  }
})();
