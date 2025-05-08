import * as process from 'process';
import * as cp from 'child_process';
import * as path from 'path';
import * as core from '@actions/core';
import * as github from '@actions/github';
import { test, jest } from '@jest/globals';

jest.mock('@actions/core');
jest.mock('@actions/github');

const mockGetInput = jest.fn();
const mockGetBooleanInput = jest.fn();
const mockSetOutput = jest.fn();
const mockInfo = jest.fn();
const mockWarning = jest.fn();
const mockDebug = jest.fn();
const mockSummary = {
  addHeading: jest.fn().mockReturnThis(),
  addTable: jest.fn().mockReturnThis(),
  addLink: jest.fn().mockReturnThis(),
  write: jest.fn().mockResolvedValue(undefined as unknown),
};

// Use type assertion to override readonly properties
(core as any).getInput = mockGetInput;
(core as any).getBooleanInput = mockGetBooleanInput;
(core as any).setOutput = mockSetOutput;
(core as any).info = mockInfo;
(core as any).warning = mockWarning;
(core as any).debug = mockDebug;
(core as any).summary = mockSummary;

const mockGraphql = jest.fn();
const mockRest = {
  copilot: {
    listCopilotSeats: jest.fn(),
    cancelCopilotSeatAssignmentForUsers: jest.fn(),
  },
  teams: {
    getMembershipForUserInOrg: jest.fn(),
    removeMembershipForUserInOrg: jest.fn(),
  },
};

const mockGetOctokit = jest.fn(() => ({
  graphql: mockGraphql,
  rest: mockRest,
}));

// Use type assertion to override readonly property
(github as any).getOctokit = mockGetOctokit;

const addInput = (key, value) => {
  process.env[`INPUT_${key.replace(/ /g, '-').toUpperCase()}`] = value;
}

const input: any = {
  'github-token': process.env.GITHUB_TOKEN,
  'organization': process.env.ORGANIZATION || 'austenstone',
  'inactive-days': process.env.INACTIVE_DAYS || '30',
  'remove': process.env.REMOVE || false,
  'remove-from-team': process.env.REMOVE_FROM_TEAM || false,
  'job-summary': process.env.JOB_SUMMARY || false,
  'csv': process.env.CSV || false,
  'allowlist': process.env.ALLOWLIST || 'user1,user2',
}

test('test run', () => {
  Object.entries(input).forEach(([key, value]) => addInput(key, value));
  process.env['GITHUB_REPOSITORY'] = 'austenstone/copilot-license-cleanup';
  const np = process.execPath;
  const ip = path.join(__dirname, '..', 'dist', 'index.js');
  const options: cp.ExecFileSyncOptions = {
    env: process.env,
  };

  const spawned = cp.spawnSync(np, [ip], options);
  console.log(spawned.stdout.toString());
});

test('allowlist functionality', () => {
  // Set up test environment with allowlist
  const testInput = { ...input, 'allowlist': 'testuser1,testuser2', 'remove': true };
  Object.entries(testInput).forEach(([key, value]) => addInput(key, value));
  process.env['GITHUB_REPOSITORY'] = 'austenstone/copilot-license-cleanup';

  // Mock the behavior of the script
  mockGetInput.mockImplementation(function(name) { return testInput[name as keyof typeof testInput]; });
  mockGetBooleanInput.mockImplementation(function(name) { return testInput[name as keyof typeof testInput] === true; });
  mockRest.copilot.listCopilotSeats.mockResolvedValue({
    total_seats: 5,
    seats: [
      { assignee: { login: 'testuser1' }, last_activity_at: null },
      { assignee: { login: 'testuser2' }, last_activity_at: null },
      { assignee: { login: 'inactiveuser' }, last_activity_at: '2023-01-01T00:00:00Z' },
    ],
  });

  const mockLog = jest.spyOn(console, 'log').mockImplementation(() => {});

  // Run the script
  const np = process.execPath;
  const ip = path.join(__dirname, '..', 'dist', 'index.js');
  const options: cp.ExecFileSyncOptions = {
    env: process.env,
  };

  const spawned = cp.spawnSync(np, [ip], options);
  const output = spawned.stdout.toString();
  console.log(output);

  // Verify that users in allowlist are not removed
  expect(output).toContain('Skipping removal');
  expect(output).toContain('testuser1');
  expect(output).toContain('testuser2');

  // Clean up mocks
  mockLog.mockRestore();
});
