import {
  FIELD_TYPES,
  QUESTIONNAIRE_LIMITS,
} from '../public/constants/questionnaire.js';

import { test } from 'node:test';
import { parseHTML } from 'linkedom';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as contract from '../public/submission.js';
import { TIME_LIMITS } from '../public/constants/time.js';
import { STORAGE_KEYS } from '../public/constants/storage.js';

const definition = {
  id: 'f2a970b2-6348-4dc2-ab54-c10986c96ecb',
  version: 1,
  definition: [
    ...['fullName', 'role', 'department'].map((key) => ({
      key,
      label: key,
      helpText: '',
      type: 'identity',
      required: true,
      maxLength: 200,
    })),
    ...Array.from({ length: 7 }, (_, index) => ({
      key: `answer${index + 1}`,
      label: 'שאלה',
      helpText: 'הסבר',
      type: 'long-text',
      required: false,
      maxLength: 4000,
    })),
  ],
};
const receipt = {
  id: '52ce9017-021d-4e74-8657-4492bec36573',
  receivedAt: '2026-11-01T10:00:00Z',
};
const html = await readFile(
  new URL('../public/index.html', import.meta.url),
  'utf8',
);
const appSource = await readFile(
  new URL('../public/app.js', import.meta.url),
  'utf8',
);
const source = appSource.replace(/^import[\s\S]*?from ['"][^'"]+['"];\n/gm, '');
const harness = async (options = {}) => {
  const { window, document } = parseHTML(html);
  const storage = options.storage ?? new Map();
  const localStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: (key) => storage.delete(key),
  };
  const calls = [];
  const fetcher = async (url, init) => {
    if (url.includes('genair-workflow')) {
      return new Response(JSON.stringify(options.definition ?? definition));
    }
    calls.push(JSON.parse(init.body));
    return options.submit
      ? options.submit(calls.length)
      : new Response(JSON.stringify(receipt), { status: 201 });
  };
  document.getElementById('survey').reportValidity = () => true;
  const run = new Function(
    'document',
    'window',
    'Node',
    'localStorage',
    'fetch',
    'crypto',
    'AbortSignal',
    'TextEncoder',
    'STORAGE_KEYS',
    'TIME_LIMITS',
    'FIELD_TYPES',
    'QUESTIONNAIRE_LIMITS',
    ...Object.keys(contract),
    `return (async () => { ${source}; return { submit, state }; })();`,
  );
  const app = await run(
    document,
    window,
    window.Node,
    localStorage,
    fetcher,
    crypto,
    AbortSignal,
    TextEncoder,
    STORAGE_KEYS,
    TIME_LIMITS,
    FIELD_TYPES,
    QUESTIONNAIRE_LIMITS,
    ...Object.values(contract),
  );
  const fill = () =>
    ['fullName', 'role', 'department', 'answer1'].forEach((key) => {
      document.getElementById(key).value = `  ${key} תשובה\n  `;
    });
  return {
    app,
    calls,
    document,
    storage,
    fill,
    submit: () => app.submit({ preventDefault() {} }),
  };
};

test('browser state preserves text and blocks double clicks during a pending send', async () => {
  const gate = Promise.withResolvers();
  const result = await harness({ submit: () => gate.promise });
  result.fill();
  const pending = result.submit();
  await result.submit();
  assert.equal(result.calls.length, 1);
  assert.equal(result.calls[0].answers[0].value, '  answer1 תשובה\n  ');
  assert.equal(result.document.getElementById('send').disabled, true);
  gate.resolve(new Response(JSON.stringify(receipt), { status: 201 }));
  await pending;
  assert.equal(result.app.state.complete, true);
  assert.equal(result.storage.has(STORAGE_KEYS.PENDING), false);
  await result.submit();
  assert.equal(result.calls.length, 1);
});

test('lost response survives reload and retries the exact original payload/version', async () => {
  const first = await harness({
    submit: () => {
      throw new Error('lost response');
    },
  });
  first.fill();
  await first.submit();
  assert.equal(first.app.state.complete, false);
  assert.equal(first.document.getElementById('answer1').disabled, true);
  const second = await harness({
    storage: first.storage,
    definition: {
      ...definition,
      id: '2e3953f4-4b7f-4ec2-9105-1e9ef63bfe7b',
      version: 2,
    },
  });
  await second.submit();
  assert.deepEqual(second.calls[0], first.calls[0]);
  assert.equal(second.app.state.complete, true);
});

test('invalid receipt is not success and a retry keeps the same UUID', async () => {
  const result = await harness({
    submit: (count) =>
      new Response(JSON.stringify(count === 1 ? { message: 'ok' } : receipt), {
        status: 201,
      }),
  });
  result.fill();
  await result.submit();
  assert.equal(result.app.state.complete, false);
  await result.submit();
  assert.deepEqual(result.calls[0], result.calls[1]);
  assert.equal(result.app.state.complete, true);
});

test('validation failure unlocks correction; empty answers never send', async () => {
  const result = await harness({
    submit: () => new Response('{}', { status: 400 }),
  });
  await result.submit();
  assert.equal(result.calls.length, 0);
  result.fill();
  await result.submit();
  assert.equal(result.document.getElementById('answer1').disabled, false);
  assert.equal(result.app.state.pending, null);
});

test('backend question text is rendered literally, not executable HTML', async () => {
  const malicious = structuredClone(definition);
  malicious.definition[3].label = '<img src=x onerror=alert(1)>';
  const result = await harness({ definition: malicious });
  assert.equal(
    result.document.querySelector('label[for="answer1"]').textContent,
    malicious.definition[3].label,
  );
  assert.equal(result.document.querySelector('label[for="answer1"] img'), null);
});
