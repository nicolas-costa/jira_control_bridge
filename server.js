#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema
} from "@modelcontextprotocol/sdk/types.js";
import fetch from "node-fetch";

// ---------- Helpers ----------
function basicAuthHeader(email, token) {
  const b64 = Buffer.from(`${email}:${token}`).toString("base64");
  return `Basic ${b64}`;
}

// Jira aceita "started" como "YYYY-MM-DDTHH:mm:ss.SSSZ" (ex.: +0000).
// Vamos gerar no fuso do usuário se vier só date/hora local.
function toJiraStartedISO(input) {
  // Se já vier um ISO com offset tipo "+0000" ou "+03:00", apenas retorna
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?([+-]\d{2}:?\d{2}|Z|[+-]\d{4})$/.test(input)) {
    // Normaliza "+03:00" para "+0300"
    return input.replace(/([+-]\d{2}):(\d{2})$/, (_m, h, m) => `${h}${m}`);
  }
  // Caso contrário, interpreta como local e aplica timezone do sistema
  const dt = new Date(input);
  if (isNaN(dt)) throw new Error(`started inválido: ${input}`);

  // Formata como "+HHMM"
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

async function jiraFetch(method, path, body) {
  const base = process.env.JIRA_BASE_URL;
  const email = process.env.JIRA_EMAIL;
  const token = process.env.JIRA_API_TOKEN;
  if (!base || !email || !token) {
    throw new Error("Env ausente: JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN.");
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
    console.error('⚠️ Erro ao fazer parse da resposta JSON:', parseError.message);
    json = { raw: text }; 
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

// ---------- MCP Server ----------
class JiraMCPServer {
  constructor() {
    this.server = new Server(
      {
        name: "jira-mcp-server",
        version: "1.1.0",
        description: "MCP Server para gerenciar issues, worklogs, comentários e transições no Jira Cloud."
      },
      {
        capabilities: {
          tools: {}
        }
      }
    );
    this.setupHandlers();
  }

  setupHandlers() {
    // Listar ferramentas disponíveis
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: "jira.addWorklog",
            title: "Adicionar Worklog",
            description: "Adiciona um worklog em uma issue do Jira Cloud.",
            inputSchema: {
              type: "object",
              required: ["issueKey", "timeSpentSeconds"],
              properties: {
                issueKey: { type: "string", description: "Chave da issue (ex.: ABC-123)." },
                timeSpentSeconds: { type: "integer", description: "Tempo em segundos (ex.: 3600 = 1h)." },
                started: {
                  type: "string",
                  description: "Data/hora de início no formato ISO. Aceita 'YYYY-MM-DDTHH:mm:ss' (local) ou com offset (ex.: 2025-10-03T09:00:00-03:00)."
                },
                comment: {
                  type: "string",
                  description: "Comentário opcional do worklog (texto simples)."
                },
                visibility: {
                  type: "object",
                  description: "Visibilidade do worklog.",
                  properties: {
                    type: { type: "string", enum: ["role", "group"] },
                    value: { type: "string" }
                  }
                }
              }
            }
          },
          {
            name: "jira.searchJql",
            title: "Buscar Issues (JQL)",
            description: "Busca issues usando JQL e retorna campos principais.",
            inputSchema: {
              type: "object",
              required: ["jql"],
              properties: {
                jql: { type: "string", description: "Ex.: project = ABC AND assignee = currentUser() ORDER BY updated DESC" },
                maxResults: { type: "integer", default: 25 },
                fields: { type: "array", items: { type: "string" }, description: "Campos extras (ex.: ['summary','status'])" }
              }
            }
          },
          {
            name: "jira.getIssue",
            title: "Obter Issue",
            description: "Obtém dados completos de uma issue do Jira Cloud, incluindo descrição, status, comentários e outros campos.",
            inputSchema: {
              type: "object",
              required: ["issueKey"],
              properties: {
                issueKey: { type: "string", description: "Chave da issue (ex.: ABC-123)" },
                expand: { 
                  type: "array", 
                  items: { type: "string" },
                  description: "Campos expandidos como 'renderedFields' para descrição formatada"
                }
              }
            }
          },
          {
            name: "jira.getComments",
            title: "Obter Comentários",
            description: "Obtém todos os comentários de uma issue do Jira Cloud.",
            inputSchema: {
              type: "object",
              required: ["issueKey"],
              properties: {
                issueKey: { type: "string", description: "Chave da issue (ex.: ABC-123)" },
                maxResults: { type: "integer", description: "Número máximo de comentários (padrão: 50)" },
                orderBy: { type: "string", enum: ["created", "-created", "+created"], description: "Ordenação dos comentários" }
              }
            }
          },
          {
            name: "jira.getTransitions",
            title: "Obter Transições Disponíveis",
            description: "Obtém todas as transições de status disponíveis para uma issue, considerando as regras do workflow do board.",
            inputSchema: {
              type: "object",
              required: ["issueKey"],
              properties: {
                issueKey: { type: "string", description: "Chave da issue (ex.: ABC-123)" },
                expand: { type: "string", description: "Campos para expandir (ex.: 'transitions.fields')" }
              }
            }
          },
          {
            name: "jira.transitionIssue",
            title: "Transicionar Issue",
            description: "Move uma issue para outro status usando o ID da transição. Use jira.getTransitions para obter as transições disponíveis.",
            inputSchema: {
              type: "object",
              required: ["issueKey", "transitionId"],
              properties: {
                issueKey: { type: "string", description: "Chave da issue (ex.: ABC-123)" },
                transitionId: { type: "string", description: "ID da transição (obtido via jira.getTransitions)" },
                fields: { 
                  type: "object", 
                  description: "Campos adicionais requeridos pela transição (ex.: resolution, assignee)"
                },
                comment: {
                  type: "string",
                  description: "Comentário opcional ao transicionar"
                }
              }
            }
          }
        ]
      };
    });

    // Executar ferramentas
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case "jira.addWorklog":
          case "jira_addWorklog":  // Fallback para normalização do cliente
            return await this.addWorklog(args);
          case "jira.searchJql":
          case "jira_searchJql":  // Fallback para normalização do cliente
            return await this.searchJql(args);
          case "jira.getIssue":
          case "jira_getIssue":  // Fallback para normalização do cliente
            return await this.getIssue(args);
          case "jira.getComments":
          case "jira_getComments":  // Fallback para normalização do cliente
            return await this.getComments(args);
          case "jira.getTransitions":
          case "jira_getTransitions":  // Fallback para normalização do cliente
            return await this.getTransitions(args);
          case "jira.transitionIssue":
          case "jira_transitionIssue":  // Fallback para normalização do cliente
            return await this.transitionIssue(args);
          default:
            throw new Error(`Ferramenta desconhecida: ${name}`);
        }
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `❌ **Erro:** ${error.message}`
          }],
          isError: true
        };
      }
    });
  }

  async addWorklog(args) {
    const { issueKey, timeSpentSeconds, comment, started, visibility } = args;
    const startedStr = toJiraStartedISO(
      started || new Date().toISOString()
    );

    const body = {
      timeSpentSeconds,
      started: startedStr,
      ...(comment ? { comment: { type: "doc", version: 1, content: [{ type: "paragraph", content: [{ type: "text", text: comment }] }] } } : {}),
      ...(visibility ? { visibility } : {})
    };

    const data = await jiraFetch("POST", `/rest/api/3/issue/${encodeURIComponent(issueKey)}/worklog`, body);

    return {
      content: [{
        type: "text",
        text: `Worklog criado em ${issueKey} com ${timeSpentSeconds}s (started=${startedStr}). id=${data?.id || "?"}`
      }]
    };
  }

  async searchJql(args) {
    const { jql, maxResults = 25, fields } = args;
    const defaultFields = ["summary", "status", "assignee", "timetracking"];
    const fieldsList = (fields || defaultFields).join(",");
    
    const res = await jiraFetch(
      "GET", 
      `/rest/api/3/search?jql=${encodeURIComponent(jql)}&maxResults=${maxResults}&fields=${fieldsList}`
    );
    
    const issues = (res.issues || []).map((it) => ({
      key: it.key,
      id: it.id,
      self: it.self,
      summary: it.fields?.summary,
      status: it.fields?.status?.name,
      assignee: it.fields?.assignee?.displayName
    }));

    return {
      content: [{
        type: "text",
        text: `📋 **Resultados da busca JQL (${res.total} issues encontradas):**\n\n\`\`\`json\n${JSON.stringify({ total: res.total, issues }, null, 2)}\n\`\`\``
      }]
    };
  }

  async getIssue(args) {
    const { issueKey, expand } = args;
    let path = `/rest/api/3/issue/${encodeURIComponent(issueKey)}`;
    
    // Campos importantes (removido 'comment' para melhor performance - use jira.getComments)
    const fields = "summary,description,status,assignee,created,updated,priority,issuetype,project";
    const params = new URLSearchParams({ fields });
    
    if (expand && expand.length > 0) {
      params.append('expand', expand.join(','));
    }
    
    const res = await jiraFetch("GET", `${path}?${params.toString()}`);
    
    // Formatar resposta de forma mais legível
    const formatted = {
      key: res.key,
      id: res.id,
      self: res.self,
      fields: {
        summary: res.fields?.summary,
        description: res.fields?.description,
        status: {
          name: res.fields?.status?.name,
          id: res.fields?.status?.id,
          statusCategory: res.fields?.status?.statusCategory?.name
        },
        assignee: res.fields?.assignee ? {
          displayName: res.fields.assignee.displayName,
          emailAddress: res.fields.assignee.emailAddress,
          accountId: res.fields.assignee.accountId
        } : null,
        priority: res.fields?.priority?.name,
        issuetype: res.fields?.issuetype?.name,
        project: {
          key: res.fields?.project?.key,
          name: res.fields?.project?.name
        },
        created: res.fields?.created,
        updated: res.fields?.updated
      }
    };
    
    return {
      content: [{
        type: "text",
        text: `📋 **Dados da issue ${issueKey}:**\n\n\`\`\`json\n${JSON.stringify(formatted, null, 2)}\n\`\`\``
      }]
    };
  }

  async getComments(args) {
    const { issueKey, maxResults = 50, orderBy = "created" } = args;
    const params = new URLSearchParams({
      maxResults: maxResults.toString(),
      orderBy
    });
    
    const res = await jiraFetch("GET", `/rest/api/3/issue/${encodeURIComponent(issueKey)}/comment?${params.toString()}`);
    
    const comments = (res.comments || []).map(c => ({
      id: c.id,
      author: {
        displayName: c.author?.displayName,
        emailAddress: c.author?.emailAddress,
        accountId: c.author?.accountId
      },
      body: c.body,
      created: c.created,
      updated: c.updated,
      visibility: c.visibility
    }));
    
    return {
      content: [{
        type: "text",
        text: `💬 **Comentários da issue ${issueKey} (${res.total} total):**\n\n\`\`\`json\n${JSON.stringify({ total: res.total, maxResults: res.maxResults, comments }, null, 2)}\n\`\`\``
      }]
    };
  }

  async getTransitions(args) {
    const { issueKey, expand } = args;
    let path = `/rest/api/3/issue/${encodeURIComponent(issueKey)}/transitions`;
    
    if (expand) {
      path += `?expand=${encodeURIComponent(expand)}`;
    }
    
    const res = await jiraFetch("GET", path);
    
    const transitions = (res.transitions || []).map(t => ({
      id: t.id,
      name: t.name,
      to: {
        id: t.to?.id,
        name: t.to?.name,
        statusCategory: t.to?.statusCategory?.name
      },
      hasScreen: t.hasScreen,
      isGlobal: t.isGlobal,
      isInitial: t.isInitial,
      isConditional: t.isConditional,
      fields: t.fields
    }));
    
    return {
      content: [{
        type: "text",
        text: `🔄 **Transições disponíveis para ${issueKey}:**\n\n\`\`\`json\n${JSON.stringify({ transitions, expand: res.expand }, null, 2)}\n\`\`\`\n\n**Dica:** Use o 'id' da transição desejada com jira.transitionIssue para mover a issue. Se não houver transição direta para o status desejado, será necessário fazer transições intermediárias.`
      }]
    };
  }

  async transitionIssue(args) {
    const { issueKey, transitionId, fields, comment } = args;
    
    const body = {
      transition: { id: transitionId }
    };
    
    if (fields) {
      body.fields = fields;
    }
    
    if (comment) {
      body.update = {
        comment: [{
          add: {
            body: {
              type: "doc",
              version: 1,
              content: [{
                type: "paragraph",
                content: [{ type: "text", text: comment }]
              }]
            }
          }
        }]
      };
    }
    
    await jiraFetch("POST", `/rest/api/3/issue/${encodeURIComponent(issueKey)}/transitions`, body);
    
    // Buscar novo status da issue
    const updated = await jiraFetch("GET", `/rest/api/3/issue/${encodeURIComponent(issueKey)}?fields=status`);
    
    return {
      content: [{
        type: "text",
        text: `✅ **Issue ${issueKey} transicionada com sucesso!**\n\nNovo status: **${updated.fields?.status?.name}**\n\n⚠️ **Importante:** Se você precisa mover para um status específico mas não há transição direta disponível, use jira.getTransitions para verificar as transições intermediárias necessárias.`
      }]
    };
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('🚀 Servidor MCP Jira iniciado');
  }
}

// Iniciar servidor
const server = new JiraMCPServer();
server.run().catch((error) => {
  console.error('❌ Erro fatal:', error);
  process.exit(1);
});

// Cleanup
process.on('SIGINT', async () => {
  console.error('🔌 Desconectando...');
  process.exit(0);
});
