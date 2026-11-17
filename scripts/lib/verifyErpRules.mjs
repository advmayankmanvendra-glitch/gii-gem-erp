// verifyErpRules.mjs — reads scripts/verify-erp.js's PIPELINE and run loop from source and
// checks the rules that keep the Audit Watch steps strict and lock-blocking. Used by
// scripts/verify-audit-watch.js; scripts/audit/verify-erp-rules.test.mjs feeds it patched
// copies of verify-erp.js to show that each rule refuses what it should.
// Throws an Error naming the broken rule; otherwise returns PIPELINE's steps as read.

import { parse as babelParse } from "@babel/parser";

const SKIP_KEYS = ["loc", "start", "end", "leadingComments", "trailingComments", "innerComments", "tokens", "comments", "extra"];
function walk(node, visit) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) { node.forEach((child) => walk(child, visit)); return; }
  if (typeof node.type === "string") visit(node);
  for (const key of Object.keys(node)) if (!SKIP_KEYS.includes(key)) walk(node[key], visit);
}

// Each VariableDeclarator under a node, with its declaration's kind (const, let or var).
function* declarationKinds(root) {
  const found = [];
  walk(root, (node) => { if (node.type === "VariableDeclaration") node.declarations.forEach((item) => found.push([item, node.kind])); });
  yield* found;
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
  const SKIP = ["loc", "start", "end", "leadingComments", "trailingComments", "innerComments", "tokens", "comments", "extra"];
  const withAncestors = (node, ancestors, visit) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) { node.forEach((child) => withAncestors(child, ancestors, visit)); return; }
    const isNode = typeof node.type === "string";
    if (isNode) visit(node, ancestors);
    const next = isNode ? [...ancestors, node] : ancestors;
    for (const key of Object.keys(node)) if (!SKIP.includes(key)) withAncestors(node[key], next, visit);
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
  // The lock gate checks the command each strict step really ran: run(cmd) must return
  // it as `cmd` from every return, and the step recorded in the run loop must carry
  // that value (result.cmd), not re-read the step's own cmd.
  const runFns = ast.program.body.map((node) => (node.type === "ExportNamedDeclaration" ? node.declaration : node)).filter((node) => node?.type === "FunctionDeclaration" && node.id?.name === "run");
  const runFn = runFns.length === 1 ? runFns[0] : null;
  const param = runFn?.params[0]?.type === "Identifier" ? runFn.params[0].name : null;
  let returnsCmd = Boolean(param);
  let paramReassigned = false;
  let returnCount = 0;
  // Returns of run() itself; returns inside nested functions (callbacks) belong to them.
  const nested = [];
  if (runFn) walk(runFn.body, (inner) => { if (/Function/.test(inner.type)) nested.push([inner.start, inner.end]); });
  if (runFn) walk(runFn.body, (inner) => {
    if (inner.type === "AssignmentExpression" && inner.left?.type === "Identifier" && inner.left.name === param) paramReassigned = true;
    if (inner.type !== "ReturnStatement" || nested.some(([start, end]) => inner.start >= start && inner.end <= end)) return;
    returnCount += 1;
    const prop = inner.argument?.type === "ObjectExpression" ? inner.argument.properties.find((item) => item.type === "ObjectProperty" && !item.computed && (item.key.name ?? item.key.value) === "cmd") : null;
    if (!(prop?.value?.type === "Identifier" && prop.value.name === param)) returnsCmd = false;
  });
  let runRedefined = false;
  walk(ast.program, (node) => {
    if (node.type === "AssignmentExpression" && node.left?.type === "Identifier" && node.left.name === "run") runRedefined = true;
    if (node.type === "VariableDeclarator" && node.id?.name === "run") runRedefined = true;
  });
  if (!runFn || !returnsCmd || returnCount === 0 || paramReassigned || runRedefined) throw new Error("run(cmd) must be one top-level function that returns { cmd, ... } (the command it ran) from every return");
  // The lock gate reads one array: the first argument of the one evaluateMasterLockGate
  // call. That array is declared once as `const <name> = []`, and the only writes to it are
  // pushes inside the run loop. It is never handed to anything else (no alias, no helper),
  // so what is pushed is all it ever holds.
  const loop = runLoops[0];
  const inLoop = (node) => node.start >= loop.start && node.end <= loop.end;
  const gateCalls = [];
  walk(ast.program, (inner) => { if (inner.type === "CallExpression" && ((inner.callee?.type === "Identifier" && inner.callee.name === "evaluateMasterLockGate") || (/MemberExpression$/.test(inner.callee?.type) && inner.callee.property?.name === "evaluateMasterLockGate"))) gateCalls.push(inner); });
  const stepsName = gateCalls.length === 1 && gateCalls[0].arguments[0]?.type === "Identifier" ? gateCalls[0].arguments[0].name : null;
  if (!stepsName) throw new Error(`there must be exactly one call evaluateMasterLockGate(<steps array>, ...) (found ${gateCalls.length})`);
  const stepsDeclarations = [];
  walk(ast.program, (inner) => {
    if (inner.type === "VariableDeclarator" && inner.id?.type === "Identifier" && inner.id.name === stepsName) stepsDeclarations.push(inner);
    if (/Function/.test(inner.type) && (inner.params || []).some((item) => item.type === "Identifier" && item.name === stepsName)) stepsDeclarations.push(inner);
  });
  const stepsDeclaration = stepsDeclarations[0];
  const stepsKind = stepsDeclaration ? [...declarationKinds(ast.program)].find(([node]) => node === stepsDeclaration)?.[1] : null;
  if (stepsDeclarations.length !== 1 || stepsKind !== "const" || stepsDeclaration.init?.type !== "ArrayExpression" || stepsDeclaration.init.elements.length !== 0) throw new Error(`the array given to evaluateMasterLockGate (${stepsName}) must be declared once, as const ${stepsName} = []`);
  // Every use of the array: a read of a member (steps.length, steps.map(...)), a push in the
  // run loop, or the gate call itself. Anything else could change what the gate sees.
  const READS = new Set(["length", "map", "flatMap", "filter", "some", "every", "find", "findIndex", "forEach", "reduce", "slice", "join", "at", "includes"]);
  const pushes = [];
  const misuse = [];
  withAncestors(ast.program, [], (node, ancestors) => {
    if (node.type !== "Identifier" || node.name !== stepsName || node === stepsDeclaration.id) return;
    const parent = ancestors[ancestors.length - 1];
    const grand = ancestors[ancestors.length - 2];
    if (parent === gateCalls[0] && parent.arguments[0] === node) return;
    if (/MemberExpression$/.test(parent?.type) && parent.object === node && !parent.computed) {
      const name = parent.property?.name;
      const written = (grand?.type === "AssignmentExpression" && grand.left === parent) || grand?.type === "UpdateExpression" || (grand?.type === "UnaryExpression" && grand.operator === "delete");
      if (name === "push" && grand?.type === "CallExpression" && grand.callee === parent && inLoop(grand)) { pushes.push(grand); return; }
      if (READS.has(name) && !written) return;
    }
    if ((parent?.type === "ObjectProperty" && parent.key === node && !parent.computed) || (/MemberExpression$/.test(parent?.type) && parent.property === node && !parent.computed)) return;
    misuse.push(code.slice(parent?.start ?? node.start, parent?.end ?? node.end).split("\n")[0].slice(0, 60));
  });
  if (misuse.length) throw new Error(`the array given to evaluateMasterLockGate (${stepsName}) may only be pushed to in the run loop and read: ${misuse[0]}`);
  // The run result: one const in the run loop that holds run()'s return (directly or
  // through a helper). Only plain member reads and writes of fields other than cmd are
  // allowed, so result.cmd stays the command run() reported.
  const resultDeclarations = [];
  walk(loop.body, (inner) => { if (inner.type === "VariableDeclarator" && inner.id?.type === "Identifier" && inner.init && (callsRun(inner.init) || reaches(inner.init, callsRun))) resultDeclarations.push(inner); });
  const resultName = resultDeclarations.length === 1 ? resultDeclarations[0].id.name : null;
  const resultKind = resultName ? [...declarationKinds(loop.body)].find(([node]) => node === resultDeclarations[0])?.[1] : null;
  if (!resultName || resultKind !== "const") throw new Error("the run loop must keep run()'s result in exactly one const (for example const result = run(step.cmd))");
  const resultMisuse = [];
  withAncestors(ast.program, [], (node, ancestors) => {
    if (node.type !== "Identifier" || node.name !== resultName || node === resultDeclarations[0].id) return;
    const parent = ancestors[ancestors.length - 1];
    const grand = ancestors[ancestors.length - 2];
    if ((parent?.type === "ObjectProperty" && parent.key === node && !parent.computed) || (/MemberExpression$/.test(parent?.type) && parent.property === node && !parent.computed)) return;
    if (!inLoop(node)) return; // another variable of the same name elsewhere
    if (/MemberExpression$/.test(parent?.type) && parent.object === node && !parent.computed) {
      const written = (grand?.type === "AssignmentExpression" && grand.left === parent) || grand?.type === "UpdateExpression" || (grand?.type === "UnaryExpression" && grand.operator === "delete");
      if (!written || parent.property?.name !== "cmd") return;
    }
    if (node.type === "Identifier" && parent?.type === "VariableDeclarator" && parent.id === node) { resultMisuse.push(`a second ${resultName}`); return; }
    resultMisuse.push(code.slice(parent?.start ?? node.start, parent?.end ?? node.end).split("\n")[0].slice(0, 60));
  });
  if (resultMisuse.length) throw new Error(`run()'s result (${resultName}) may only be read field by field, and its cmd never written: ${resultMisuse[0]}`);
  // Every push into the array carries exactly one record: an object literal, or a const
  // declared once in the run loop and never written to, whose only cmd is <result>.cmd.
  const loopDeclared = [];
  walk(loop.body, (inner) => { if (inner.type === "VariableDeclarator" && inner.id?.type === "Identifier") loopDeclared.push(inner); });
  const loopKinds = new Map(declarationKinds(loop.body));
  const writtenNames = new Set();
  walk(loop.body, (inner) => {
    const target = inner.type === "AssignmentExpression" ? inner.left : inner.type === "UpdateExpression" ? inner.argument : inner.type === "UnaryExpression" && inner.operator === "delete" ? inner.argument : null;
    let base = target;
    while (base && /MemberExpression$/.test(base.type)) base = base.object;
    if (base?.type === "Identifier") writtenNames.add(base.name);
  });
  const badPush = pushes.find((call) => {
    if (call.arguments.length !== 1) return true;
    let record = call.arguments[0];
    if (record?.type === "Identifier") {
      const matches = loopDeclared.filter((item) => item.id.name === record.name);
      if (matches.length !== 1 || matches[0].end > call.start || loopKinds.get(matches[0]) !== "const" || writtenNames.has(record.name)) return true;
      record = matches[0].init;
    }
    if (record?.type !== "ObjectExpression" || record.properties.some((item) => item.type !== "ObjectProperty" || item.computed)) return true;
    const cmds = record.properties.filter((item) => (item.key.name ?? item.key.value) === "cmd");
    const value = cmds[0]?.value;
    return cmds.length !== 1 || !(/MemberExpression$/.test(value?.type) && !value.computed && value.object?.type === "Identifier" && value.object.name === resultName && value.property?.name === "cmd");
  });
  if (!pushes.length || badPush) throw new Error(`the run loop must push each step into the array given to evaluateMasterLockGate (${stepsName}) as one plain record with cmd: ${resultName}.cmd, the command run() actually ran`);
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
