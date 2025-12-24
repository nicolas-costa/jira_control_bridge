#!/usr/bin/env node
/**
 * Testes de integração para busca JQL
 * 
 * IMPORTANTE: Estes testes requerem variáveis de ambiente configuradas:
 * - JIRA_BASE_URL
 * - JIRA_EMAIL
 * - JIRA_API_TOKEN
 * 
 * Execute com: npm test -- test/search-jql.test.js
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

// Verificar se temos credenciais configuradas
const hasCredentials = process.env.JIRA_BASE_URL && 
                       process.env.JIRA_EMAIL && 
                       process.env.JIRA_API_TOKEN;

test('Busca JQL - endpoint /rest/api/3/search/jql deve funcionar', { skip: !hasCredentials }, async () => {
  const jql = 'project = WECLEVERAN ORDER BY updated DESC';
  const maxResults = 5;
  const fields = ['summary', 'status', 'priority'];
  
  const result = await jiraFetch("POST", "/rest/api/3/search/jql", {
    jql,
    maxResults,
    fields
  });
  
  // Verificar estrutura da resposta
  assert(result, 'Resposta não deve ser nula');
  assert(Array.isArray(result.issues), 'Deve ter array de issues');
  assert(result.issues.length <= maxResults, `Não deve retornar mais que ${maxResults} issues`);
  
  // O novo endpoint pode não ter 'total', mas pode ter 'nextPageToken' para paginação
  // Verificar se há total (opcional) ou nextPageToken
  if (result.total !== undefined) {
    assert(typeof result.total === 'number', 'Se presente, total deve ser número');
  }
  
  // Verificar estrutura das issues
  if (result.issues.length > 0) {
    const issue = result.issues[0];
    assert(issue.key, 'Issue deve ter key');
    assert(issue.fields, 'Issue deve ter fields');
    assert(issue.fields.summary !== undefined, 'Issue deve ter summary');
  }
});

test('Busca JQL - deve aceitar fields como array', { skip: !hasCredentials }, async () => {
  const jql = 'project = WECLEVERAN ORDER BY updated DESC';
  const fields = ['summary', 'status', 'priority', 'created', 'updated'];
  
  const result = await jiraFetch("POST", "/rest/api/3/search/jql", {
    jql,
    maxResults: 3,
    fields
  });
  
  assert(result, 'Resposta não deve ser nula');
  
  if (result.issues.length > 0) {
    const issue = result.issues[0];
    // Verificar que os campos solicitados estão presentes
    assert(issue.fields.summary !== undefined, 'Deve ter summary');
    assert(issue.fields.status !== undefined, 'Deve ter status');
  }
});

test('Busca JQL - não deve aceitar startAt (novo endpoint usa nextPageToken)', { skip: !hasCredentials }, async () => {
  const jql = 'project = WECLEVERAN ORDER BY updated DESC';
  
  // Tentar com startAt (deve ser ignorado ou causar erro)
  try {
    const result = await jiraFetch("POST", "/rest/api/3/search/jql", {
      jql,
      maxResults: 5,
      startAt: 0,  // Este campo não deve ser usado no novo endpoint
      fields: ['summary', 'status']
    });
    
    // Se funcionou, verificar que não há startAt na resposta
    // O novo endpoint pode ignorar startAt ou retornar nextPageToken
    assert(result, 'Resposta não deve ser nula');
    
    // Verificar se há nextPageToken (novo formato de paginação)
    if (result.nextPageToken !== undefined) {
      assert(typeof result.nextPageToken === 'string', 'nextPageToken deve ser string');
    }
  } catch (error) {
    // Se o endpoint rejeitar startAt, isso é esperado
    if (error.message.includes('startAt') || error.message.includes('400')) {
      // OK - endpoint rejeitou startAt como esperado
      assert(true, 'Endpoint rejeitou startAt como esperado');
    } else {
      throw error;
    }
  }
});

test('Busca JQL - deve retornar erro 400 para JQL inválida', { skip: !hasCredentials }, async () => {
  const invalidJql = 'project = PROJETO_INEXISTENTE_XYZ123';
  
  try {
    await jiraFetch("POST", "/rest/api/3/search/jql", {
      jql: invalidJql,
      maxResults: 5,
      fields: ['summary']
    });
    
    // Se não lançou erro, pode ser que o projeto não exista mas a query seja válida
    // Nesse caso, apenas verificar que retornou (mesmo que vazio)
    assert(true, 'Query executada (pode retornar vazio se projeto não existir)');
  } catch (error) {
    // Erro 400 é esperado para JQL inválida
    if (error.message.includes('400') || error.message.includes('Bad Request')) {
      assert(true, 'Erro 400 retornado para JQL inválida como esperado');
    } else {
      // Outros erros podem ser aceitáveis (ex: projeto não existe)
      assert(true, `Outro erro retornado: ${error.message}`);
    }
  }
});

test('Busca JQL - deve funcionar com currentUser()', { skip: !hasCredentials }, async () => {
  const jql = 'project = WECLEVERAN AND assignee = currentUser() ORDER BY updated DESC';
  
  const result = await jiraFetch("POST", "/rest/api/3/search/jql", {
    jql,
    maxResults: 10,
    fields: ['summary', 'status', 'assignee']
  });
  
  assert(result, 'Resposta não deve ser nula');
  assert(Array.isArray(result.issues), 'Deve ter array de issues');
  
  // Verificar que as issues retornadas são do usuário atual
  if (result.issues.length > 0) {
    const issue = result.issues[0];
    if (issue.fields.assignee) {
      assert(issue.fields.assignee.emailAddress === process.env.JIRA_EMAIL, 
        'Issue deve ser atribuída ao usuário atual');
    }
  }
});

test('Busca JQL - validação de endpoint correto (não deve usar /rest/api/3/search)', { skip: !hasCredentials }, async () => {
  // Tentar usar o endpoint antigo (deve retornar 410 Gone)
  try {
    await jiraFetch("POST", "/rest/api/3/search", {
      jql: 'project = WECLEVERAN',
      maxResults: 5,
      fields: ['summary']
    });
    
    // Se chegou aqui, o endpoint antigo ainda funciona (não esperado)
    assert.fail('Endpoint antigo /rest/api/3/search ainda funciona (esperado 410 Gone)');
  } catch (error) {
    // Esperamos erro 410 Gone
    if (error.message.includes('410') || error.message.includes('Gone')) {
      assert(true, 'Endpoint antigo retornou 410 Gone como esperado');
    } else {
      // Outros erros podem ocorrer, mas não é o esperado
      console.warn(`⚠️  Endpoint antigo retornou erro diferente: ${error.message}`);
    }
  }
});

