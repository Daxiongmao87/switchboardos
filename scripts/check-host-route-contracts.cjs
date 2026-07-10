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
const agentsText = read('src/renderer/app/agents/agents.component.ts');
const generatedRuntimeText = read('src/renderer/app/generated-app-runtime/generated-app-runtime.component.ts');
const preloadText = read('src/preload/preload.ts');
const switchboardApiText = read('src/renderer/app/switchboard-api.ts');
const hostedApiText = read('src/renderer/app/hosted-api.ts');
const hostOperationsText = read('src/renderer/app/host-operations/host-operations.component.ts');
const sshServiceText = read('src/main/ssh-service.ts');
const hostedNoAuthSmokeText = read('scripts/smoke-hosted-no-auth.cjs');
const readmeText = read('README.md');
const designDocText = read('docs/spec/switchboardos-design-doc.md');

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
    id: 'ipc:ssh:exec',
    routeMarker: "'ssh:exec'",
    contextFile: 'src/main/main.ts',
  },
  {
    id: 'ipc:ssh-file:list',
    routeMarker: "'ssh-file:list'",
    contextFile: 'src/main/main.ts',
  },
  {
    id: 'ipc:ssh-file:stat',
    routeMarker: "'ssh-file:stat'",
    contextFile: 'src/main/main.ts',
  },
  {
    id: 'ipc:ssh-file:download',
    routeMarker: "'ssh-file:download'",
    contextFile: 'src/main/main.ts',
  },
  {
    id: 'ipc:ssh-file:upload',
    routeMarker: "'ssh-file:upload'",
    contextFile: 'src/main/main.ts',
  },
  {
    id: 'ipc:ssh-file:delete',
    routeMarker: "'ssh-file:delete'",
    contextFile: 'src/main/main.ts',
  },
  {
    id: 'ipc:ssh-file:move',
    routeMarker: "'ssh-file:move'",
    contextFile: 'src/main/main.ts',
  },
  {
    id: 'ipc:terminal:start',
    routeMarker: "'terminal:start'",
    contextFile: 'src/main/main.ts',
  },
  {
    id: 'ipc:terminal:write',
    routeMarker: "'terminal:write'",
    contextFile: 'src/main/main.ts',
  },
  {
    id: 'ipc:terminal:resize',
    routeMarker: "'terminal:resize'",
    contextFile: 'src/main/main.ts',
  },
  {
    id: 'ipc:terminal:stop',
    routeMarker: "'terminal:stop'",
    contextFile: 'src/main/main.ts',
  },
  {
    id: 'ipc:agent-endpoint:list',
    routeMarker: "'agent-endpoint:list'",
    contextFile: 'src/main/main.ts',
  },
  {
    id: 'ipc:agent-endpoint:get',
    routeMarker: "'agent-endpoint:get'",
    contextFile: 'src/main/main.ts',
  },
  {
    id: 'ipc:agent-endpoint:create',
    routeMarker: "'agent-endpoint:create'",
    contextFile: 'src/main/main.ts',
  },
  {
    id: 'ipc:agent-endpoint:update',
    routeMarker: "'agent-endpoint:update'",
    contextFile: 'src/main/main.ts',
  },
  {
    id: 'ipc:agent-endpoint:delete',
    routeMarker: "'agent-endpoint:delete'",
    contextFile: 'src/main/main.ts',
  },
  {
    id: 'ipc:agent:propose',
    routeMarker: "'agent:propose'",
    contextFile: 'src/main/main.ts',
  },
  {
    id: 'ipc:agent:execute-action',
    routeMarker: "'agent:execute-action'",
    contextFile: 'src/main/main.ts',
  },
  {
    id: 'ipc:app-manifest:list',
    routeMarker: "'app-manifest:list'",
    contextFile: 'src/main/main.ts',
  },
  {
    id: 'ipc:app-manifest:get',
    routeMarker: "'app-manifest:get'",
    contextFile: 'src/main/main.ts',
  },
  {
    id: 'ipc:app-manifest:create',
    routeMarker: "'app-manifest:create'",
    contextFile: 'src/main/main.ts',
  },
  {
    id: 'ipc:app-manifest:update',
    routeMarker: "'app-manifest:update'",
    contextFile: 'src/main/main.ts',
  },
  {
    id: 'ipc:app-manifest:delete',
    routeMarker: "'app-manifest:delete'",
    contextFile: 'src/main/main.ts',
  },
  {
    id: 'ipc:app-permission:list',
    routeMarker: "'app-permission:list'",
    contextFile: 'src/main/main.ts',
  },
  {
    id: 'ipc:app-permission:create',
    routeMarker: "'app-permission:create'",
    contextFile: 'src/main/main.ts',
  },
  {
    id: 'ipc:app-permission:delete',
    routeMarker: "'app-permission:delete'",
    contextFile: 'src/main/main.ts',
  },
  {
    id: 'ipc:app-storage:get',
    routeMarker: "'app-storage:get'",
    contextFile: 'src/main/main.ts',
  },
  {
    id: 'ipc:app-storage:set',
    routeMarker: "'app-storage:set'",
    contextFile: 'src/main/main.ts',
  },
  {
    id: 'ipc:app-storage:delete',
    routeMarker: "'app-storage:delete'",
    contextFile: 'src/main/main.ts',
  },
  {
    id: 'ipc:app-host:list',
    routeMarker: "'app-host:list'",
    contextFile: 'src/main/main.ts',
  },
  {
    id: 'ipc:app-host:get',
    routeMarker: "'app-host:get'",
    contextFile: 'src/main/main.ts',
  },
  {
    id: 'ipc:app-host:get-status',
    routeMarker: "'app-host:get-status'",
    contextFile: 'src/main/main.ts',
  },
  {
    id: 'ipc:app-host:get-capabilities',
    routeMarker: "'app-host:get-capabilities'",
    contextFile: 'src/main/main.ts',
  },
  {
    id: 'ipc:app-host:test-connection',
    routeMarker: "'app-host:test-connection'",
    contextFile: 'src/main/main.ts',
  },
  {
    id: 'ipc:app-host:exec',
    routeMarker: "'app-host:exec'",
    contextFile: 'src/main/main.ts',
  },
  {
    id: 'ipc:bootstrap-preset:list',
    routeMarker: "'bootstrap-preset:list'",
    contextFile: 'src/main/main.ts',
  },
  {
    id: 'ipc:bootstrap-preset:get',
    routeMarker: "'bootstrap-preset:get'",
    contextFile: 'src/main/main.ts',
  },
  {
    id: 'ipc:bootstrap-preset:create',
    routeMarker: "'bootstrap-preset:create'",
    contextFile: 'src/main/main.ts',
  },
  {
    id: 'ipc:bootstrap-preset:update',
    routeMarker: "'bootstrap-preset:update'",
    contextFile: 'src/main/main.ts',
  },
  {
    id: 'ipc:bootstrap-preset:delete',
    routeMarker: "'bootstrap-preset:delete'",
    contextFile: 'src/main/main.ts',
  },
  {
    id: 'ipc:bootstrap-run:list',
    routeMarker: "'bootstrap-run:list'",
    contextFile: 'src/main/main.ts',
  },
  {
    id: 'ipc:bootstrap-run:get',
    routeMarker: "'bootstrap-run:get'",
    contextFile: 'src/main/main.ts',
  },
  {
    id: 'ipc:bootstrap-run:create',
    routeMarker: "'bootstrap-run:create'",
    contextFile: 'src/main/main.ts',
  },
  {
    id: 'ipc:bootstrap-run:update',
    routeMarker: "'bootstrap-run:update'",
    contextFile: 'src/main/main.ts',
  },
  {
    id: 'ipc:bootstrap-run:delete',
    routeMarker: "'bootstrap-run:delete'",
    contextFile: 'src/main/main.ts',
  },
  {
    id: 'ipc:bootstrap:presets',
    routeMarker: "'bootstrap:presets'",
    contextFile: 'src/main/main.ts',
  },
  {
    id: 'ipc:bootstrap:generate',
    routeMarker: "'bootstrap:generate'",
    contextFile: 'src/main/main.ts',
  },
  {
    id: 'ipc:command-history:list',
    routeMarker: "'command-history:list'",
    contextFile: 'src/main/main.ts',
  },
  {
    id: 'ipc:command-history:create',
    routeMarker: "'command-history:create'",
    contextFile: 'src/main/main.ts',
  },
  {
    id: 'ipc:command-history:get',
    routeMarker: "'command-history:get'",
    contextFile: 'src/main/main.ts',
  },
  {
    id: 'ipc:command-history:delete',
    routeMarker: "'command-history:delete'",
    contextFile: 'src/main/main.ts',
  },
  {
    id: 'ipc:settings:get',
    routeMarker: "'settings:get'",
    contextFile: 'src/main/main.ts',
  },
  {
    id: 'ipc:settings:update',
    routeMarker: "'settings:update'",
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
    id: 'ipc:workspace-artifact-content:get',
    routeMarker: "'workspace-artifact-content:get'",
    contextFile: 'src/main/main.ts',
  },
  {
    id: 'ipc:workspace-artifact-content:update',
    routeMarker: "'workspace-artifact-content:update'",
    contextFile: 'src/main/main.ts',
  },
  {
    id: 'ipc:workspace-scriptlet:run',
    routeMarker: "'workspace-scriptlet:run'",
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
    id: 'hosted:GET:/api/credential-refs',
    contextFile: 'src/main/hosted-server.ts',
  },
  {
    id: 'hosted:GET:/api/credential-refs/:id',
    contextFile: 'src/main/hosted-server.ts',
  },
  {
    id: 'hosted:POST:/api/credential-refs',
    contextFile: 'src/main/hosted-server.ts',
  },
  {
    id: 'hosted:PATCH:/api/credential-refs/:id',
    contextFile: 'src/main/hosted-server.ts',
  },
  {
    id: 'hosted:DELETE:/api/credential-refs/:id',
    contextFile: 'src/main/hosted-server.ts',
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
    id: 'hosted:PATCH:/api/hosts/:id/group',
    contextFile: 'src/main/hosted-server.ts',
  },
  {
    id: 'hosted:PATCH:/api/hosts/:id/favorite',
    contextFile: 'src/main/hosted-server.ts',
  },
  {
    id: 'hosted:POST:/api/hosts/:id/duplicate',
    contextFile: 'src/main/hosted-server.ts',
  },
  {
    id: 'hosted:POST:/api/hosts/import',
    contextFile: 'src/main/hosted-server.ts',
  },
  {
    id: 'hosted:GET:/api/host-groups',
    contextFile: 'src/main/hosted-server.ts',
  },
  {
    id: 'hosted:POST:/api/host-groups',
    contextFile: 'src/main/hosted-server.ts',
  },
  {
    id: 'hosted:GET:/api/host-groups/:id',
    contextFile: 'src/main/hosted-server.ts',
  },
  {
    id: 'hosted:PATCH:/api/host-groups/:id',
    contextFile: 'src/main/hosted-server.ts',
  },
  {
    id: 'hosted:DELETE:/api/host-groups/:id',
    contextFile: 'src/main/hosted-server.ts',
  },
  {
    id: 'hosted:GET:/api/host-tags',
    contextFile: 'src/main/hosted-server.ts',
  },
  {
    id: 'hosted:POST:/api/host-tags',
    contextFile: 'src/main/hosted-server.ts',
  },
  {
    id: 'hosted:GET:/api/host-tags/:id',
    contextFile: 'src/main/hosted-server.ts',
  },
  {
    id: 'hosted:PATCH:/api/host-tags/:id',
    contextFile: 'src/main/hosted-server.ts',
  },
  {
    id: 'hosted:DELETE:/api/host-tags/:id',
    contextFile: 'src/main/hosted-server.ts',
  },
  {
    id: 'hosted:POST:/api/host-operations/run',
    contextFile: 'src/main/hosted-server.ts',
  },
  {
    id: 'hosted:POST:/api/workspace-scriptlets/run',
    contextFile: 'src/main/hosted-server.ts',
  },
  {
    id: 'hosted:POST:/api/ssh/exec',
    contextFile: 'src/main/hosted-server.ts',
  },
  {
    id: 'hosted:POST:/api/ssh-files/list',
    contextFile: 'src/main/hosted-server.ts',
  },
  {
    id: 'hosted:POST:/api/ssh-files/stat',
    contextFile: 'src/main/hosted-server.ts',
  },
  {
    id: 'hosted:POST:/api/ssh-files/download',
    contextFile: 'src/main/hosted-server.ts',
  },
  {
    id: 'hosted:POST:/api/ssh-files/upload',
    contextFile: 'src/main/hosted-server.ts',
  },
  {
    id: 'hosted:POST:/api/ssh-files/delete',
    contextFile: 'src/main/hosted-server.ts',
  },
  {
    id: 'hosted:POST:/api/ssh-files/move',
    contextFile: 'src/main/hosted-server.ts',
  },
  {
    id: 'hosted:POST:/api/terminal/start',
    contextFile: 'src/main/hosted-server.ts',
  },
  {
    id: 'hosted:POST:/api/terminal/write',
    contextFile: 'src/main/hosted-server.ts',
  },
  {
    id: 'hosted:POST:/api/terminal/resize',
    contextFile: 'src/main/hosted-server.ts',
  },
  {
    id: 'hosted:POST:/api/terminal/stop',
    contextFile: 'src/main/hosted-server.ts',
  },
  {
    id: 'hosted:GET:/api/terminal/events',
    contextFile: 'src/main/hosted-server.ts',
  },
  {
    id: 'hosted:GET:/api/agent-endpoints',
    contextFile: 'src/main/hosted-server.ts',
  },
  {
    id: 'hosted:POST:/api/agent-endpoints',
    contextFile: 'src/main/hosted-server.ts',
  },
  {
    id: 'hosted:GET:/api/agent-endpoints/:id',
    contextFile: 'src/main/hosted-server.ts',
  },
  {
    id: 'hosted:PATCH:/api/agent-endpoints/:id',
    contextFile: 'src/main/hosted-server.ts',
  },
  {
    id: 'hosted:DELETE:/api/agent-endpoints/:id',
    contextFile: 'src/main/hosted-server.ts',
  },
  {
    id: 'hosted:POST:/api/agent/propose',
    contextFile: 'src/main/hosted-server.ts',
  },
  {
    id: 'hosted:POST:/api/agent/execute-action',
    contextFile: 'src/main/hosted-server.ts',
  },
  {
    id: 'hosted:GET:/api/app-manifests',
    contextFile: 'src/main/hosted-server.ts',
  },
  {
    id: 'hosted:POST:/api/app-manifests',
    contextFile: 'src/main/hosted-server.ts',
  },
  {
    id: 'hosted:GET:/api/app-manifests/:id',
    contextFile: 'src/main/hosted-server.ts',
  },
  {
    id: 'hosted:PATCH:/api/app-manifests/:id',
    contextFile: 'src/main/hosted-server.ts',
  },
  {
    id: 'hosted:DELETE:/api/app-manifests/:id',
    contextFile: 'src/main/hosted-server.ts',
  },
  {
    id: 'hosted:GET:/api/app-permissions',
    contextFile: 'src/main/hosted-server.ts',
  },
  {
    id: 'hosted:POST:/api/app-permissions',
    contextFile: 'src/main/hosted-server.ts',
  },
  {
    id: 'hosted:DELETE:/api/app-permissions/:id',
    contextFile: 'src/main/hosted-server.ts',
  },
  {
    id: 'hosted:GET:/api/app-storage/:appId/:key',
    contextFile: 'src/main/hosted-server.ts',
  },
  {
    id: 'hosted:PUT:/api/app-storage/:appId/:key',
    contextFile: 'src/main/hosted-server.ts',
  },
  {
    id: 'hosted:DELETE:/api/app-storage/:appId/:key',
    contextFile: 'src/main/hosted-server.ts',
  },
  {
    id: 'hosted:POST:/api/app-host/list',
    contextFile: 'src/main/hosted-server.ts',
  },
  {
    id: 'hosted:POST:/api/app-host/get',
    contextFile: 'src/main/hosted-server.ts',
  },
  {
    id: 'hosted:POST:/api/app-host/status',
    contextFile: 'src/main/hosted-server.ts',
  },
  {
    id: 'hosted:POST:/api/app-host/capabilities',
    contextFile: 'src/main/hosted-server.ts',
  },
  {
    id: 'hosted:POST:/api/app-host/test-connection',
    contextFile: 'src/main/hosted-server.ts',
  },
  {
    id: 'hosted:POST:/api/app-host/exec',
    contextFile: 'src/main/hosted-server.ts',
  },
  {
    id: 'hosted:GET:/api/bootstrap/presets',
    contextFile: 'src/main/hosted-server.ts',
  },
  {
    id: 'hosted:POST:/api/bootstrap/generate',
    contextFile: 'src/main/hosted-server.ts',
  },
  {
    id: 'hosted:GET:/api/bootstrap/persisted-presets',
    contextFile: 'src/main/hosted-server.ts',
  },
  {
    id: 'hosted:GET:/api/bootstrap/persisted-presets/:id',
    contextFile: 'src/main/hosted-server.ts',
  },
  {
    id: 'hosted:POST:/api/bootstrap/persisted-presets',
    contextFile: 'src/main/hosted-server.ts',
  },
  {
    id: 'hosted:PATCH:/api/bootstrap/persisted-presets/:id',
    contextFile: 'src/main/hosted-server.ts',
  },
  {
    id: 'hosted:DELETE:/api/bootstrap/persisted-presets/:id',
    contextFile: 'src/main/hosted-server.ts',
  },
  {
    id: 'hosted:GET:/api/bootstrap/runs',
    contextFile: 'src/main/hosted-server.ts',
  },
  {
    id: 'hosted:GET:/api/bootstrap/runs/:id',
    contextFile: 'src/main/hosted-server.ts',
  },
  {
    id: 'hosted:POST:/api/bootstrap/runs',
    contextFile: 'src/main/hosted-server.ts',
  },
  {
    id: 'hosted:PATCH:/api/bootstrap/runs/:id',
    contextFile: 'src/main/hosted-server.ts',
  },
  {
    id: 'hosted:DELETE:/api/bootstrap/runs/:id',
    contextFile: 'src/main/hosted-server.ts',
  },
  {
    id: 'hosted:GET:/api/command-history',
    contextFile: 'src/main/hosted-server.ts',
  },
  {
    id: 'hosted:POST:/api/command-history',
    contextFile: 'src/main/hosted-server.ts',
  },
  {
    id: 'hosted:GET:/api/command-history/:id',
    contextFile: 'src/main/hosted-server.ts',
  },
  {
    id: 'hosted:DELETE:/api/command-history/:id',
    contextFile: 'src/main/hosted-server.ts',
  },
  {
    id: 'hosted:GET:/api/settings',
    contextFile: 'src/main/hosted-server.ts',
  },
  {
    id: 'hosted:PATCH:/api/settings',
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
    id: 'hosted:GET:/api/workspace-artifacts/content',
    contextFile: 'src/main/hosted-server.ts',
  },
  {
    id: 'hosted:PUT:/api/workspace-artifacts/content',
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
  'host:file:read',
  'host:file:write',
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
  'ssh:exec',
  'ssh:file:read',
  'ssh:file:write',
  'terminal:start',
  'terminal:write',
  'terminal:resize',
  'terminal:stop',
  'agent-endpoint:read',
  'agent-endpoint:create',
  'agent-endpoint:update',
  'agent-endpoint:delete',
  'agent:propose',
  'agent:execute-action',
  'app-manifest:read',
  'app-manifest:create',
  'app-manifest:update',
  'app-manifest:delete',
  'app-permission:read',
  'app-permission:grant',
  'app-permission:revoke',
  'storage:scoped',
  'bootstrap:preset:read',
  'bootstrap:preset:create',
  'bootstrap:preset:update',
  'bootstrap:preset:delete',
  'bootstrap:run:read',
  'bootstrap:run:create',
  'bootstrap:run:update',
  'bootstrap:run:delete',
  'bootstrap:generate',
  'command-history:read',
  'command-history:create',
  'command-history:delete',
  'settings:read',
  'settings:update',
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

const REQUIRED_HOST_GROUP_TAG_PARITY = new Map([
  ['ipc:host-group:list', 'hosted:GET:/api/host-groups'],
  ['ipc:host-group:get', 'hosted:GET:/api/host-groups/:id'],
  ['ipc:host-group:create', 'hosted:POST:/api/host-groups'],
  ['ipc:host-group:update', 'hosted:PATCH:/api/host-groups/:id'],
  ['ipc:host-group:delete', 'hosted:DELETE:/api/host-groups/:id'],
  ['ipc:host-tag:list', 'hosted:GET:/api/host-tags'],
  ['ipc:host-tag:get', 'hosted:GET:/api/host-tags/:id'],
  ['ipc:host-tag:create', 'hosted:POST:/api/host-tags'],
  ['ipc:host-tag:update', 'hosted:PATCH:/api/host-tags/:id'],
  ['ipc:host-tag:delete', 'hosted:DELETE:/api/host-tags/:id'],
]);

const REQUIRED_HOST_SECONDARY_ACTION_PARITY = new Map([
  ['ipc:host:updateGroup', 'hosted:PATCH:/api/hosts/:id/group'],
  ['ipc:host:setFavorite', 'hosted:PATCH:/api/hosts/:id/favorite'],
  ['ipc:host:duplicate', 'hosted:POST:/api/hosts/:id/duplicate'],
  ['ipc:host:import', 'hosted:POST:/api/hosts/import'],
]);

const REQUIRED_CREDENTIAL_REF_PARITY = new Map([
  ['ipc:credential-ref:list', 'hosted:GET:/api/credential-refs'],
  ['ipc:credential-ref:get', 'hosted:GET:/api/credential-refs/:id'],
  ['ipc:credential-ref:create', 'hosted:POST:/api/credential-refs'],
  ['ipc:credential-ref:update', 'hosted:PATCH:/api/credential-refs/:id'],
  ['ipc:credential-ref:delete', 'hosted:DELETE:/api/credential-refs/:id'],
]);

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
  if (!node) {
    return null;
  }
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

function parseParity(contract) {
  if (!(contract.parity && ts.isObjectLiteralExpression(contract.parity))) {
    return {};
  }
  const parityProps = findPropertyMap(contract.parity);
  return {
    kind: parseString(parityProps.get('kind')),
    peerRouteId: parseString(parityProps.get('peerRouteId')),
    reason: parseString(parityProps.get('reason')),
  };
}

function validateHostGroupTagParity(contracts) {
  const contractsById = new Map(contracts.map((contract) => [contract.id, contract]));
  for (const [ipcId, hostedId] of REQUIRED_HOST_GROUP_TAG_PARITY.entries()) {
    const ipcContract = contractsById.get(ipcId);
    if (!ipcContract) {
      fail(`Missing IPC host group/tag parity source contract ${ipcId}.`);
      continue;
    }
    const ipcParity = parseParity(ipcContract);
    if (ipcParity.kind !== 'paired' || ipcParity.peerRouteId !== hostedId) {
      fail(`IPC host group/tag contract ${ipcId} must be paired with ${hostedId}, not ${ipcParity.kind ?? 'missing parity'}.`);
    }
    if (ipcParity.kind === 'exception' || ipcParity.reason) {
      fail(`IPC host group/tag contract ${ipcId} still carries a hosted parity exception.`);
    }

    const hostedContract = contractsById.get(hostedId);
    if (!hostedContract) {
      fail(`Missing hosted host group/tag parity peer contract ${hostedId}.`);
      continue;
    }
    const hostedParity = parseParity(hostedContract);
    if (hostedParity.kind !== 'paired' || hostedParity.peerRouteId !== ipcId) {
      fail(`Hosted host group/tag contract ${hostedId} must be paired with ${ipcId}, not ${hostedParity.kind ?? 'missing parity'}.`);
    }
  }
}

function validateHostSecondaryActionParity(contracts) {
  const contractsById = new Map(contracts.map((contract) => [contract.id, contract]));
  for (const [ipcId, hostedId] of REQUIRED_HOST_SECONDARY_ACTION_PARITY.entries()) {
    const ipcContract = contractsById.get(ipcId);
    if (!ipcContract) {
      fail(`Missing IPC host secondary action parity source contract ${ipcId}.`);
      continue;
    }
    const ipcParity = parseParity(ipcContract);
    if (ipcParity.kind !== 'paired' || ipcParity.peerRouteId !== hostedId) {
      fail(`IPC host secondary action contract ${ipcId} must be paired with ${hostedId}, not ${ipcParity.kind ?? 'missing parity'}.`);
    }
    if (ipcParity.kind === 'exception' || ipcParity.reason) {
      fail(`IPC host secondary action contract ${ipcId} still carries a hosted parity exception.`);
    }

    const hostedContract = contractsById.get(hostedId);
    if (!hostedContract) {
      fail(`Missing hosted host secondary action parity peer contract ${hostedId}.`);
      continue;
    }
    const hostedParity = parseParity(hostedContract);
    if (hostedParity.kind !== 'paired' || hostedParity.peerRouteId !== ipcId) {
      fail(`Hosted host secondary action contract ${hostedId} must be paired with ${ipcId}, not ${hostedParity.kind ?? 'missing parity'}.`);
    }
  }
}

function validateCredentialRefParity(contracts) {
  const contractsById = new Map(contracts.map((contract) => [contract.id, contract]));
  for (const [ipcId, hostedId] of REQUIRED_CREDENTIAL_REF_PARITY.entries()) {
    const ipcContract = contractsById.get(ipcId);
    if (!ipcContract) {
      fail(`Missing IPC credential-ref parity source contract ${ipcId}.`);
      continue;
    }
    const ipcParity = parseParity(ipcContract);
    if (ipcParity.kind !== 'paired' || ipcParity.peerRouteId !== hostedId) {
      fail(`IPC credential-ref contract ${ipcId} must be paired with ${hostedId}, not ${ipcParity.kind ?? 'missing parity'}.`);
    }
    if (ipcParity.kind === 'exception' || ipcParity.reason) {
      fail(`IPC credential-ref contract ${ipcId} still carries a hosted parity exception.`);
    }

    const hostedContract = contractsById.get(hostedId);
    if (!hostedContract) {
      fail(`Missing hosted credential-ref parity peer contract ${hostedId}.`);
      continue;
    }
    const hostedParity = parseParity(hostedContract);
    if (hostedParity.kind !== 'paired' || hostedParity.peerRouteId !== ipcId) {
      fail(`Hosted credential-ref contract ${hostedId} must be paired with ${ipcId}, not ${hostedParity.kind ?? 'missing parity'}.`);
    }
  }
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
              || handlerText.includes('runAuditIpcRoute(')
              || handlerText.includes('runSshIpcRoute(')
              || handlerText.includes('runTerminalIpcRoute(')
              || handlerText.includes('runAgentEndpointIpcRoute(')
              || handlerText.includes('runAgentOperatorIpcRoute(')
              || handlerText.includes('runAppRouteIpc(')
              || handlerText.includes('runBootstrapRouteIpc(')
              || handlerText.includes('runCommandHistoryIpcRoute(')
              || handlerText.includes('runSettingsIpcRoute('),
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

  if (!switchboardApiText.includes('navigate: (route: string) => void;')
    || !preloadText.includes("navigate: (route: string): void => {")
    || !preloadText.includes("window.postMessage({ type: 'sb:navigate', route }, '*');")
    || !hostedApiText.includes('navigate: (route: string) => void;')
    || !hostedApiText.includes("navigate: (route: string): void => {")
    || !hostedApiText.includes("window.postMessage({ type: 'sb:navigate', route }, '*');")) {
    fail('Hosted browser API must expose window.navigate through the shell sb:navigate postMessage contract.');
  }

  if (REQUIRED_HOST_CONTRACTS.some((entry) => entry.id.includes('/api/credential-refs'))) {
    const credentialRefHelperIndex = hostedText.indexOf('private runHostedCredentialRefRoute');
    if (credentialRefHelperIndex === -1) {
      fail('Hosted credential-ref routes are not using runHostedCredentialRefRoute.');
    } else {
      const helperBody = hostedText.slice(credentialRefHelperIndex, credentialRefHelperIndex + 1800);
      if (!helperBody.includes('runHostRouteContract({')) {
        fail('Hosted credential-ref helper is not backed by runHostRouteContract.');
      }
    }
  }

  if (!hostedText.includes("if (resource === 'credential-refs')")
    || !hostedText.includes("contractId: 'hosted:GET:/api/credential-refs'")
    || !hostedText.includes("contractId: 'hosted:GET:/api/credential-refs/:id'")
    || !hostedText.includes("contractId: 'hosted:POST:/api/credential-refs'")
    || !hostedText.includes("contractId: 'hosted:PATCH:/api/credential-refs/:id'")
    || !hostedText.includes("contractId: 'hosted:DELETE:/api/credential-refs/:id'")
    || !hostedText.includes('this.options.store.listCredentialRefs()')
    || !hostedText.includes('this.options.store.getCredentialRef(refId)')
    || !hostedText.includes('this.options.store.createCredentialRef(input)')
    || !hostedText.includes('this.options.store.updateCredentialRef(refId, input)')
    || !hostedText.includes('this.options.store.deleteCredentialRef(refId)')) {
    fail('Hosted credential-ref routes must expose full metadata CRUD through route contracts and MvpSqliteStore.');
  }

  if (!hostedApiText.includes('credentialRef: {')
    || !hostedApiText.includes("request('/api/credential-refs')")
    || !hostedApiText.includes('/api/credential-refs/${encodeURIComponent(id)}')
    || !hostedApiText.includes("request('/api/credential-refs', { method: 'POST'")
    || !hostedApiText.includes("method: 'PATCH', body: input")
    || !hostedApiText.includes("method: 'DELETE'")) {
    fail('Hosted browser API must expose credentialRef metadata CRUD methods.');
  }

  if (!switchboardApiText.includes('credentialRef: {')
    || !preloadText.includes('credentialRef: {')) {
    fail('Desktop preload and SwitchboardApi must expose credentialRef metadata CRUD methods.');
  }

  if (!contractText.includes('credentialRefNameLogged: false')
    || !contractText.includes('credentialReferenceValueLogged: false')
    || !contractText.includes('credentialRefMetadataLogged: false')
    || !contractText.includes('rawCredentialMaterialLogged: false')
    || !contractText.includes('storesSecretMaterial: false')
    || !contractText.includes('osKeychainAccess: false')
    || !contractText.includes('sshAgentAccess: false')
    || !hostedText.includes('credentialRefRouteSuccessMetadata')
    || !hostedText.includes('credentialRefMetadataKeyCount')
    || !hostedText.includes('credentialReferenceValueLogged: false')
    || !hostedText.includes('rawCredentialMaterialLogged: false')
    || !hostedText.includes('secretsLogged: false')) {
    fail('Hosted credential-ref routes must keep sanitized non-secret metadata audit state.');
  }

  if (contractText.includes('hosted:POST:/api/secrets')
    || contractText.includes('hosted:GET:/api/secrets')
    || contractText.includes('hosted:DELETE:/api/secrets')
    || hostedText.includes("resource === 'secrets'")
    || hostedText.includes('/api/secrets')
    || hostedApiText.includes("request('/api/secrets")
    || hostedApiText.includes('request(`/api/secrets')) {
    fail('Hosted secret APIs are forbidden for credential-ref hosted parity.');
  }

  if (REQUIRED_HOST_CONTRACTS.some((entry) => REQUIRED_HOST_SECONDARY_ACTION_PARITY.has(entry.id)
    || [...REQUIRED_HOST_SECONDARY_ACTION_PARITY.values()].includes(entry.id))) {
    const hostActionHelperIndex = hostedText.indexOf('private runHostedHostActionRoute');
    if (hostActionHelperIndex === -1) {
      fail('Hosted host secondary action routes are not using runHostedHostActionRoute.');
    } else {
      const helperBody = hostedText.slice(hostActionHelperIndex, hostActionHelperIndex + 1800);
      if (!helperBody.includes('runHostRouteContract({')) {
        fail('Hosted host secondary action helper is not backed by runHostRouteContract.');
      }
    }
  }

  if (!hostedText.includes("contractId: 'hosted:PATCH:/api/hosts/:id/group'")
    || !hostedText.includes("contractId: 'hosted:PATCH:/api/hosts/:id/favorite'")
    || !hostedText.includes("contractId: 'hosted:POST:/api/hosts/:id/duplicate'")
    || !hostedText.includes("contractId: 'hosted:POST:/api/hosts/import'")
    || !hostedText.includes("this.options.store.assignHostToGroup(hostId, groupName)")
    || !hostedText.includes("this.options.store.setHostFavorite(hostId, favorite)")
    || !hostedText.includes('this.options.store.duplicateHost(hostId)')
    || !hostedText.includes('this.options.store.importHosts(input)')) {
    fail('Hosted host secondary action routes must dispatch updateGroup, setFavorite, duplicate, and import through route contracts.');
  }

  if (!hostedApiText.includes('updateGroup: (id: string, groupName: string)')
    || !hostedApiText.includes('/api/hosts/${encodeURIComponent(id)}/group')
    || !hostedApiText.includes('setFavorite: (id: string, favorite: boolean)')
    || !hostedApiText.includes('/api/hosts/${encodeURIComponent(id)}/favorite')
    || !hostedApiText.includes('/api/hosts/${encodeURIComponent(id)}/duplicate')
    || !hostedApiText.includes('/api/hosts/import')) {
    fail('Hosted browser API must expose host updateGroup, setFavorite, duplicate, and import methods.');
  }

  if (!hostedText.includes('hostSecondaryActionRouteSuccessMetadata')
    || !hostedText.includes('hostImportRouteSuccessMetadata')
    || !hostedText.includes('hostRecordLogged: false')
    || !hostedText.includes('hostRecordsLogged: false')
    || !hostedText.includes('hostCredentialsLogged: false')
    || !hostedText.includes('hostNameLogged: false')
    || !hostedText.includes('hostAddressLogged: false')
    || !hostedText.includes('importedHostIdsLogged: false')
    || !hostedText.includes('secretsLogged: false')) {
    fail('Hosted host secondary action routes must keep sanitized success audit metadata.');
  }

  if (REQUIRED_HOST_CONTRACTS.some((entry) => entry.id.includes('/api/host-groups') || entry.id.includes('/api/host-tags'))) {
    const hostOrganizationHelperIndex = hostedText.indexOf('private runHostedHostOrganizationRoute');
    if (hostOrganizationHelperIndex === -1) {
      fail('Hosted host group/tag routes are not using runHostedHostOrganizationRoute.');
    } else {
      const helperBody = hostedText.slice(hostOrganizationHelperIndex, hostOrganizationHelperIndex + 1800);
      if (!helperBody.includes('runHostRouteContract({')) {
        fail('Hosted host group/tag helper is not backed by runHostRouteContract.');
      }
    }
  }

  if (!hostedText.includes("if (resource === 'host-groups')")
    || !hostedText.includes("if (resource === 'host-tags')")
    || !hostedText.includes("contractId: 'hosted:GET:/api/host-groups'")
    || !hostedText.includes("contractId: 'hosted:POST:/api/host-groups'")
    || !hostedText.includes("contractId: 'hosted:GET:/api/host-groups/:id'")
    || !hostedText.includes("contractId: 'hosted:PATCH:/api/host-groups/:id'")
    || !hostedText.includes("contractId: 'hosted:DELETE:/api/host-groups/:id'")
    || !hostedText.includes("contractId: 'hosted:GET:/api/host-tags'")
    || !hostedText.includes("contractId: 'hosted:POST:/api/host-tags'")
    || !hostedText.includes("contractId: 'hosted:GET:/api/host-tags/:id'")
    || !hostedText.includes("contractId: 'hosted:PATCH:/api/host-tags/:id'")
    || !hostedText.includes("contractId: 'hosted:DELETE:/api/host-tags/:id'")) {
    fail('Hosted host group/tag CRUD routes must expose all ten route-contract dispatches.');
  }

  if (!hostedApiText.includes('hostGroup: {')
    || !hostedApiText.includes("request('/api/host-groups')")
    || !hostedApiText.includes('/api/host-groups/${encodeURIComponent(id)}')
    || !hostedApiText.includes("request('/api/host-groups', { method: 'POST'")
    || !hostedApiText.includes('hostTag: {')
    || !hostedApiText.includes("request('/api/host-tags')")
    || !hostedApiText.includes('/api/host-tags/${encodeURIComponent(id)}')
    || !hostedApiText.includes("request('/api/host-tags', { method: 'POST'")) {
    fail('Hosted browser API must expose hostGroup and hostTag CRUD methods.');
  }

  if (!switchboardApiText.includes('hostGroup: {')
    || !switchboardApiText.includes('hostTag: {')
    || !preloadText.includes('hostGroup: {')
    || !preloadText.includes('hostTag: {')) {
    fail('Desktop preload and SwitchboardApi must expose hostGroup and hostTag CRUD methods.');
  }

  if (!hostedText.includes('hostGroupRouteSuccessMetadata')
    || !hostedText.includes('hostTagRouteSuccessMetadata')
    || !hostedText.includes('hostRecordsLogged: false')
    || !hostedText.includes('hostCredentialsLogged: false')
    || !hostedText.includes('hostGroupNameLogged: false')
    || !hostedText.includes('hostTagNameLogged: false')
    || !hostedText.includes('secretsLogged: false')) {
    fail('Hosted host group/tag routes must keep sanitized success audit metadata.');
  }

  if (hostedText.includes('return this.options.store.listHostGroups();')
    || hostedText.includes('return this.options.store.getHostGroup(')
    || hostedText.includes('return this.options.store.createHostGroup(')
    || hostedText.includes('return this.options.store.updateHostGroup(')
    || hostedText.includes('return this.options.store.deleteHostGroup(')
    || hostedText.includes('return this.options.store.listHostTags();')
    || hostedText.includes('return this.options.store.getHostTag(')
    || hostedText.includes('return this.options.store.createHostTag(')
    || hostedText.includes('return this.options.store.updateHostTag(')
    || hostedText.includes('return this.options.store.deleteHostTag(')) {
    fail('Direct hosted host group/tag store fallback detected in hosted-server.ts.');
  }

  if (REQUIRED_HOST_CONTRACTS.some((entry) => entry.id.includes('/api/workspace-files') || entry.id.includes('/api/workspace-artifacts'))) {
    const workspaceHelperIndex = hostedText.indexOf('runHostedWorkspaceFileRoute');
    if (workspaceHelperIndex === -1) {
      fail('Hosted workspace file/artifact routes are not using runHostedWorkspaceFileRoute.');
    } else {
      const helperBody = hostedText.slice(workspaceHelperIndex, workspaceHelperIndex + 1600);
      if (!helperBody.includes('runHostRouteContract({')) {
        fail('Hosted workspace file/artifact helper is not backed by runHostRouteContract.');
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

  if (REQUIRED_HOST_CONTRACTS.some((entry) => entry.id.includes('/api/ssh/'))) {
    const sshHelperIndex = hostedText.indexOf('private runHostedSshRoute');
    if (sshHelperIndex === -1) {
      fail('Hosted SSH routes are not using runHostedSshRoute.');
    } else {
      const helperBody = hostedText.slice(sshHelperIndex, sshHelperIndex + 1800);
      if (!helperBody.includes('runHostRouteContract({')) {
        fail('Hosted SSH helper is not backed by runHostRouteContract.');
      }
    }
  }

  if (REQUIRED_HOST_CONTRACTS.some((entry) => entry.id.includes('/api/terminal/'))) {
    const terminalHelperIndex = hostedText.indexOf('private runHostedTerminalRoute');
    if (terminalHelperIndex === -1) {
      fail('Hosted terminal routes are not using runHostedTerminalRoute.');
    } else {
      const helperBody = hostedText.slice(terminalHelperIndex, terminalHelperIndex + 1800);
      if (!helperBody.includes('runHostRouteContract({')) {
        fail('Hosted terminal helper is not backed by runHostRouteContract.');
      }
    }
  }

  if (REQUIRED_HOST_CONTRACTS.some((entry) => entry.id.includes('/api/agent-endpoints'))) {
    const agentEndpointHelperIndex = hostedText.indexOf('private runHostedAgentEndpointRoute');
    if (agentEndpointHelperIndex === -1) {
      fail('Hosted agent endpoint routes are not using runHostedAgentEndpointRoute.');
    } else {
      const helperBody = hostedText.slice(agentEndpointHelperIndex, agentEndpointHelperIndex + 1800);
      if (!helperBody.includes('runHostRouteContract({')) {
        fail('Hosted agent endpoint helper is not backed by runHostRouteContract.');
      }
    }
  }

  if (REQUIRED_HOST_CONTRACTS.some((entry) => entry.id.includes('/api/agent/'))) {
    const agentOperatorHelperIndex = hostedText.indexOf('private runHostedAgentOperatorRoute');
    if (agentOperatorHelperIndex === -1) {
      fail('Hosted agent operator routes are not using runHostedAgentOperatorRoute.');
    } else {
      const helperBody = hostedText.slice(agentOperatorHelperIndex, agentOperatorHelperIndex + 1800);
      if (!helperBody.includes('runHostRouteContract({')) {
        fail('Hosted agent operator helper is not backed by runHostRouteContract.');
      }
    }
  }

  if (!mainText.includes("'workspace-artifact-content:get'")
    || !mainText.includes("'workspace-artifact-content:update'")
    || !mainText.includes('validateWorkspaceArtifactContentGetInput')
    || !mainText.includes('validateWorkspaceArtifactContentUpdateInput')) {
    fail('IPC workspace artifact content routes must expose validated get/update handlers in main.ts.');
  }

  if (!hostedText.includes("if (resource === 'workspace-artifacts')")
    || !hostedText.includes("contractId: 'hosted:GET:/api/workspace-artifacts/content'")
    || !hostedText.includes("contractId: 'hosted:PUT:/api/workspace-artifacts/content'")) {
    fail('Hosted workspace artifact content routes must expose /api/workspace-artifacts/content with route contracts.');
  }

  if (!preloadText.includes('workspaceArtifactContent: {')
    || !preloadText.includes("invoke('workspace-artifact-content:get'")
    || !preloadText.includes("invoke('workspace-artifact-content:update'")) {
    fail('Preload API must expose workspaceArtifactContent get/update IPC routes.');
  }

  if (!switchboardApiText.includes('workspaceArtifactContent: {')
    || !hostedApiText.includes('workspaceArtifactContent: {')
    || !hostedApiText.includes('/api/workspace-artifacts/content')) {
    fail('SwitchboardApi and hosted-api must expose structured workspaceArtifactContent methods.');
  }

  if (!contractText.includes('workspace-artifact-content-route')
    || !contractText.includes('artifactContentLogged: false')
    || !contractText.includes('manifestLogged: false')
    || !mainText.includes('artifactContentLogged: false')
    || !hostedText.includes('artifactContentLogged: false')) {
    fail('Workspace artifact content routes must keep sanitized audit metadata and never log raw content or manifests.');
  }

  if (!mainText.includes("'workspace-scriptlet:run'")
    || !mainText.includes('validateWorkspaceScriptletRunInput')
    || !mainText.includes('workspaceScriptletRunRouteSuccessMetadata')) {
    fail('IPC workspace scriptlet run route must expose validated, sanitized backend execution.');
  }

  if (!hostedText.includes("contractId: 'hosted:POST:/api/workspace-scriptlets/run'")
    || !hostedText.includes('/api/workspace-scriptlets/run')
    || !hostedText.includes('workspaceScriptletRunRouteSuccessMetadata')) {
    fail('Hosted workspace scriptlet run route must expose route-contract execution and sanitized audit metadata.');
  }

  if (!preloadText.includes('workspaceScriptlet: {')
    || !preloadText.includes("invoke('workspace-scriptlet:run'")) {
    fail('Preload API must expose workspaceScriptlet.run IPC route.');
  }

  if (!switchboardApiText.includes('workspaceScriptlet: {')
    || !hostedApiText.includes('workspaceScriptlet: {')
    || !hostedApiText.includes('/api/workspace-scriptlets/run')) {
    fail('SwitchboardApi and hosted-api must expose structured workspaceScriptlet.run methods.');
  }

  if (!contractText.includes('workspace-scriptlet-route')
    || !contractText.includes('scriptLogged: false')
    || !contractText.includes('commandTextLogged: false')
    || !contractText.includes('commandOutputLogged: false')) {
    fail('Workspace scriptlet run routes must keep sanitized audit metadata and never log raw script or command output.');
  }

  if (REQUIRED_HOST_CONTRACTS.some((entry) => entry.id.includes('/api/app-manifests')
    || entry.id.includes('/api/app-permissions')
    || entry.id.includes('/api/app-storage')
    || entry.id.includes('/api/app-host'))) {
    const appHelperIndex = hostedText.indexOf('private runHostedAppRoute');
    if (appHelperIndex === -1) {
      fail('Hosted app manifest/permission/storage routes are not using runHostedAppRoute.');
    } else {
      const helperBody = hostedText.slice(appHelperIndex, appHelperIndex + 1800);
      if (!helperBody.includes('runHostRouteContract({')) {
        fail('Hosted app helper is not backed by runHostRouteContract.');
      }
    }
  }

  if (REQUIRED_HOST_CONTRACTS.some((entry) => entry.id.includes('/api/bootstrap/'))) {
    const bootstrapHelperIndex = hostedText.indexOf('private runHostedBootstrapRoute');
    if (bootstrapHelperIndex === -1) {
      fail('Hosted bootstrap routes are not using runHostedBootstrapRoute.');
    } else {
      const helperBody = hostedText.slice(bootstrapHelperIndex, bootstrapHelperIndex + 1800);
      if (!helperBody.includes('runHostRouteContract({')) {
        fail('Hosted bootstrap helper is not backed by runHostRouteContract.');
      }
    }

    if (!hostedApiText.includes('bootstrapPreset: {')
      || !hostedApiText.includes("request('/api/bootstrap/persisted-presets')")
      || !hostedApiText.includes('/api/bootstrap/persisted-presets/${encodeURIComponent(id)}')
      || !hostedApiText.includes("request('/api/bootstrap/persisted-presets', { method: 'POST'")
      || !hostedApiText.includes('bootstrapRun: {')
      || !hostedApiText.includes("request('/api/bootstrap/runs')")
      || !hostedApiText.includes('/api/bootstrap/runs/${encodeURIComponent(id)}')
      || !hostedApiText.includes("request('/api/bootstrap/runs', { method: 'POST'")) {
      fail('Hosted browser API must expose bootstrapPreset and bootstrapRun CRUD methods.');
    }

    if (!switchboardApiText.includes('bootstrapPreset: {')
      || !switchboardApiText.includes('bootstrapRun: {')
      || !preloadText.includes('bootstrapPreset: {')
      || !preloadText.includes('bootstrapRun: {')) {
      fail('Desktop preload and SwitchboardApi must expose bootstrapPreset and bootstrapRun CRUD methods.');
    }
  }

  if (REQUIRED_HOST_CONTRACTS.some((entry) => entry.id.includes('/api/command-history'))) {
    const commandHistoryHelperIndex = hostedText.indexOf('private runHostedCommandHistoryRoute');
    if (commandHistoryHelperIndex === -1) {
      fail('Hosted command-history routes are not using runHostedCommandHistoryRoute.');
    } else {
      const helperBody = hostedText.slice(commandHistoryHelperIndex, commandHistoryHelperIndex + 1800);
      if (!helperBody.includes('runHostRouteContract({')) {
        fail('Hosted command-history helper is not backed by runHostRouteContract.');
      }
    }

    if (!hostedApiText.includes('commandHistory: {')
      || !hostedApiText.includes('get: (id: string) => request(`/api/command-history/${encodeURIComponent(id)}`)')) {
      fail('Hosted API must expose commandHistory.get through /api/command-history/:id.');
    }

    if (!hostedText.includes('validateCommandHistoryListLimitInput')
      || !hostedText.includes("const limitParam = url.searchParams.get('limit');")
      || !hostedText.includes('limitParam === null ? undefined : Number(limitParam)')
      || !hostedText.includes('execute: () => this.options.store.listCommandHistory(validatedLimit)')) {
      fail('Hosted command-history list must validate and pass the optional limit query to the store.');
    }

    if (!hostedApiText.includes('list: (limit?: number) => {')
      || !hostedApiText.includes("?limit=${encodeURIComponent(String(limit))}")
      || !hostedApiText.includes('return request(`/api/command-history${query}`);')) {
      fail('Hosted browser API commandHistory.list must preserve the optional limit argument.');
    }

    if (!preloadText.includes("invoke('command-history:get', id)")
      || !preloadText.includes('get: (id: string) => Promise<CommandHistoryEntry | null>;')
      || !switchboardApiText.includes('get: (id: string) => Promise<CommandHistoryEntry | null>')) {
      fail('Preload and SwitchboardApi must expose commandHistory.get through IPC.');
    }

    if (!contractText.includes("id: 'ipc:command-history:get'")
      || !contractText.includes("id: 'hosted:GET:/api/command-history/:id'")
      || !contractText.includes("eventType: 'command_history.read'")
      || !contractText.includes('mutatingOperation: false')
      || !contractText.includes('commandLogged: false')
      || !contractText.includes('commandOutputLogged: false')) {
      fail('Command-history read routes must declare paired sanitized route contracts.');
    }
  }

  if (REQUIRED_HOST_CONTRACTS.some((entry) => entry.id.includes('/api/settings'))) {
    const settingsHelperIndex = hostedText.indexOf('private runHostedSettingsRoute');
    if (settingsHelperIndex === -1) {
      fail('Hosted settings routes are not using runHostedSettingsRoute.');
    } else {
      const helperBody = hostedText.slice(settingsHelperIndex, settingsHelperIndex + 1800);
      if (!helperBody.includes('runHostRouteContract({')) {
        fail('Hosted settings helper is not backed by runHostRouteContract.');
      }
    }
  }

  if (hostedText.includes("requireHostedCapability(request, session, 'host-operation:run'")) {
    fail('Hosted route still uses requireHostedCapability for host-operation:run instead of host route contract enforcement.');
  }

  if (hostedText.includes('this.options.hostOperations.run(validateHostOperationInput(body))')) {
    fail('Direct hosted host-operation fallback detected in hosted-server.ts. All host operation runs must execute through runHostRouteContract.');
  }

  if (hostedText.includes("requireHostedCapability(request, session, 'ssh:exec'")) {
    fail('Hosted route still uses requireHostedCapability for ssh:exec instead of SSH route contract enforcement.');
  }

  if (hostedText.includes('this.options.sshService.exec(validateSshExecInput(body))')) {
    fail('Direct hosted SSH exec fallback detected in hosted-server.ts. SSH exec must execute through runHostRouteContract.');
  }

  if (hostedText.includes('this.options.sshService.listDir(validateSshFileListInput(body))')
    || hostedText.includes('this.options.sshService.stat(validateSshFileStatInput(body))')
    || hostedText.includes('this.options.sshService.download(validateSshFileTransferInput(body))')
    || hostedText.includes('this.options.sshService.upload(validateSshFileTransferInput(body))')
    || hostedText.includes('this.options.sshService.delete(validateSshFileDeleteInput(body))')
    || hostedText.includes('this.options.sshService.move(validateSshFileMoveInput(body))')) {
    fail('Direct hosted SSH file fallback detected in hosted-server.ts. SSH file provider routes must execute through runHostRouteContract.');
  }

  if (mainText.includes("policyService.assertAllowed('ssh:exec'")) {
    fail('IPC ssh:exec still uses direct policyService.assertAllowed instead of SSH route contract enforcement.');
  }

  if (mainText.includes("policyService.assertAllowed('host:file:")
    || mainText.includes("policyService.assertAllowed('ssh:file:")) {
    fail('IPC SSH file routes must use route contract enforcement instead of direct policyService.assertAllowed.');
  }

  if (mainText.includes("ipcMain.handle('ssh-file:list', async (_event, input) => sshService.listDir")
    || mainText.includes("ipcMain.handle('ssh-file:stat', async (_event, input) => sshService.stat")
    || mainText.includes("ipcMain.handle('ssh-file:download', async (_event, input) => sshService.download")
    || mainText.includes("ipcMain.handle('ssh-file:upload', async (_event, input) => sshService.upload")
    || mainText.includes("ipcMain.handle('ssh-file:delete', async (_event, input) => sshService.delete")
    || mainText.includes("ipcMain.handle('ssh-file:move', async (_event, input) => sshService.move")) {
    fail('Direct IPC SSH file fallback detected in main.ts. SSH file routes must execute through runHostRouteContract.');
  }

  if (!hostedText.includes("if (resource === 'ssh-files')")) {
    fail('Hosted SSH file provider namespace /api/ssh-files is missing.');
  }

  if (!mainText.includes("ipcMain.handle('ssh-file:list'")
    || !mainText.includes("ipcMain.handle('ssh-file:stat'")
    || !mainText.includes("ipcMain.handle('ssh-file:download'")
    || !mainText.includes("ipcMain.handle('ssh-file:upload'")
    || !mainText.includes("ipcMain.handle('ssh-file:delete'")
    || !mainText.includes("ipcMain.handle('ssh-file:move'")) {
    fail('IPC SSH file provider handlers for list/stat/download/upload/delete/move are missing.');
  }

  if (!hostedText.includes("contractId: 'hosted:POST:/api/ssh-files/list'")
    || !hostedText.includes("contractId: 'hosted:POST:/api/ssh-files/stat'")
    || !hostedText.includes("contractId: 'hosted:POST:/api/ssh-files/download'")
    || !hostedText.includes("contractId: 'hosted:POST:/api/ssh-files/upload'")
    || !hostedText.includes("contractId: 'hosted:POST:/api/ssh-files/delete'")
    || !hostedText.includes("contractId: 'hosted:POST:/api/ssh-files/move'")) {
    fail('Hosted SSH file provider routes must reference all route contracts.');
  }

  if (!preloadText.includes('sshFile: {')
    || !preloadText.includes("invoke('ssh-file:list'")
    || !preloadText.includes("invoke('ssh-file:stat'")
    || !preloadText.includes("invoke('ssh-file:download'")
    || !preloadText.includes("invoke('ssh-file:upload'")
    || !preloadText.includes("invoke('ssh-file:delete'")
    || !preloadText.includes("invoke('ssh-file:move'")) {
    fail('Preload API must expose sshFile list/stat/download/upload/delete/move IPC routes.');
  }

  if (!switchboardApiText.includes('sshFile: {')
    || !hostedApiText.includes('sshFile: {')
    || !hostedApiText.includes("request('/api/ssh-files/list'")
    || !hostedApiText.includes("request('/api/ssh-files/stat'")
    || !hostedApiText.includes("request('/api/ssh-files/download'")
    || !hostedApiText.includes("request('/api/ssh-files/upload'")
    || !hostedApiText.includes("request('/api/ssh-files/delete'")
    || !hostedApiText.includes("request('/api/ssh-files/move'")) {
    fail('SwitchboardApi and hosted-api must expose structured sshFile provider methods.');
  }

  const filesBranchStart = hostOperationsText.indexOf("if (this.mode === 'files')");
  const filesBranchEnd = filesBranchStart === -1 ? -1 : hostOperationsText.indexOf('} else {', filesBranchStart);
  const filesBranch = filesBranchStart === -1 || filesBranchEnd === -1
    ? ''
    : hostOperationsText.slice(filesBranchStart, filesBranchEnd);
  if (!filesBranch.includes('api.sshFile.list')) {
    fail('File Browser files mode must use the structured sshFile.list provider API.');
  }
  if (filesBranch.includes('api.hostOperations.run')) {
    fail('File Browser files mode must not use hostOperations.run command-string inspection.');
  }
  const remoteScpTargetStart = sshServiceText.indexOf('function remoteScpTarget');
  const remoteScpTargetBody = remoteScpTargetStart === -1
    ? ''
    : sshServiceText.slice(remoteScpTargetStart, remoteScpTargetStart + 500);
  if (remoteScpTargetBody.includes('shellQuote(remotePath)')) {
    fail('SCP transfer targets must not embed shellQuote(remotePath) into spawn argv; it becomes a literal remote filename.');
  }
  for (const method of ['stat', 'download', 'upload', 'delete', 'move']) {
    if (!hostOperationsText.includes(`api.sshFile.${method}`)) {
      fail(`File Browser files mode must expose sshFile.${method} through the structured provider API.`);
    }
  }
  for (const marker of [
    'data-testid="ssh-file-actions"',
    'data-testid="ssh-file-stat-action"',
    'data-testid="ssh-file-download-action"',
    'data-testid="ssh-file-upload-action"',
    'data-testid="ssh-file-delete-action"',
    'data-testid="ssh-file-move-action"',
    'data-testid="ssh-file-move-target-path"',
    'data-selected-path',
    'data-stat-provider-route',
    'data-download-provider-route',
    'data-upload-provider-route',
    'data-delete-provider-route',
    'data-move-provider-route',
    'data-delete-status',
    'data-move-status',
    'data-delete-confirmation',
    'data-delete-result-deleted',
    'data-move-result-moved',
    'data-move-target-path',
    'data-transfer-direction',
    'data-transfer-status',
  ]) {
    if (!hostOperationsText.includes(marker)) {
      fail(`File Browser SSH transfer UI is missing stable route/state marker ${marker}.`);
    }
  }
  for (const forbidden of [
    'showOpenFilePicker',
    'showSaveFilePicker',
    'window.fs',
    'require(\'node:fs\')',
    'require("node:fs")',
    'localStorage',
    'rm -f',
    'rm -rf',
    'mv --',
    'hostOperations.run({',
  ]) {
    if (hostOperationsText.includes(forbidden)) {
      fail(`File Browser SSH transfer UI must not use renderer filesystem or local persistence shortcut ${forbidden}.`);
    }
  }

  if (hostedText.includes("requireHostedCapability(request, session, 'terminal:")) {
    fail('Hosted terminal routes still use requireHostedCapability instead of terminal route contract enforcement.');
  }

  if (hostedText.includes("this.options.terminalSessions.start(validateTerminalStartInput")) {
    fail('Direct hosted terminal start fallback detected in hosted-server.ts.');
  }

  if (hostedText.includes('return this.options.terminalSessions.write(')
    || hostedText.includes('return this.options.terminalSessions.resize(')
    || hostedText.includes('return this.options.terminalSessions.stop(')) {
    fail('Direct hosted terminal mutation fallback detected in hosted-server.ts.');
  }

  if (mainText.includes("policyService.assertAllowed('terminal:")) {
    fail('IPC terminal routes still use direct policyService.assertAllowed instead of terminal route contract enforcement.');
  }

  if (hostedText.includes("if (resource === 'agent-endpoints') {\n      if (method !== 'GET') {")) {
    fail('Hosted agent endpoint routes still use direct requireHostedCapability gating instead of route contract enforcement.');
  }

  if (hostedText.includes('return this.options.store.listAgentEndpoints();')
    || hostedText.includes('return this.options.store.createAgentEndpoint(asRecord(body) as CreateAgentEndpointInput);')
    || hostedText.includes('return this.options.store.updateAgentEndpoint(decodeURIComponent(action), asRecord(body) as UpdateAgentEndpointInput);')
    || hostedText.includes('return this.options.store.deleteAgentEndpoint(decodeURIComponent(action));')) {
    fail('Direct hosted agent endpoint fallback detected in hosted-server.ts.');
  }

  if (hostedText.includes('return this.options.agentOperator.propose(validateOperatorProposeInput(body));')) {
    fail('Direct hosted agent operator fallback detected in hosted-server.ts.');
  }

  if (mainText.includes("ipcMain.handle('agent-endpoint:list', async () => mvpStore.listAgentEndpoints())")
    || mainText.includes('mvpStore.getAgentEndpoint(endpointId)')
    || mainText.includes('return mvpStore.createAgentEndpoint(input);')
    || mainText.includes('return mvpStore.updateAgentEndpoint(endpointId, input);')
    || mainText.includes('return mvpStore.deleteAgentEndpoint(endpointId);')) {
    fail('Direct IPC agent endpoint fallback detected in main.ts.');
  }

  if (mainText.includes('agentOperator.propose(validateOperatorProposeInput(input))')) {
    fail('Direct IPC agent operator fallback detected in main.ts.');
  }

  if (hostedText.includes('this.options.agentOperator.executeApprovedAction(validateOperatorActionExecuteInput(body)')) {
    fail('Direct hosted agent operator execution fallback detected in hosted-server.ts.');
  }

  if (mainText.includes('agentOperator.executeApprovedAction(validateOperatorActionExecuteInput(input)')) {
    fail('Direct IPC agent operator execution fallback detected in main.ts.');
  }

  const approveStart = agentsText.indexOf('async approveAndDispatch');
  const approveEnd = approveStart === -1 ? -1 : agentsText.indexOf('\n  formatDate', approveStart);
  const approveBody = approveStart === -1 || approveEnd === -1 ? '' : agentsText.slice(approveStart, approveEnd);

  if (!approveBody.includes('api.agent.executeAction')) {
    fail('Agents approved Operator flow must call the structured agent execution API.');
  }

  if (approveBody.includes('api.terminal.write(')) {
    fail('Agents approved Operator flow must not dispatch proposals through api.terminal.write.');
  }

  if (approveBody.includes('api.audit.log(')
    || approveBody.includes('agent.command.dispatched')
    || approveBody.includes('${proposal.command}')) {
    fail('Agents approved Operator flow must not client-audit raw proposed command strings.');
  }

  if (hostedText.includes('return this.options.store.listAppManifests();')
    || hostedText.includes('return this.options.store.createAppManifest(asRecord(body) as CreateAppManifestInput);')
    || hostedText.includes('return this.options.store.updateAppManifest(decodeURIComponent(action), asRecord(body) as UpdateAppManifestInput);')
    || hostedText.includes('return this.options.store.deleteAppManifest(decodeURIComponent(action));')
    || hostedText.includes('return this.options.store.listAppPermissions(url.searchParams.get')
    || hostedText.includes('return this.options.store.createAppPermission(asRecord(body) as CreateAppPermissionInput);')
    || hostedText.includes('return this.options.store.deleteAppPermission(decodeURIComponent(action));')) {
    fail('Direct hosted app manifest/permission fallback detected in hosted-server.ts.');
  }

  if (hostedText.includes("if (resource === 'app-manifests') {\n      if (method !== 'GET') {")
    || hostedText.includes("if (resource === 'app-permissions') {\n      if (method !== 'GET') {")) {
    fail('Hosted app manifest/permission routes still use direct settings:update gating instead of app route contract enforcement.');
  }

  if (mainText.includes("ipcMain.handle('app-manifest:list', async () => mvpStore.listAppManifests())")
    || mainText.includes('mvpStore.getAppManifest(manifestId)')
    || mainText.includes('return mvpStore.createAppManifest(input);')
    || mainText.includes('return mvpStore.updateAppManifest(manifestId, input);')
    || mainText.includes('return mvpStore.deleteAppManifest(manifestId);')
    || mainText.includes('mvpStore.listAppPermissions(appId)')
    || mainText.includes('return mvpStore.createAppPermission(input);')
    || mainText.includes('return mvpStore.deleteAppPermission(permissionId);')) {
    fail('Direct IPC app manifest/permission fallback detected in main.ts.');
  }

  if (hostedText.includes("if (resource === 'app-storage') {\n      return this.options.store.")) {
    fail('Direct hosted app scoped storage fallback detected in hosted-server.ts.');
  }

  if (mainText.includes("ipcMain.handle('app-storage:get', async (_event, input) => mvpStore.getAppScopedStorage(input))")
    || mainText.includes("ipcMain.handle('app-storage:set', async (_event, input) => mvpStore.setAppScopedStorage(input))")
    || mainText.includes("ipcMain.handle('app-storage:delete', async (_event, input) => mvpStore.deleteAppScopedStorage(input))")) {
    fail('Direct IPC app scoped storage fallback detected in main.ts.');
  }

  if (!mainText.includes('assertAppScopedStorageGranted(validatedInput')) {
    fail('IPC app scoped storage routes must enforce granted storage:scoped capability in main.ts.');
  }

  if (!hostedText.includes('this.assertAppScopedStorageGranted(input')) {
    fail('Hosted app scoped storage routes must enforce granted storage:scoped capability in hosted-server.ts.');
  }

  if (hostedText.includes("if (resource === 'app-host') {\n      return this.options.store.")) {
    fail('Direct hosted generated app host SDK fallback detected in hosted-server.ts.');
  }

  if (mainText.includes("ipcMain.handle('app-host:list', async (_event, input) => mvpStore.listHosts()")
    || mainText.includes("ipcMain.handle('app-host:get', async (_event, input) => mvpStore.getHost(")
    || mainText.includes("ipcMain.handle('app-host:test-connection', async (_event, input) => mvpStore.testConnection(")
    || mainText.includes("ipcMain.handle('app-host:exec', async (_event, input) => sshService.exec(")) {
    fail('Direct IPC generated app host SDK fallback detected in main.ts.');
  }

  if (!mainText.includes('assertGeneratedAppHostCapabilityGranted(validatedInput')) {
    fail('IPC generated app host SDK routes must enforce granted host app capability in main.ts.');
  }

  if (!hostedText.includes('this.assertGeneratedAppHostCapabilityGranted(input')) {
    fail('Hosted generated app host SDK routes must enforce granted host app capability in hosted-server.ts.');
  }

  if (generatedRuntimeText.includes('api.host.list(')
    || generatedRuntimeText.includes('api.host.get(')
    || generatedRuntimeText.includes('api.host.testConnection(')
    || generatedRuntimeText.includes('api.ssh.exec(')) {
    fail('Generated app runtime host SDK must call structured appHost API, not generic host API.');
  }

  if (generatedRuntimeText.includes("requireCapability('host:")) {
    fail('Generated app runtime must not rely on renderer-side grantedCapabilities for host SDK authorization.');
  }

  if (!generatedRuntimeText.includes('api.appHost.listHosts')
    || !generatedRuntimeText.includes('api.appHost.getHost')
    || !generatedRuntimeText.includes('api.appHost.getHostStatus')
    || !generatedRuntimeText.includes('api.appHost.getCapabilities')
    || !generatedRuntimeText.includes('api.appHost.testConnection')
    || !generatedRuntimeText.includes('api.appHost.exec')) {
    fail('Generated app runtime must call structured appHost API for host SDK operations.');
  }

  if (!generatedRuntimeText.includes("exec: (hostId, command, options) => __sdkRequest('host:exec'")
    || !generatedRuntimeText.includes("message.method === 'host:exec'")
    || !generatedRuntimeText.includes('sdkHostExecPayload(message.payload)')
    || !preloadText.includes("invoke('app-host:exec'")
    || !hostedApiText.includes("request('/api/app-host/exec'")
    || !hostedText.includes("contractId: 'hosted:POST:/api/app-host/exec'")
    || !mainText.includes("runAppRouteIpc(\n    'ipc:app-host:exec'")
    || !mainText.includes('validateGeneratedAppHostExecInput')
    || !hostedText.includes('validateGeneratedAppHostExecInput')) {
    fail('Generated app runtime missing host.exec SDK path through appHost dispatch, hosted parity, and runtime validators.');
  }

  if (!contractText.includes("id: 'ipc:app-host:exec'")
    || !contractText.includes("id: 'hosted:POST:/api/app-host/exec'")
    || !contractText.includes("eventType: 'app_host_sdk.executed'")
    || !contractText.includes("requestValidator: 'validateGeneratedAppHostExecInput'")
    || !contractText.includes("commandTextLogged: false")
    || !contractText.includes("commandOutputLogged: false")) {
    fail('Generated app host.exec route contracts must be paired, validated, and sanitize command text/output audit metadata.');
  }

  if (!generatedRuntimeText.includes("openTerminal: (hostId) => __sdkRequest('host:openTerminal', { hostId })")
    || !generatedRuntimeText.includes("message.method === 'host:openTerminal'")
    || !generatedRuntimeText.includes('this.assertHostOpenTerminalAllowed()')
    || !generatedRuntimeText.includes("this.grantedCapabilities.has('host:actions')")
    || !generatedRuntimeText.includes('api.window.navigate(`/terminal?hostId=${encodeURIComponent(hostId)}`)')) {
    fail('Generated app runtime missing shell-owned host.openTerminal SDK path through window.navigate and host:actions permission.');
  }

  if (generatedRuntimeText.includes('openHostTerminal(')) {
    fail('Generated app runtime host.openTerminal must use the shell window navigation API, not direct shell component methods.');
  }

  if (generatedRuntimeText.includes('switchboardos.generated-app') || generatedRuntimeText.includes('localStorage')) {
    fail('Generated app runtime must not persist SwitchboardOS.storage through renderer localStorage.');
  }

  if (!generatedRuntimeText.includes('api.appStorage.get') || !generatedRuntimeText.includes('api.appStorage.set')) {
    fail('Generated app runtime must call structured appStorage API for SDK storage get/set.');
  }

  for (const marker of [
    'window:getInfo',
    'window:setTitle',
    'window:setBadge',
    'window:setStatus',
    'window:setPreferredSize',
    'switchboard-generated-app-window-request',
  ]) {
    if (!generatedRuntimeText.includes(marker)) {
      fail(`Generated app runtime missing window SDK contract marker: ${marker}`);
    }
  }

  if (generatedRuntimeText.includes('querySelector(\'.desktop-window')
    || generatedRuntimeText.includes('querySelector(".desktop-window')) {
    fail('Generated app runtime must not mutate shell window DOM directly.');
  }

  if (hostedText.includes("if (actionOrId === 'presets' && method === 'GET') {\n        return listBootstrapPresets();")
    || hostedText.includes("requireHostedCapability(request, session, 'bootstrap:generate'")
    || hostedText.includes('return this.generateBootstrap(validateBootstrapGenerateInput(body));')
    || hostedText.includes('return this.options.store.listBootstrapPresets();')
    || hostedText.includes('return this.options.store.getBootstrapPreset(')
    || hostedText.includes('return this.options.store.createBootstrapPreset(')
    || hostedText.includes('return this.options.store.updateBootstrapPreset(')
    || hostedText.includes('return this.options.store.deleteBootstrapPreset(')
    || hostedText.includes('return this.options.store.listBootstrapRuns();')
    || hostedText.includes('return this.options.store.getBootstrapRun(')
    || hostedText.includes('return this.options.store.createBootstrapRun(')
    || hostedText.includes('return this.options.store.updateBootstrapRun(')
    || hostedText.includes('return this.options.store.deleteBootstrapRun(')) {
    fail('Direct hosted bootstrap fallback detected in hosted-server.ts.');
  }

  if (mainText.includes("ipcMain.handle('bootstrap-preset:list', async () => mvpStore.listBootstrapPresets())")
    || mainText.includes("ipcMain.handle('bootstrap-preset:get', async (_event, presetId: string) => mvpStore.getBootstrapPreset(presetId))")
    || mainText.includes("ipcMain.handle('bootstrap-preset:create', async (_event, input: CreateBootstrapPresetInput) => mvpStore.createBootstrapPreset(input))")
    || mainText.includes("ipcMain.handle('bootstrap-preset:update', async (_event, presetId: string, input: UpdateBootstrapPresetInput) => mvpStore.updateBootstrapPreset(presetId, input))")
    || mainText.includes("ipcMain.handle('bootstrap-preset:delete', async (_event, presetId: string) => mvpStore.deleteBootstrapPreset(presetId))")
    || mainText.includes("ipcMain.handle('bootstrap-run:list', async () => mvpStore.listBootstrapRuns())")
    || mainText.includes("ipcMain.handle('bootstrap-run:get', async (_event, runId: string) => mvpStore.getBootstrapRun(runId))")
    || mainText.includes("ipcMain.handle('bootstrap-run:create', async (_event, input: CreateBootstrapRunInput) => mvpStore.createBootstrapRun(input))")
    || mainText.includes("ipcMain.handle('bootstrap-run:update', async (_event, runId: string, input: UpdateBootstrapRunInput) => mvpStore.updateBootstrapRun(runId, input))")
    || mainText.includes("ipcMain.handle('bootstrap-run:delete', async (_event, runId: string) => mvpStore.deleteBootstrapRun(runId))")
    || mainText.includes("policyService.assertAllowed('bootstrap:generate'")
    || mainText.includes("mvpStore.logAuditEvent({\n      type: 'bootstrap.generated'")) {
    fail('Direct IPC bootstrap fallback detected in main.ts.');
  }

  if (mainText.includes("ipcMain.handle('command-history:list', async (_event, limit?: number) => mvpStore.listCommandHistory(limit))")
    || mainText.includes("ipcMain.handle('command-history:create', async (_event, input: CreateCommandHistoryInput) => mvpStore.createCommandHistoryEntry(input))")
    || mainText.includes("ipcMain.handle('command-history:get', async (_event, entryId: string) => mvpStore.getCommandHistoryEntry(entryId))")
    || mainText.includes("ipcMain.handle('command-history:delete', async (_event, entryId: string) => mvpStore.deleteCommandHistoryEntry(entryId))")) {
    fail('Direct IPC command-history fallback detected in main.ts.');
  }

  if (hostedText.includes('return this.options.store.listCommandHistory();')
    || hostedText.includes('execute: () => this.options.store.listCommandHistory(),')
    || hostedText.includes('return this.options.store.createCommandHistoryEntry(asRecord(body) as CreateCommandHistoryInput);')
    || hostedText.includes('return this.options.store.getCommandHistoryEntry(decodeURIComponent(action));')
    || hostedText.includes('return this.options.store.deleteCommandHistoryEntry(decodeURIComponent(action));')) {
    fail('Direct hosted command-history fallback detected in hosted-server.ts.');
  }

  if (mainText.includes("policyService.assertAllowed('settings:update'")
    || mainText.includes("ipcMain.handle(\n  'settings:get',\n  async () => {\n    return mvpStore.getSettings();")
    || mainText.includes('return mvpStore.updateSettings(validatedUpdate);')) {
    fail('Direct IPC settings fallback detected in main.ts.');
  }

  if (hostedText.includes("requireHostedCapability(request, session, 'settings:update'")
    || hostedText.includes('return this.options.store.getSettings();')
    || hostedText.includes('return this.options.store.updateSettings(validateSettingsUpdate(body));')) {
    fail('Direct hosted settings fallback detected in hosted-server.ts.');
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

function validateHostedNoAuthDefaults() {
  if (mainText.includes('const authRequired = !authDisabled || !isLocalHostedHost(host);')) {
    fail('Hosted LAN/test mode must not force access-token auth by default.');
  }

  if (!mainText.includes('const authRequired = HOSTED_ENABLED_VALUES.has(authFlag);')) {
    fail('Hosted auth must be explicit opt-in through SWITCHBOARDOS_HOSTED_AUTH_REQUIRED.');
  }

  if (!mainText.includes('SwitchboardOS hosted auth: disabled for MVP testing; no access token required.')) {
    fail('Hosted startup log must state no-token MVP testing mode when auth is disabled.');
  }

  if (!hostedText.includes('authenticated: loginRequired ? Boolean(session) : true')) {
    fail('/api/auth/session must report authenticated true when hosted auth is disabled.');
  }

  if (!hostedNoAuthSmokeText.includes('required: false')
    || !hostedNoAuthSmokeText.includes('state-changing hosted API succeeds without token, session cookie, or CSRF header')) {
    fail('Hosted no-auth smoke must prove token-free state-changing hosted API behavior.');
  }

  if (readmeText.includes('After token login, `/api/auth/session` returns `authenticated: true`.')) {
    fail('README LAN availability gate must not require token login for MVP testing.');
  }

  if (!designDocText.includes('MVP test/LAN browser access does not require access-token login')) {
    fail('Design spec must document no-token MVP test/LAN hosted access.');
  }
}

const contracts = parseContractsFromSource();
const contractIds = validateContractMetadata(contracts);
validateHostGroupTagParity(contracts);
validateHostSecondaryActionParity(contracts);
validateCredentialRefParity(contracts);
const requiredContractIds = new Set(REQUIRED_HOST_CONTRACTS.map((entry) => entry.id));
for (const required of requiredContractIds) {
  if (!contractIds.has(required)) {
    fail(`Missing required host route contract: ${required}`);
  }
}

validatePolicyCapabilities();
validateIpcHostHandlers();
validateHostedDispatches();
validateHostedNoAuthDefaults();

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
