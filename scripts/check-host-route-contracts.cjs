#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

const mainText = read('src/main/main.ts');
const hostedText = read('src/main/hosted-server.ts');
const contractText = read('src/main/route-access-contracts.ts');
const policyText = read('src/main/policy-service.ts');

const REQUIRED_HOST_CONTRACTS = [
  {
    id: 'ipc:host:create',
    routeMarker: "'host:create'",
    contextFile: 'src/main/main.ts',
  },
  {
    id: 'ipc:host:update',
    routeMarker: "'host:update'",
    contextFile: 'src/main/main.ts',
  },
  {
    id: 'ipc:host:delete',
    routeMarker: "'host:delete'",
    contextFile: 'src/main/main.ts',
  },
  {
    id: 'ipc:host:test-connection',
    routeMarker: "'host:test-connection'",
    contextFile: 'src/main/main.ts',
  },
  {
    id: 'ipc:host:updateGroup',
    routeMarker: "'host:updateGroup'",
    contextFile: 'src/main/main.ts',
  },
  {
    id: 'ipc:host:setFavorite',
    routeMarker: "'host:setFavorite'",
    contextFile: 'src/main/main.ts',
  },
  {
    id: 'ipc:host:duplicate',
    routeMarker: "'host:duplicate'",
    contextFile: 'src/main/main.ts',
  },
  {
    id: 'ipc:host:import',
    routeMarker: "'host:import'",
    contextFile: 'src/main/main.ts',
  },
  {
    id: 'ipc:host-group:list',
    routeMarker: "'host-group:list'",
    contextFile: 'src/main/main.ts',
  },
  {
    id: 'ipc:host-group:get',
    routeMarker: "'host-group:get'",
    contextFile: 'src/main/main.ts',
  },
  {
    id: 'ipc:host-group:create',
    routeMarker: "'host-group:create'",
    contextFile: 'src/main/main.ts',
  },
  {
    id: 'ipc:host-group:update',
    routeMarker: "'host-group:update'",
    contextFile: 'src/main/main.ts',
  },
  {
    id: 'ipc:host-group:delete',
    routeMarker: "'host-group:delete'",
    contextFile: 'src/main/main.ts',
  },
  {
    id: 'ipc:host-tag:list',
    routeMarker: "'host-tag:list'",
    contextFile: 'src/main/main.ts',
  },
  {
    id: 'ipc:host-tag:get',
    routeMarker: "'host-tag:get'",
    contextFile: 'src/main/main.ts',
  },
  {
    id: 'ipc:host-tag:create',
    routeMarker: "'host-tag:create'",
    contextFile: 'src/main/main.ts',
  },
  {
    id: 'ipc:host-tag:update',
    routeMarker: "'host-tag:update'",
    contextFile: 'src/main/main.ts',
  },
  {
    id: 'ipc:host-tag:delete',
    routeMarker: "'host-tag:delete'",
    contextFile: 'src/main/main.ts',
  },
  {
    id: 'ipc:host-operation:run',
    routeMarker: "'host-operation:run'",
    contextFile: 'src/main/main.ts',
  },
  {
    id: 'ipc:workspace-file:list',
    routeMarker: "'workspace-file:list'",
    contextFile: 'src/main/main.ts',
  },
  {
    id: 'ipc:workspace-file:create-folder',
    routeMarker: "'workspace-file:create-folder'",
    contextFile: 'src/main/main.ts',
  },
  {
    id: 'ipc:workspace-file:create-file',
    routeMarker: "'workspace-file:create-file'",
    contextFile: 'src/main/main.ts',
  },
  {
    id: 'ipc:workspace-file:rename',
    routeMarker: "'workspace-file:rename'",
    contextFile: 'src/main/main.ts',
  },
  {
    id: 'ipc:workspace-file:duplicate',
    routeMarker: "'workspace-file:duplicate'",
    contextFile: 'src/main/main.ts',
  },
  {
    id: 'ipc:workspace-file:copy',
    routeMarker: "'workspace-file:copy'",
    contextFile: 'src/main/main.ts',
  },
  {
    id: 'ipc:workspace-file:move',
    routeMarker: "'workspace-file:move'",
    contextFile: 'src/main/main.ts',
  },
  {
    id: 'ipc:workspace-file:delete-permanent',
    routeMarker: "'workspace-file:delete-permanent'",
    contextFile: 'src/main/main.ts',
  },
  {
    id: 'ipc:workspace-file:list-trash',
    routeMarker: "'workspace-file:list-trash'",
    contextFile: 'src/main/main.ts',
  },
  {
    id: 'ipc:workspace-file:move-to-trash',
    routeMarker: "'workspace-file:move-to-trash'",
    contextFile: 'src/main/main.ts',
  },
  {
    id: 'ipc:workspace-file:restore-trash',
    routeMarker: "'workspace-file:restore-trash'",
    contextFile: 'src/main/main.ts',
  },
  {
    id: 'ipc:workspace-file:delete-trash-permanent',
    routeMarker: "'workspace-file:delete-trash-permanent'",
    contextFile: 'src/main/main.ts',
  },
  {
    id: 'ipc:workspace-file:empty-trash',
    routeMarker: "'workspace-file:empty-trash'",
    contextFile: 'src/main/main.ts',
  },
  {
    id: 'ipc:workspace:list-profiles',
    routeMarker: "'workspace:list-profiles'",
    contextFile: 'src/main/main.ts',
  },
  {
    id: 'ipc:workspace:get-profile',
    routeMarker: "'workspace:get-profile'",
    contextFile: 'src/main/main.ts',
  },
  {
    id: 'ipc:workspace:create-profile',
    routeMarker: "'workspace:create-profile'",
    contextFile: 'src/main/main.ts',
  },
  {
    id: 'ipc:workspace:update-profile',
    routeMarker: "'workspace:update-profile'",
    contextFile: 'src/main/main.ts',
  },
  {
    id: 'ipc:workspace:delete-profile',
    routeMarker: "'workspace:delete-profile'",
    contextFile: 'src/main/main.ts',
  },
  {
    id: 'ipc:workspace:get-active-profile-id',
    routeMarker: "'workspace:get-active-profile-id'",
    contextFile: 'src/main/main.ts',
  },
  {
    id: 'ipc:workspace:set-active-profile-id',
    routeMarker: "'workspace:set-active-profile-id'",
    contextFile: 'src/main/main.ts',
  },
  {
    id: 'ipc:credential-ref:list',
    routeMarker: "'credential-ref:list'",
    contextFile: 'src/main/main.ts',
  },
  {
    id: 'ipc:credential-ref:get',
    routeMarker: "'credential-ref:get'",
    contextFile: 'src/main/main.ts',
  },
  {
    id: 'ipc:credential-ref:create',
    routeMarker: "'credential-ref:create'",
    contextFile: 'src/main/main.ts',
  },
  {
    id: 'ipc:credential-ref:update',
    routeMarker: "'credential-ref:update'",
    contextFile: 'src/main/main.ts',
  },
  {
    id: 'ipc:credential-ref:delete',
    routeMarker: "'credential-ref:delete'",
    contextFile: 'src/main/main.ts',
  },
  {
    id: 'ipc:secret:store',
    routeMarker: "'secret:store'",
    contextFile: 'src/main/main.ts',
  },
  {
    id: 'ipc:secret:retrieve',
    routeMarker: "'secret:retrieve'",
    contextFile: 'src/main/main.ts',
  },
  {
    id: 'ipc:secret:delete',
    routeMarker: "'secret:delete'",
    contextFile: 'src/main/main.ts',
  },
  {
    id: 'ipc:audit:list',
    routeMarker: "'audit:list'",
    contextFile: 'src/main/main.ts',
  },
  {
    id: 'ipc:audit:log',
    routeMarker: "'audit:log'",
    contextFile: 'src/main/main.ts',
  },
  {
    id: 'hosted:GET:/api/audit',
    contextFile: 'src/main/hosted-server.ts',
  },
  {
    id: 'hosted:POST:/api/audit',
    contextFile: 'src/main/hosted-server.ts',
  },
  {
    id: 'hosted:POST:/api/hosts',
    routeMarker: "'/api/hosts'",
    contextFile: 'src/main/hosted-server.ts',
  },
  {
    id: 'hosted:PATCH:/api/hosts/:id',
    contextFile: 'src/main/hosted-server.ts',
  },
  {
    id: 'hosted:DELETE:/api/hosts/:id',
    contextFile: 'src/main/hosted-server.ts',
  },
  {
    id: 'hosted:POST:/api/hosts/:id/test',
    contextFile: 'src/main/hosted-server.ts',
  },
  {
    id: 'hosted:POST:/api/host-operations/run',
    contextFile: 'src/main/hosted-server.ts',
  },
  {
    id: 'hosted:GET:/api/workspace-files',
    contextFile: 'src/main/hosted-server.ts',
  },
  {
    id: 'hosted:POST:/api/workspace-files/folder',
    contextFile: 'src/main/hosted-server.ts',
  },
  {
    id: 'hosted:POST:/api/workspace-files/file',
    contextFile: 'src/main/hosted-server.ts',
  },
  {
    id: 'hosted:PATCH:/api/workspace-files',
    contextFile: 'src/main/hosted-server.ts',
  },
  {
    id: 'hosted:POST:/api/workspace-files/duplicate',
    contextFile: 'src/main/hosted-server.ts',
  },
  {
    id: 'hosted:POST:/api/workspace-files/copy',
    contextFile: 'src/main/hosted-server.ts',
  },
  {
    id: 'hosted:POST:/api/workspace-files/move',
    contextFile: 'src/main/hosted-server.ts',
  },
  {
    id: 'hosted:DELETE:/api/workspace-files',
    contextFile: 'src/main/hosted-server.ts',
  },
  {
    id: 'hosted:GET:/api/workspace-files/trash',
    contextFile: 'src/main/hosted-server.ts',
  },
  {
    id: 'hosted:POST:/api/workspace-files/trash',
    contextFile: 'src/main/hosted-server.ts',
  },
  {
    id: 'hosted:POST:/api/workspace-files/trash/restore',
    contextFile: 'src/main/hosted-server.ts',
  },
  {
    id: 'hosted:DELETE:/api/workspace-files/trash/:id',
    contextFile: 'src/main/hosted-server.ts',
  },
  {
    id: 'hosted:DELETE:/api/workspace-files/trash',
    contextFile: 'src/main/hosted-server.ts',
  },
  {
    id: 'hosted:GET:/api/workspace/profiles',
    contextFile: 'src/main/hosted-server.ts',
  },
  {
    id: 'hosted:POST:/api/workspace/profiles',
    contextFile: 'src/main/hosted-server.ts',
  },
  {
    id: 'hosted:GET:/api/workspace/profiles/:id',
    contextFile: 'src/main/hosted-server.ts',
  },
  {
    id: 'hosted:PATCH:/api/workspace/profiles/:id',
    contextFile: 'src/main/hosted-server.ts',
  },
  {
    id: 'hosted:DELETE:/api/workspace/profiles/:id',
    contextFile: 'src/main/hosted-server.ts',
  },
  {
    id: 'hosted:GET:/api/workspace/active-profile-id',
    contextFile: 'src/main/hosted-server.ts',
  },
  {
    id: 'hosted:PUT:/api/workspace/active-profile-id',
    contextFile: 'src/main/hosted-server.ts',
  },
  {
    id: 'hosted:POST:/api/workspace/active-profile-id',
    contextFile: 'src/main/hosted-server.ts',
  },
];

const REQUIRED_HOST_CAPABILITIES = [
  'host:create',
  'host:update',
  'host:delete',
  'host:test-connection',
  'host:updateGroup',
  'host:setFavorite',
  'host:duplicate',
  'host:import',
  'host-group:read',
  'host-group:create',
  'host-group:update',
  'host-group:delete',
  'host-tag:read',
  'host-tag:create',
  'host-tag:update',
  'host-tag:delete',
  'host-operation:run',
  'workspace-file:read',
  'workspace-file:write',
  'workspace-profile:read',
  'workspace-profile:write',
  'credential-ref:read',
  'credential-ref:create',
  'credential-ref:update',
  'credential-ref:delete',
  'secret:store',
  'secret:retrieve',
  'secret:delete',
  'audit:read',
  'audit:write',
];

const failures = [];

function fail(message) {
  failures.push(message);
}

function findPropertyMap(node) {
  if (!ts.isObjectLiteralExpression(node)) {
    return new Map();
  }

  const entries = new Map();
  for (const property of node.properties) {
    if (!ts.isPropertyAssignment(property)) {
      continue;
    }
    let name;
    if (ts.isIdentifier(property.name)) {
      name = property.name.text;
    } else if (ts.isStringLiteral(property.name)) {
      name = property.name.text;
    } else if (ts.isComputedPropertyName(property.name) && ts.isStringLiteral(property.name.expression)) {
      name = property.name.expression.text;
    } else {
      continue;
    }
    entries.set(name, property.initializer);
  }
  return entries;
}

function asArrayExpression(node) {
  if (!node) {
    return null;
  }
  if (ts.isArrayLiteralExpression(node)) {
    return node;
  }
  if (ts.isAsExpression(node) && ts.isArrayLiteralExpression(node.expression)) {
    return node.expression;
  }
  return null;
}

function parseString(node) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }
  return null;
}

function parseBoolean(node) {
  if (node && (node.kind === ts.SyntaxKind.TrueKeyword || node.kind === ts.SyntaxKind.FalseKeyword)) {
    return node.kind === ts.SyntaxKind.TrueKeyword;
  }
  return null;
}

function parseRecord(node) {
  return ts.isObjectLiteralExpression(node) ? node : null;
}

function parseContractsFromSource() {
  const source = ts.createSourceFile('route-access-contracts.ts', contractText, ts.ScriptTarget.ES2020, true);
  const contractNodes = [];

  const visit = (node) => {
    if (ts.isVariableDeclaration(node)
      && ts.isIdentifier(node.name)
      && node.name.text === 'HOST_ROUTE_CONTRACTS') {
      const arrayNode = asArrayExpression(node.initializer);
      if (!arrayNode) {
        fail('HOST_ROUTE_CONTRACTS must be initialized with an array literal.');
        return;
      }
      for (const element of arrayNode.elements) {
        if (!ts.isObjectLiteralExpression(element)) {
          fail('Each host route contract entry must be an object literal.');
          continue;
        }
        const props = findPropertyMap(element);
        contractNodes.push({
          id: parseString(props.get('id')),
          transport: parseString(props.get('transport')),
          route: parseRecord(props.get('route')),
          requestValidator: parseString(props.get('requestValidator')),
          identity: parseRecord(props.get('identity')),
          capability: parseString(props.get('capability')),
          policyDecisionRequired: parseBoolean(props.get('policyDecisionRequired')),
          denialAudit: parseRecord(props.get('denialAudit')),
          successAudit: parseRecord(props.get('successAudit')),
          parity: parseRecord(props.get('parity')),
          mutatesState: parseBoolean(props.get('mutatesState')),
          source: element.getText(),
        });
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(source);
  return contractNodes;
}

function validateContractMetadata(contracts) {
  const seen = new Set();
  for (const contract of contracts) {
    const { id } = contract;
    if (typeof id !== 'string' || !id) {
      fail('Found a host route contract with invalid or missing id.');
      continue;
    }
    if (seen.has(id)) {
      fail(`Duplicate host route contract id found: ${id}`);
      continue;
    }
    seen.add(id);

    const { transport, route, requestValidator, identity, capability, policyDecisionRequired, denialAudit, successAudit, parity, mutatesState } = contract;
    if (typeof transport !== 'string' || !transport) {
      fail(`Contract ${id} missing route transport.`);
    }
    if (!(route && ts.isObjectLiteralExpression(route))) {
      fail(`Contract ${id} missing route metadata object.`);
    } else {
      const routeProps = findPropertyMap(route);
      const hasChannel = routeProps.has('channel');
      const hasMethod = routeProps.has('method');
      const hasPath = routeProps.has('path');
      if (!hasChannel && !hasMethod && !hasPath) {
        fail(`Contract ${id} route metadata must include channel, method, or path.`);
      }
    }
    if (typeof requestValidator !== 'string' || !requestValidator) {
      fail(`Contract ${id} missing request validator reference string.`);
    }
    if (!(identity && ts.isObjectLiteralExpression(identity))) {
      fail(`Contract ${id} missing caller/session/app identity metadata.`);
    } else {
      const identityProps = findPropertyMap(identity);
      if (parseString(identityProps.get('caller')) == null) {
        fail(`Contract ${id} identity metadata must include caller.`);
      }
      if (parseBoolean(identityProps.get('sessionRequired')) == null) {
        fail(`Contract ${id} identity metadata missing sessionRequired boolean.`);
      }
      if (parseBoolean(identityProps.get('appIdentityRequired')) == null) {
        fail(`Contract ${id} identity metadata missing appIdentityRequired boolean.`);
      }
    }
    if (typeof capability !== 'string' || !capability) {
      fail(`Contract ${id} missing capability.`);
    }
    if (policyDecisionRequired == null) {
      fail(`Contract ${id} missing policy decision requirement flag.`);
    }
    if (!(denialAudit && ts.isObjectLiteralExpression(denialAudit))) {
      fail(`Contract ${id} missing denial audit metadata.`);
    } else {
      const denialProps = findPropertyMap(denialAudit);
      if (parseString(denialProps.get('eventType')) == null) {
        fail(`Contract ${id} denial audit metadata missing eventType.`);
      }
      if (parseString(denialProps.get('source')) == null) {
        fail(`Contract ${id} denial audit metadata missing source.`);
      }
    }
    if (!(successAudit && ts.isObjectLiteralExpression(successAudit))) {
      fail(`Contract ${id} missing success audit metadata.`);
    } else {
      const successProps = findPropertyMap(successAudit);
      if (parseBoolean(successProps.get('required')) == null) {
        fail(`Contract ${id} success audit metadata missing required flag.`);
      }
      if (parseString(successProps.get('eventType')) == null) {
        fail(`Contract ${id} success audit metadata missing eventType.`);
      }
      if (parseString(successProps.get('entityType')) == null) {
        fail(`Contract ${id} success audit metadata missing entityType.`);
      }
      if (parseString(successProps.get('entityIdSource')) == null) {
        fail(`Contract ${id} success audit metadata missing entityIdSource.`);
      }
      if (parseString(successProps.get('message')) == null) {
        fail(`Contract ${id} success audit metadata missing message.`);
      }
      if (!parseRecord(successProps.get('metadata'))) {
        fail(`Contract ${id} success audit metadata missing metadata record.`);
      }
    }
    if (!(parity && ts.isObjectLiteralExpression(parity))) {
      fail(`Contract ${id} missing parity metadata.`);
    } else {
      const parityProps = findPropertyMap(parity);
      const kind = parseString(parityProps.get('kind'));
      if (!kind) {
        fail(`Contract ${id} parity metadata missing kind.`);
      }
      if (kind === 'paired' && parseString(parityProps.get('peerRouteId')) == null) {
        fail(`Contract ${id} paired parity metadata missing peerRouteId.`);
      }
      if (kind === 'exception' && parseString(parityProps.get('reason')) == null) {
        fail(`Contract ${id} exception parity metadata missing reason.`);
      }
    }
    if (mutatesState == null) {
      fail(`Contract ${id} missing mutatesState flag.`);
    }
  }

  return seen;
}

function parsePolicyFullCapabilities() {
  const source = ts.createSourceFile('policy-service.ts', policyText, ts.ScriptTarget.ES2020, true);
  let capabilities = [];

  const visit = (node) => {
    if (ts.isVariableDeclaration(node)
      && ts.isIdentifier(node.name)
      && node.name.text === 'FULL_CAPABILITIES') {
      const arrayNode = asArrayExpression(node.initializer);
      if (!arrayNode) {
        fail('FULL_CAPABILITIES must be initialized with an array literal.');
        return;
      }
      for (const element of arrayNode.elements) {
        const text = parseString(element);
        if (text) {
          capabilities.push(text);
        }
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(source);
  return capabilities;
}

function validateIpcHostHandlers() {
  const source = ts.createSourceFile('main.ts', mainText, ts.ScriptTarget.ES2020, true);
  const handlersByChannel = new Map();

  const visit = (node) => {
    if (
      ts.isCallExpression(node)
      && ts.isPropertyAccessExpression(node.expression)
      && node.expression.name.text === 'handle'
      && node.arguments.length >= 2
    ) {
      const receiver = node.expression.expression;
      if (ts.isIdentifier(receiver) && receiver.text === 'ipcMain') {
        const channelArg = node.arguments[0];
        const handler = node.arguments[1];
        if (ts.isStringLiteral(channelArg)) {
          const handlerText = handler.getText();
          handlersByChannel.set(channelArg.text, {
            hasContractCall: handlerText.includes('runHostRouteContract({')
              || handlerText.includes('runWorkspaceFileIpcRoute(')
              || handlerText.includes('runWorkspaceProfileIpcRoute(')
              || handlerText.includes('runCredentialRefIpcRoute(')
              || handlerText.includes('runSecretIpcRoute(')
              || handlerText.includes('runAuditIpcRoute('),
          });
        }
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(source);

  for (const contract of REQUIRED_HOST_CONTRACTS.filter((entry) => entry.contextFile === 'src/main/main.ts')) {
    const channel = contract.id.replace(/^ipc:/, '');
    const handler = handlersByChannel.get(channel);
    if (!handler) {
      fail(`Expected IPC handler for ${channel} not found in main.ts.`);
      continue;
    }
    if (!handler.hasContractCall) {
      fail(`IPC handler ${channel} is not wired through runHostRouteContract in main.ts.`);
    }
    if (!mainText.includes(contract.routeMarker)) {
      fail(`Expected IPC route marker ${contract.routeMarker} missing in main.ts.`);
    }
  }
}

function validateHostedDispatches() {
  for (const contract of REQUIRED_HOST_CONTRACTS.filter((entry) => entry.contextFile === 'src/main/hosted-server.ts')) {
    const hasDirectContractLookup = hostedText.includes(`getHostRouteContract('${contract.id}')`)
      || hostedText.includes(`getHostRouteContract("${contract.id}")`);
    const hasWorkspaceContractHelper = hostedText.includes(`contractId: '${contract.id}'`)
      || hostedText.includes(`contractId: "${contract.id}"`);
    if (!hasDirectContractLookup && !hasWorkspaceContractHelper) {
      fail(`Hosted route contract ${contract.id} not wired in hosted-server.ts.`);
    }
  }

  if (!hostedText.includes('runHostRouteContract({')) {
    fail('Hosted route handlers are not using runHostRouteContract.');
  }

  if (REQUIRED_HOST_CONTRACTS.some((entry) => entry.id.includes('/api/workspace-files'))) {
    const workspaceHelperIndex = hostedText.indexOf('runHostedWorkspaceFileRoute');
    if (workspaceHelperIndex === -1) {
      fail('Hosted workspace file routes are not using runHostedWorkspaceFileRoute.');
    } else {
      const helperBody = hostedText.slice(workspaceHelperIndex, workspaceHelperIndex + 1600);
      if (!helperBody.includes('runHostRouteContract({')) {
        fail('Hosted workspace file helper is not backed by runHostRouteContract.');
      }
    }
  }

  if (REQUIRED_HOST_CONTRACTS.some((entry) => entry.id.includes('/api/workspace/'))) {
    const profileHelperIndex = hostedText.indexOf('private runHostedWorkspaceProfileRoute');
    if (profileHelperIndex === -1) {
      fail('Hosted workspace profile routes are not using runHostedWorkspaceProfileRoute.');
    } else {
      const helperBody = hostedText.slice(profileHelperIndex, profileHelperIndex + 1600);
      if (!helperBody.includes('runHostRouteContract({')) {
        fail('Hosted workspace profile helper is not backed by runHostRouteContract.');
      }
    }
  }

  if (REQUIRED_HOST_CONTRACTS.some((entry) => entry.id.includes('/api/audit'))) {
    const auditHelperIndex = hostedText.indexOf('private runHostedAuditRoute');
    if (auditHelperIndex === -1) {
      fail('Hosted audit routes are not using runHostedAuditRoute.');
    } else {
      const helperBody = hostedText.slice(auditHelperIndex, auditHelperIndex + 1600);
      if (!helperBody.includes('runHostRouteContract({')) {
        fail('Hosted audit helper is not backed by runHostRouteContract.');
      }
    }
  }

  if (hostedText.includes("requireHostedCapability(request, session, 'host-operation:run'")) {
    fail('Hosted route still uses requireHostedCapability for host-operation:run instead of host route contract enforcement.');
  }

  if (hostedText.includes('this.options.hostOperations.run(validateHostOperationInput(body))')) {
    fail('Direct hosted host-operation fallback detected in hosted-server.ts. All host operation runs must execute through runHostRouteContract.');
  }
}

function validatePolicyCapabilities() {
  const policyCapabilities = new Set(parsePolicyFullCapabilities());
  for (const capability of REQUIRED_HOST_CAPABILITIES) {
    if (!policyCapabilities.has(capability)) {
      fail(`host policy capability missing from FULL_CAPABILITIES: ${capability}`);
    }
  }
}

const contracts = parseContractsFromSource();
const contractIds = validateContractMetadata(contracts);
const requiredContractIds = new Set(REQUIRED_HOST_CONTRACTS.map((entry) => entry.id));
for (const required of requiredContractIds) {
  if (!contractIds.has(required)) {
    fail(`Missing required host route contract: ${required}`);
  }
}

validatePolicyCapabilities();
validateIpcHostHandlers();
validateHostedDispatches();

if (contractIds.size === 0) {
  fail('No host route contracts parsed from route-access-contracts.ts.');
}

if (failures.length > 0) {
  console.error('check-host-route-contracts failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('check-host-route-contracts passed');
