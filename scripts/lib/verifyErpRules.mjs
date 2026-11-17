// verifyErpRules.mjs — reads scripts/verify-erp.js's PIPELINE and run loop from source and
// checks the rules that keep the Audit Watch steps strict and lock-blocking. Used by
// scripts/verify-audit-watch.js; the "verify-erp rules" test in
// scripts/audit/audit-watch.test.mjs feeds it patched copies of verify-erp.js and checks
// that each rule refuses what it should, with that rule's own message.
// Throws an Error naming the broken rule; otherwise returns PIPELINE's steps as read.

import { parse as babelParse } from "@babel/parser";

const SKIP_KEYS = ["loc", "start", "end", "leadingComments", "trailingComments", "innerComments", "tokens", "comments", "extra"];
function walk(node, visit) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) { node.forEach((child) => walk(child, visit)); return; }
  if (typeof node.type === "string") visit(node);
  for (const key of Object.keys(node)) if (!SKIP_KEYS.includes(key)) walk(node[key], visit);
}


export function readVerifyErpPipeline(code) {
  const ast = babelParse(code, { sourceType: "module", plugins: ["jsx", "topLevelAwait"], tokens: true, allowReturnOutsideFunction: true });
  let pipeline = [];
  // Top-level declarations, `export const` included.
  const topLevel = ast.program.body.map((node) => (node.type === "ExportNamedDeclaration" ? node.declaration : node)).filter((node) => node?.type === "VariableDeclaration");
  const declarations = topLevel.filter((node) => node.declarations.some((item) => item.id?.name === "PIPELINE"));
  if (declarations.length !== 1 || declarations[0].kind !== "const") throw new Error("PIPELINE must be declared once, at top level, with const");
  const declarator = declarations[0].declarations.find((item) => item.id?.name === "PIPELINE");
  // Object.freeze([...]) around a plain array literal, so no step can be added, removed
  // or replaced at run time; the Audit Watch steps are frozen too (checked below).
  const isFreeze = (node) => node?.type === "CallExpression" && node.callee?.type === "MemberExpression" && !node.callee.computed && node.callee.object?.type === "Identifier" && node.callee.object.name === "Object" && node.callee.property?.name === "freeze" && node.arguments.length === 1;
  let objectShadowed = false;
  walk(ast.program, (node) => {
    if (["VariableDeclarator", "FunctionDeclaration", "ClassDeclaration", "ImportSpecifier", "ImportDefaultSpecifier", "ImportNamespaceSpecifier"].includes(node.type) && (node.id?.name === "Object" || node.local?.name === "Object")) objectShadowed = true;
    if (node.type === "AssignmentExpression" && /MemberExpression$/.test(node.left?.type) && node.left.object?.name === "Object") objectShadowed = true;
  });
  if (objectShadowed) throw new Error("Object is redefined or changed in scripts/verify-erp.js, so Object.freeze cannot be trusted");
  if (!isFreeze(declarator?.init) || declarator.init.arguments[0]?.type !== "ArrayExpression") throw new Error("PIPELINE must be Object.freeze([...]) around a plain array literal");
  const literal = declarator.init.arguments[0];
  // The top-level PIPELINE (not a local variable of the same name) is not reassigned,
  // written into, changed by a mutating array method or deleted from.
  // A local variable or parameter named PIPELINE hides the top-level one only inside its
  // own scope (the block or function that declares it).
  const withAncestors = (node, ancestors, visit) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) { node.forEach((child) => withAncestors(child, ancestors, visit)); return; }
    const isNode = typeof node.type === "string";
    if (isNode) visit(node, ancestors);
    const next = isNode ? [...ancestors, node] : ancestors;
    for (const key of Object.keys(node)) if (!SKIP_KEYS.includes(key)) withAncestors(node[key], next, visit);
  };
  const SCOPE = /^(BlockStatement|Program|ForStatement|ForOfStatement|ForInStatement|SwitchStatement|CatchClause)$|Function/;
  const shadowed = [];
  withAncestors(ast.program, [], (node, ancestors) => {
    if (node === declarator) return;
    if (node.type === "VariableDeclarator" && node.id?.type === "Identifier" && node.id.name === "PIPELINE") {
      const scope = [...ancestors].reverse().find((item) => SCOPE.test(item.type));
      if (scope) shadowed.push([scope.start, scope.end]);
    }
    if (/Function/.test(node.type) && (node.params || []).some((param) => param.type === "Identifier" && param.name === "PIPELINE")) shadowed.push([node.start, node.end]);
  });
  const isPipeline = (node) => node?.type === "Identifier" && node.name === "PIPELINE" && node !== declarator.id && !shadowed.some(([start, end]) => node.start >= start && node.end <= end);
  const MUTATING = new Set(["push", "pop", "shift", "unshift", "splice", "sort", "reverse", "fill", "copyWithin"]);
  const changes = [];
  walk(ast.program, (node) => {
    if (node.type === "AssignmentExpression" && (isPipeline(node.left) || (/MemberExpression$/.test(node.left?.type) && isPipeline(node.left.object)))) changes.push("an assignment");
    if (node.type === "UpdateExpression" && /MemberExpression$/.test(node.argument?.type) && isPipeline(node.argument.object)) changes.push("++/--");
    if (node.type === "UnaryExpression" && node.operator === "delete" && /MemberExpression$/.test(node.argument?.type) && isPipeline(node.argument.object)) changes.push("delete");
    if (node.type === "CallExpression" && /MemberExpression$/.test(node.callee?.type) && isPipeline(node.callee.object) && MUTATING.has(node.callee.property?.name ?? node.callee.property?.value)) changes.push(`.${node.callee.property?.name ?? node.callee.property?.value}()`);
  });
  if (changes.length) throw new Error(`PIPELINE is changed after its literal (${[...new Set(changes)].join(", ")})`);
  // How strictExitCode is reached: imported under its own name, or as a member of a
  // namespace import of the policy module; and never redefined.
  const policyImports = ast.program.body.filter((node) => node.type === "ImportDeclaration" && /(^|\/)masterVerificationPolicy\.js$/.test(node.source.value));
  const directImport = policyImports.some((node) => node.specifiers.some((spec) => spec.type === "ImportSpecifier" && spec.imported?.name === "strictExitCode" && spec.local?.name === "strictExitCode"));
  const namespaces = new Set(policyImports.flatMap((node) => node.specifiers.filter((spec) => spec.type === "ImportNamespaceSpecifier").map((spec) => spec.local.name)));
  let redefined = false;
  walk(ast.program, (node) => {
    if (["FunctionDeclaration", "VariableDeclarator", "ClassDeclaration"].includes(node.type) && node.id?.type === "Identifier" && (node.id.name === "strictExitCode" || namespaces.has(node.id.name))) redefined = true;
    if (node.type === "AssignmentExpression" && node.left?.type === "Identifier" && (node.left.name === "strictExitCode" || namespaces.has(node.left.name))) redefined = true;
    if (node.type === "AssignmentExpression" && /MemberExpression$/.test(node.left?.type) && namespaces.has(node.left.object?.name)) redefined = true;
  });
  if ((!directImport && namespaces.size === 0) || redefined) throw new Error("strictExitCode must be imported from scripts/lib/masterVerificationPolicy.js (by name or through `import * as`) and not redefined");
  // strictExitCode(step.name, code): two arguments, the first the step's name (step.name,
  // or a variable such as a destructured name), never a literal.
  const nameArg = (arg) => (/MemberExpression$/.test(arg?.type) && !arg.computed && arg.property?.name === "name") || arg?.type === "Identifier";
  const isStrictCall = (node) => node.type === "CallExpression" && node.arguments.length === 2 && nameArg(node.arguments[0]) && node.arguments[1] && node.arguments[1].type !== "SpreadElement" && !/Literal$/.test(node.arguments[1].type)
    && ((directImport && node.callee?.type === "Identifier" && node.callee.name === "strictExitCode")
      || (/MemberExpression$/.test(node.callee?.type) && !node.callee.computed && namespaces.has(node.callee.object?.name) && node.callee.property?.name === "strictExitCode"));
  // Top-level functions, so a strictExitCode call inside a helper the loop calls counts.
  const functions = new Map();
  for (const node of ast.program.body) {
    const declaration = node.type === "ExportNamedDeclaration" ? node.declaration : node;
    if (declaration?.type === "FunctionDeclaration" && declaration.id) functions.set(declaration.id.name, declaration);
    if (declaration?.type === "VariableDeclaration") declaration.declarations.forEach((item) => { if (item.id?.type === "Identifier" && /Function/.test(item.init?.type || "")) functions.set(item.id.name, item.init); });
  }
  const reaches = (body, test, seen = new Set()) => {
    let found = false;
    walk(body, (inner) => {
      if (found) return;
      if (test(inner)) { found = true; return; }
      if (inner.type === "CallExpression" && inner.callee?.type === "Identifier" && functions.has(inner.callee.name) && !seen.has(inner.callee.name)) {
        seen.add(inner.callee.name);
        if (reaches(functions.get(inner.callee.name).body, test, seen)) found = true;
      }
    });
    return found;
  };
  // The run loop is the loop over PIPELINE that runs the commands (it calls run(...)).
  // There must be exactly one, and it must apply strictExitCode to every step.
  const overPipeline = (node) => {
    if (node.type === "ForOfStatement") {
      const right = node.right;
      return isPipeline(right) || (right?.type === "CallExpression" && right.arguments.length === 0 && /MemberExpression$/.test(right.callee?.type) && !right.callee.computed && isPipeline(right.callee.object) && right.callee.property?.name === "entries");
    }
    if (node.type === "ForStatement") {
      let indexes = false;
      walk(node.body, (inner) => { if (/MemberExpression$/.test(inner.type) && inner.computed && isPipeline(inner.object)) indexes = true; });
      let bounded = false;
      walk(node.test, (inner) => { if (/MemberExpression$/.test(inner.type) && isPipeline(inner.object) && inner.property?.name === "length") bounded = true; });
      return indexes && bounded;
    }
    return false;
  };
  const callsRun = (inner) => inner.type === "CallExpression" && inner.callee?.type === "Identifier" && inner.callee.name === "run";
  const runLoops = [];
  walk(ast.program, (node) => { if (["ForOfStatement", "ForStatement"].includes(node.type) && reaches(node.body, callsRun)) runLoops.push(node); });
  // A loop inside the run loop (a retry, say), or inside a top-level helper the run loop
  // calls, is part of it, not a second run loop.
  const calledFrom = (body) => {
    const names = new Set();
    const visit = (node) => walk(node, (inner) => {
      if (inner.type === "CallExpression" && inner.callee?.type === "Identifier" && functions.has(inner.callee.name) && !names.has(inner.callee.name)) {
        names.add(inner.callee.name);
        visit(functions.get(inner.callee.name).body);
      }
    });
    visit(body);
    return [...names].map((name) => functions.get(name));
  };
  const outerRunLoops = runLoops.filter((loop) => !runLoops.some((other) => other !== loop
    && ((other.start <= loop.start && loop.end <= other.end)
      || calledFrom(other.body).some((fn) => fn.start <= loop.start && loop.end <= fn.end))));
  runLoops.length = 0;
  runLoops.push(...outerRunLoops);
  if (runLoops.length !== 1 || !overPipeline(runLoops[0])) throw new Error(`the commands must be run by exactly one loop over PIPELINE (found ${runLoops.length} loop(s) that call run(), ${runLoops.filter(overPipeline).length} over PIPELINE)`);
  if (!reaches(runLoops[0].body, isStrictCall)) throw new Error("the loop that runs PIPELINE does not apply strictExitCode(step.name, exitCode) to each step's exit code");
  // What runs is checked, not what is recorded. PIPELINE and the Audit Watch steps are
  // frozen, so if the run loop calls run(<step>.cmd) and run() hands its parameter
  // unchanged to execSync, the command executed is the one written in PIPELINE.
  const isIdentifierNamed = (node, name) => node?.type === "Identifier" && node.name === name;
  const bindsName = (root, name) => {
    let found = false;
    walk(root, (inner) => {
      if (inner.type === "VariableDeclarator") walk(inner.id, (part) => { if (isIdentifierNamed(part, name)) found = true; });
      if (/Function/.test(inner.type)) (inner.params || []).forEach((param) => walk(param, (part) => { if (isIdentifierNamed(part, name)) found = true; }));
      if (inner.type === "CatchClause" && inner.param) walk(inner.param, (part) => { if (isIdentifierNamed(part, name)) found = true; });
      if (/^(FunctionDeclaration|ClassDeclaration)$/.test(inner.type) && isIdentifierNamed(inner.id, name)) found = true;
    });
    return found;
  };
  const writesName = (root, name) => {
    let found = false;
    walk(root, (inner) => {
      if (inner.type === "AssignmentExpression") walk(inner.left, (part) => { if (isIdentifierNamed(part, name)) found = true; });
      if (inner.type === "UpdateExpression" && isIdentifierNamed(inner.argument, name)) found = true;
    });
    return found;
  };
  // 1. execSync is imported by name from child_process, which gives nothing else, and is
  //    never redefined.
  const childImports = ast.program.body.filter((node) => node.type === "ImportDeclaration" && /^(node:)?child_process$/.test(node.source.value));
  const childSpecifiers = childImports.flatMap((node) => node.specifiers);
  const execImported = childSpecifiers.length === 1 && childSpecifiers[0].type === "ImportSpecifier" && childSpecifiers[0].imported?.name === "execSync" && childSpecifiers[0].local?.name === "execSync";
  if (!execImported || bindsName(ast.program, "execSync") || writesName(ast.program, "execSync")) throw new Error("execSync must be the only import from child_process, under its own name, and never redefined");
  // 2. run(cmd): one top-level function. Its parameter is never reassigned, and its one
  //    execSync call takes that parameter unchanged, with plain options (no shell or env).
  const runFns = ast.program.body.map((node) => (node.type === "ExportNamedDeclaration" ? node.declaration : node)).filter((node) => node?.type === "FunctionDeclaration" && node.id?.name === "run");
  const runFn = runFns.length === 1 ? runFns[0] : null;
  const param = runFn?.params.length === 1 && runFn.params[0].type === "Identifier" ? runFn.params[0].name : null;
  const execCalls = [];
  if (runFn) walk(runFn.body, (inner) => { if (inner.type === "CallExpression" && isIdentifierNamed(inner.callee, "execSync")) execCalls.push(inner); });
  const OPTIONS = new Set(["cwd", "encoding", "timeout", "maxBuffer", "stdio", "windowsHide"]);
  const plainOptions = (node) => !node || (node.type === "ObjectExpression" && node.properties.every((item) => item.type === "ObjectProperty" && !item.computed && OPTIONS.has(item.key.name ?? item.key.value)));
  const runOk = runFn && param && !writesName(runFn.body, param) && !bindsName(runFn.body, param)
    && execCalls.length === 1 && execCalls[0].arguments.length <= 2 && isIdentifierNamed(execCalls[0].arguments[0], param) && plainOptions(execCalls[0].arguments[1]);
  if (!runOk) throw new Error(`run(cmd) must be one top-level function that passes its parameter unchanged to its one execSync call, with options limited to ${[...OPTIONS].join(", ")}`);
  // 3. run is used exactly once in the file: called inside the run loop as run(<step>.cmd),
  //    where <step> is the loop's const for each PIPELINE entry and nothing in the loop
  //    declares another variable of that name.
  const loop = runLoops[0];
  const runUses = [];
  withAncestors(ast.program, [], (node, ancestors) => {
    if (!isIdentifierNamed(node, "run") || node === runFn.id) return;
    const parent = ancestors[ancestors.length - 1];
    if ((parent?.type === "ObjectProperty" && parent.key === node && !parent.computed) || (/MemberExpression$/.test(parent?.type) && parent.property === node && !parent.computed)) return;
    runUses.push(parent?.type === "CallExpression" && parent.callee === node ? parent : node);
  });
  let runBindings = 0;
  walk(ast.program, (inner) => {
    if (inner.type === "VariableDeclarator") walk(inner.id, (part) => { if (isIdentifierNamed(part, "run")) runBindings += 1; });
    if (/Function/.test(inner.type)) (inner.params || []).forEach((item) => walk(item, (part) => { if (isIdentifierNamed(part, "run")) runBindings += 1; }));
    if (/^(FunctionDeclaration|ClassDeclaration)$/.test(inner.type) && isIdentifierNamed(inner.id, "run")) runBindings += 1;
  });
  if (runBindings !== 1 || writesName(ast.program, "run")) throw new Error("run must be declared once, as the top-level function, and never redefined");
  let stepName = null;
  let cmdName = null;
  let indexName = null;
  if (loop.type === "ForOfStatement" && loop.left?.type === "VariableDeclaration" && loop.left.kind === "const") {
    const id = loop.left.declarations[0]?.id;
    const element = id?.type === "ArrayPattern" && !isPipeline(loop.right) ? id.elements[1] : (isPipeline(loop.right) ? id : null);
    if (element?.type === "Identifier") stepName = element.name;
    // for (const { cmd } of PIPELINE): run(cmd), with no default value.
    const cmdProp = element?.type === "ObjectPattern" ? element.properties.find((item) => item.type === "ObjectProperty" && !item.computed && (item.key.name ?? item.key.value) === "cmd") : null;
    if (cmdProp?.value?.type === "Identifier") cmdName = cmdProp.value.name;
  }
  if (loop.type === "ForStatement" && loop.init?.type === "VariableDeclaration" && loop.init.declarations[0]?.id?.type === "Identifier") indexName = loop.init.declarations[0].id.name;
  const call = runUses[0];
  // A name declared again in the loop body, outside any nested function (the call cannot be
  // inside one), could stand between the loop's variable and the call.
  const rebound = (name) => {
    let found = false;
    withAncestors(loop.body, [], (node, ancestors) => {
      if (ancestors.some((item) => /Function/.test(item.type))) return;
      const bound = (target) => walk(target, (part) => { if (isIdentifierNamed(part, name)) found = true; });
      if (node.type === "VariableDeclarator") bound(node.id);
      if (node.type === "CatchClause" && node.param) bound(node.param);
      if (/^(FunctionDeclaration|ClassDeclaration)$/.test(node.type) && isIdentifierNamed(node.id, name)) found = true;
    });
    return found;
  };
  const arg = call?.type === "CallExpression" && call.arguments.length === 1 ? call.arguments[0] : null;
  const argOk = (cmdName && isIdentifierNamed(arg, cmdName) && !rebound(cmdName) && !writesName(loop.body, cmdName))
    || (/MemberExpression$/.test(arg?.type) && !arg.computed && arg.property?.name === "cmd"
      && ((stepName && isIdentifierNamed(arg.object, stepName) && !rebound(stepName) && !writesName(loop.body, stepName))
        || (indexName && /MemberExpression$/.test(arg.object?.type) && arg.object.computed && isPipeline(arg.object.object) && isIdentifierNamed(arg.object.property, indexName) && !writesName(loop.body, indexName) && !rebound(indexName))));
  let callInFunction = false;
  if (call) withAncestors(loop.body, [], (node, ancestors) => { if (node === call && ancestors.some((item) => /Function/.test(item.type))) callInFunction = true; });
  if (runUses.length !== 1 || !argOk || call.start < loop.body.start || call.end > loop.body.end || callInFunction) {
    throw new Error("run must be called exactly once, directly in the run loop, as run(step.cmd) for the loop's const step (or run(cmd) for `const { cmd }`, or run(PIPELINE[i].cmd) in an indexed loop)");
  }
  // 4. The lock gate reads the array from one evaluateMasterLockGate call.
  const gateCalls = [];
  walk(ast.program, (inner) => { if (inner.type === "CallExpression" && (isIdentifierNamed(inner.callee, "evaluateMasterLockGate") || (/MemberExpression$/.test(inner.callee?.type) && inner.callee.property?.name === "evaluateMasterLockGate"))) gateCalls.push(inner); });
  if (gateCalls.length !== 1) throw new Error(`there must be exactly one evaluateMasterLockGate call (found ${gateCalls.length})`);
  // The npm launcher: a top-level const, never reassigned, whose value is a conditional
  // giving "npm.cmd" or "npm" (the test itself, quotes, layout and its name do not
  // matter). Only such a name reads as "npm" inside a step's command.
  const reassigned = new Set();
  walk(ast.program, (node) => { if (node.type === "AssignmentExpression" && node.left?.type === "Identifier") reassigned.add(node.left.name); });
  const npmNames = new Set(topLevel.filter((node) => node.kind === "const").flatMap((node) => node.declarations).filter((item) => {
    const init = item.init;
    return item.id?.type === "Identifier" && !reassigned.has(item.id.name) && init?.type === "ConditionalExpression" && init.consequent?.type === "StringLiteral" && init.alternate?.type === "StringLiteral"
      && init.consequent.value === "npm.cmd" && init.alternate.value === "npm";
  }).map((item) => item.id.name));
  const valueOf = (node) => {
    if (!node) return undefined;
    if (["StringLiteral", "NumericLiteral", "BooleanLiteral"].includes(node.type)) return node.value;
    if (node.type === "ArrayExpression") return node.elements.map(valueOf);
    if (node.type === "TemplateLiteral") return node.quasis.map((quasi, i) => quasi.value.cooked + (node.expressions[i] ? (node.expressions[i].type === "Identifier" && npmNames.has(node.expressions[i].name) ? "npm" : "${?}") : "")).join("");
    return { unreadable: node.type };
  };
  // A spread, getter, method or computed key could hide what a step really is, so a step
  // that has one is unreadable; an Audit Watch step must be read in full.
  pipeline = literal.elements.map((wrapped) => {
    const element = isFreeze(wrapped) ? wrapped.arguments[0] : wrapped;
    if (element?.type !== "ObjectExpression") return { unreadable: element?.type || "hole", name: undefined };
    const plain = element.properties.every((prop) => prop.type === "ObjectProperty" && !prop.computed && ["Identifier", "StringLiteral"].includes(prop.key.type));
    const entries = element.properties.filter((prop) => prop.type === "ObjectProperty" && !prop.computed).map((prop) => [prop.key.name ?? prop.key.value, valueOf(prop.value)]);
    const keys = entries.map(([key]) => key);
    return { ...Object.fromEntries(entries), frozenStep: isFreeze(wrapped), ...(plain && new Set(keys).size === keys.length ? {} : { unreadable: "spread, getter, method, computed or repeated key" }) };
  });
  // Any step that names an Audit Watch step in some form must be readable.
  const hidden = literal.elements.filter((element, i) => pipeline[i].unreadable && /audit-watch/.test(code.slice(element?.start ?? 0, element?.end ?? 0)));
  if (hidden.length) throw new Error(`an Audit Watch step is not a plain object (${pipeline[literal.elements.indexOf(hidden[0])].unreadable})`);
  return pipeline;
}
