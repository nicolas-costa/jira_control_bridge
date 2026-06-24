#!/usr/bin/env node
/**
 * Testes unitários para funções auxiliares
 */

import { test } from 'node:test';
import assert from 'node:assert';
import path from 'path';

// Importar funções auxiliares (precisamos exportá-las do server.js)
// Por enquanto, vamos duplicar as funções para teste ou criar um módulo separado

function basicAuthHeader(email, token) {
  const b64 = Buffer.from(`${email}:${token}`).toString("base64");
  return `Basic ${b64}`;
}

function toJiraStartedISO(input) {
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?([+-]\d{2}:?\d{2}|Z|[+-]\d{4})$/.test(input)) {
    return input.replace(/([+-]\d{2}):(\d{2})$/, (_m, h, m) => `${h}${m}`);
  }
  const dt = new Date(input);
  if (isNaN(dt)) throw new Error(`started inválido: ${input}`);

  const offsetMin = -dt.getTimezoneOffset();
  const sign = offsetMin >= 0 ? "+" : "-";
  const pad = (n) => String(Math.abs(n)).padStart(2, "0");
  const hh = pad(Math.trunc(Math.abs(offsetMin) / 60));
  const mm = pad(Math.abs(offsetMin) % 60);
  const off = `${sign}${hh}${mm}`;

  const yyyy = dt.getFullYear();
  const MM = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  const HH = String(dt.getHours()).padStart(2, "0");
  const min = String(dt.getMinutes()).padStart(2, "0");
  const ss = String(dt.getSeconds()).padStart(2, "0");
  const ms = String(dt.getMilliseconds()).padStart(3, "0");

  return `${yyyy}-${MM}-${dd}T${HH}:${min}:${ss}.${ms}${off}`;
}

function extractTextFromADF(adfNode) {
  if (!adfNode || !adfNode.content) return '';
  
  let text = '';
  for (const node of adfNode.content) {
    if (node.type === 'text' && node.text) {
      text += node.text + ' ';
    } else if (node.content) {
      text += extractTextFromADF(node) + ' ';
    }
  }
  return text.trim();
}

// Testes para basicAuthHeader
test('basicAuthHeader - gera header correto', () => {
  const result = basicAuthHeader('user@example.com', 'token123');
  assert.strictEqual(result, 'Basic dXNlckBleGFtcGxlLmNvbTp0b2tlbjEyMw==');
  
  // Verificar que é base64 válido
  const decoded = Buffer.from(result.replace('Basic ', ''), 'base64').toString();
  assert.strictEqual(decoded, 'user@example.com:token123');
});

test('basicAuthHeader - funciona com caracteres especiais', () => {
  const result = basicAuthHeader('user+test@example.com', 'token/with+special=chars');
  assert(result.startsWith('Basic '));
  
  const decoded = Buffer.from(result.replace('Basic ', ''), 'base64').toString();
  assert.strictEqual(decoded, 'user+test@example.com:token/with+special=chars');
});

// Testes para toJiraStartedISO
test('toJiraStartedISO - aceita ISO com offset +03:00 e normaliza', () => {
  const input = '2025-01-15T10:30:00+03:00';
  const result = toJiraStartedISO(input);
  assert.strictEqual(result, '2025-01-15T10:30:00+0300');
});

test('toJiraStartedISO - aceita ISO com offset -05:00 e normaliza', () => {
  const input = '2025-01-15T10:30:00-05:00';
  const result = toJiraStartedISO(input);
  assert.strictEqual(result, '2025-01-15T10:30:00-0500');
});

test('toJiraStartedISO - aceita ISO com Z (UTC)', () => {
  const input = '2025-01-15T10:30:00Z';
  const result = toJiraStartedISO(input);
  assert.strictEqual(result, '2025-01-15T10:30:00Z');
});

test('toJiraStartedISO - aceita ISO já no formato +0300', () => {
  const input = '2025-01-15T10:30:00+0300';
  const result = toJiraStartedISO(input);
  assert.strictEqual(result, input);
});

test('toJiraStartedISO - converte data local para ISO com timezone', () => {
  const input = '2025-01-15T10:30:00';
  const result = toJiraStartedISO(input);
  
  // Deve ter formato ISO com timezone
  assert(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}[+-]\d{4}$/.test(result));
  
  // Deve conter a data correta
  assert(result.startsWith('2025-01-15T10:30:00'));
});

test('toJiraStartedISO - lança erro para data inválida', () => {
  assert.throws(() => {
    toJiraStartedISO('data-invalida');
  }, /started inválido/);
});

// Testes para extractTextFromADF
test('extractTextFromADF - extrai texto simples', () => {
  const adf = {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Hello World' }
        ]
      }
    ]
  };
  
  const result = extractTextFromADF(adf);
  assert.strictEqual(result, 'Hello World');
});

test('extractTextFromADF - extrai texto de múltiplos parágrafos', () => {
  const adf = {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Primeiro parágrafo' }
        ]
      },
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Segundo parágrafo' }
        ]
      }
    ]
  };
  
  const result = extractTextFromADF(adf);
  assert.strictEqual(result, 'Primeiro parágrafo Segundo parágrafo');
});

test('extractTextFromADF - retorna string vazia para nó vazio', () => {
  assert.strictEqual(extractTextFromADF(null), '');
  assert.strictEqual(extractTextFromADF(undefined), '');
  assert.strictEqual(extractTextFromADF({}), '');
  assert.strictEqual(extractTextFromADF({ content: [] }), '');
});

test('extractTextFromADF - lida com estrutura aninhada', () => {
  const adf = {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Início ' },
          {
            type: 'text',
            text: 'meio',
            marks: [{ type: 'strong' }]
          },
          { type: 'text', text: ' fim' }
        ]
      }
    ]
  };
  
  const result = extractTextFromADF(adf);
  // A função adiciona espaços entre elementos, então pode ter espaços duplos
  // Vamos verificar que contém as palavras corretas
  assert(result.includes('Início'), 'Deve conter "Início"');
  assert(result.includes('meio'), 'Deve conter "meio"');
  assert(result.includes('fim'), 'Deve conter "fim"');
  // Remover espaços extras para comparação
  assert.strictEqual(result.replace(/\s+/g, ' ').trim(), 'Início meio fim');
});

function mapJiraAttachment(attachment) {
  return {
    id: attachment.id,
    filename: attachment.filename,
    size: attachment.size,
    mimeType: attachment.mimeType,
    created: attachment.created,
    author: attachment.author?.displayName || attachment.author?.accountId || null,
    contentUrl: attachment.content,
    thumbnailUrl: attachment.thumbnail || null
  };
}

function resolveAttachmentOutputPath(outputPath, filename) {
  const resolved = path.resolve(outputPath);
  const looksLikeDirectory = outputPath.endsWith("/") || outputPath.endsWith(path.sep);
  if (looksLikeDirectory) {
    return path.join(resolved, filename);
  }
  return resolved;
}

function validateAttachmentDownloadMode({ outputPath, asBase64 }) {
  if (!outputPath && !asBase64) {
    throw new Error("Informe 'outputPath' para salvar em disco ou 'asBase64: true' para retornar o conteúdo.");
  }
  if (outputPath && asBase64) {
    throw new Error("Use apenas um modo: 'outputPath' ou 'asBase64', não ambos.");
  }
}

test('mapJiraAttachment - mapeia campos principais', () => {
  const result = mapJiraAttachment({
    id: '10001',
    filename: 'screenshot.png',
    size: 2048,
    mimeType: 'image/png',
    created: '2025-06-24T10:00:00.000+0000',
    author: { displayName: 'Nicolas' },
    content: 'https://example.atlassian.net/rest/api/3/attachment/content/10001',
    thumbnail: 'https://example.atlassian.net/rest/api/3/attachment/thumbnail/10001'
  });

  assert.deepStrictEqual(result, {
    id: '10001',
    filename: 'screenshot.png',
    size: 2048,
    mimeType: 'image/png',
    created: '2025-06-24T10:00:00.000+0000',
    author: 'Nicolas',
    contentUrl: 'https://example.atlassian.net/rest/api/3/attachment/content/10001',
    thumbnailUrl: 'https://example.atlassian.net/rest/api/3/attachment/thumbnail/10001'
  });
});

test('resolveAttachmentOutputPath - usa nome original em diretório', () => {
  const result = resolveAttachmentOutputPath('/tmp/anexos/', 'file.pdf');
  assert(result.endsWith(`${path.sep}file.pdf`));
});

test('resolveAttachmentOutputPath - preserva caminho de arquivo', () => {
  const result = resolveAttachmentOutputPath('/tmp/custom-name.pdf', 'file.pdf');
  assert.strictEqual(result, path.resolve('/tmp/custom-name.pdf'));
});

test('validateAttachmentDownloadMode - exige um modo', () => {
  assert.throws(() => {
    validateAttachmentDownloadMode({ outputPath: null, asBase64: false });
  }, /outputPath/);
});

test('validateAttachmentDownloadMode - rejeita modos simultâneos', () => {
  assert.throws(() => {
    validateAttachmentDownloadMode({ outputPath: '/tmp/file.pdf', asBase64: true });
  }, /apenas um modo/);
});

