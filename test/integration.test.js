#!/usr/bin/env node
/**
 * Testes de integração para funcionalidades principais
 * 
 * IMPORTANTE: Estes testes requerem variáveis de ambiente configuradas:
 * - JIRA_BASE_URL
 * - JIRA_EMAIL
 * - JIRA_API_TOKEN
 * 
 * Execute com: npm test -- test/integration.test.js
 */

import { test } from 'node:test';
import assert from 'node:assert';
import dotenv from 'dotenv';
import { existsSync } from 'node:fs';

// Carregar .env.test se existir, senão .env
if (existsSync('.env.test')) {
  dotenv.config({ path: '.env.test' });
} else {
  dotenv.config();
}

import fetch from 'node-fetch';

function basicAuthHeader(email, token) {
  const b64 = Buffer.from(`${email}:${token}`).toString("base64");
  return `Basic ${b64}`;
}

async function jiraFetch(method, path, body) {
  const base = process.env.JIRA_BASE_URL?.replace(/\/$/, '') || '';
  const email = process.env.JIRA_EMAIL;
  const token = process.env.JIRA_API_TOKEN;
  
  if (!base || !email || !token) {
    throw new Error("Variáveis de ambiente ausentes");
  }

  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      "Authorization": basicAuthHeader(email, token),
      "Accept": "application/json",
      "Content-Type": "application/json"
    },
    body: body ? JSON.stringify(body) : undefined
  });

  const text = await res.text();
  let json;
  try { 
    json = text ? JSON.parse(text) : null; 
  } catch (parseError) {
    throw new Error(`Erro ao fazer parse: ${parseError.message}`);
  }

  if (!res.ok) {
    let msg;
    if (json?.errorMessages?.length) {
      msg = json.errorMessages.join(" | ");
    } else if (json?.errors) {
      msg = typeof json.errors === 'object' 
        ? JSON.stringify(json.errors) 
        : json.errors;
    } else {
      msg = text || res.statusText;
    }
    throw new Error(`Jira API ${res.status} ${res.statusText}: ${msg}`);
  }
  return json ?? {};
}

const hasCredentials = process.env.JIRA_BASE_URL && 
                       process.env.JIRA_EMAIL && 
                       process.env.JIRA_API_TOKEN;

// Issue de teste (ajuste conforme necessário)
const TEST_ISSUE_KEY = process.env.TEST_ISSUE_KEY || 'WECLEVERAN-318';

test('getIssue - deve retornar dados da issue', { skip: !hasCredentials }, async () => {
  const result = await jiraFetch("GET", `/rest/api/3/issue/${TEST_ISSUE_KEY}?fields=summary,description,status,assignee,priority,issuetype`);
  
  assert(result, 'Resposta não deve ser nula');
  assert(result.key === TEST_ISSUE_KEY, `Key deve ser ${TEST_ISSUE_KEY}`);
  assert(result.fields, 'Deve ter fields');
  assert(result.fields.summary, 'Deve ter summary');
  assert(result.fields.status, 'Deve ter status');
  assert(result.fields.issuetype, 'Deve ter issuetype');
});

test('getComments - deve retornar comentários', { skip: !hasCredentials }, async () => {
  const result = await jiraFetch("GET", `/rest/api/3/issue/${TEST_ISSUE_KEY}/comment?maxResults=5`);
  
  assert(result, 'Resposta não deve ser nula');
  assert(typeof result.total === 'number', 'Deve ter campo total');
  assert(Array.isArray(result.comments), 'Deve ter array de comments');
  
  if (result.comments.length > 0) {
    const comment = result.comments[0];
    assert(comment.id, 'Comentário deve ter id');
    assert(comment.author, 'Comentário deve ter author');
    assert(comment.body !== undefined, 'Comentário deve ter body');
  }
});

test('getTransitions - deve retornar transições disponíveis', { skip: !hasCredentials }, async () => {
  const result = await jiraFetch("GET", `/rest/api/3/issue/${TEST_ISSUE_KEY}/transitions`);
  
  assert(result, 'Resposta não deve ser nula');
  assert(Array.isArray(result.transitions), 'Deve ter array de transitions');
  
  if (result.transitions.length > 0) {
    const transition = result.transitions[0];
    assert(transition.id, 'Transição deve ter id');
    assert(transition.name, 'Transição deve ter name');
    assert(transition.to, 'Transição deve ter to');
  }
});

test('addComment - deve adicionar comentário', { skip: !hasCredentials }, async () => {
  const commentBody = {
    type: "doc",
    version: 1,
    content: [{
      type: "paragraph",
      content: [{ type: "text", text: `Teste automatizado - ${new Date().toISOString()}` }]
    }]
  };
  
  const result = await jiraFetch("POST", `/rest/api/3/issue/${TEST_ISSUE_KEY}/comment`, {
    body: commentBody
  });
  
  assert(result, 'Resposta não deve ser nula');
  assert(result.id, 'Comentário criado deve ter id');
  assert(result.author, 'Comentário criado deve ter author');
  assert(result.body, 'Comentário criado deve ter body');
  assert(result.created, 'Comentário criado deve ter created');
});

test('addWorklog - deve adicionar worklog', { skip: !hasCredentials }, async () => {
  // Criar worklog de 1 minuto para teste
  const started = new Date().toISOString().replace(/\.\d{3}Z$/, '+0000');
  const worklogBody = {
    timeSpentSeconds: 60, // 1 minuto
    started: started,
    comment: {
      type: "doc",
      version: 1,
      content: [{
        type: "paragraph",
        content: [{ type: "text", text: `Teste automatizado - ${new Date().toISOString()}` }]
      }]
    }
  };
  
  const result = await jiraFetch("POST", `/rest/api/3/issue/${TEST_ISSUE_KEY}/worklog`, worklogBody);
  
  assert(result, 'Resposta não deve ser nula');
  assert(result.id, 'Worklog criado deve ter id');
  assert(result.timeSpentSeconds === 60, 'Worklog deve ter 60 segundos');
  assert(result.started, 'Worklog deve ter started');
  assert(result.self, 'Worklog deve ter self (link)');
});

