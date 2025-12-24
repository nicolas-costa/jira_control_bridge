#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema
} from "@modelcontextprotocol/sdk/types.js";
import fetch from "node-fetch";

// Carregar variáveis de ambiente do .env apenas em desenvolvimento
// Em produção, as variáveis devem vir do ambiente (não usar dotenv)
// Nota: Como estamos em ES modules, o dotenv será carregado de forma assíncrona
// mas isso não é problema pois as variáveis são lidas quando necessário
(async () => {
  if (process.env.NODE_ENV !== 'production') {
    try {
      const dotenv = await import('dotenv');
      dotenv.config();
    } catch (error) {
      // dotenv não instalado ou erro ao carregar - ignorar silenciosamente
      // Em produção, as variáveis devem vir do ambiente
    }
  }
})();

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
        version: "1.5.1",
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
            name: "jira_addWorklog",
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
            name: "jira_searchJql",
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
            name: "jira_getIssue",
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
            name: "jira_getComments",
            title: "Obter Comentários",
            description: "Obtém todos os comentários de uma issue do Jira Cloud. Extrai automaticamente o texto do formato ADF.",
            inputSchema: {
              type: "object",
              required: ["issueKey"],
              properties: {
                issueKey: { type: "string", description: "Chave da issue (ex.: ABC-123)" },
                maxResults: { type: "integer", description: "Número máximo de comentários (padrão: 50)" },
                orderBy: { type: "string", enum: ["created", "-created", "+created"], description: "Ordenação dos comentários (-created = mais recentes primeiro)" },
                startAt: { type: "integer", description: "Índice do primeiro resultado (para paginação, padrão: 0)" }
              }
            }
          },
          {
            name: "jira_addComment",
            title: "Adicionar Comentário",
            description: "Adiciona um comentário em uma issue do Jira Cloud.",
            inputSchema: {
              type: "object",
              required: ["issueKey", "body"],
              properties: {
                issueKey: { type: "string", description: "Chave da issue (ex.: ABC-123)" },
                body: {
                  type: "string",
                  description: "Conteúdo do comentário (texto simples). Será convertido para formato ADF automaticamente."
                },
                visibility: {
                  type: "object",
                  description: "Visibilidade do comentário (opcional).",
                  properties: {
                    type: { type: "string", enum: ["role", "group"], description: "Tipo de visibilidade: 'role' ou 'group'" },
                    value: { type: "string", description: "Nome do role ou grupo" }
                  }
                }
              }
            }
          },
          {
            name: "jira_getTransitions",
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
            name: "jira_transitionIssue",
            title: "Transicionar Issue",
            description: "Move uma issue para outro status usando o ID da transição. Use jira_getTransitions para obter as transições disponíveis.",
            inputSchema: {
              type: "object",
              required: ["issueKey", "transitionId"],
              properties: {
                issueKey: { type: "string", description: "Chave da issue (ex.: ABC-123)" },
                transitionId: { type: "string", description: "ID da transição (obtido via jira_getTransitions)" },
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
          case "jira_addWorklog":
          case "jira.addWorklog":  // Fallback legado para normalização do cliente
            return await this.addWorklog(args);
          case "jira_searchJql":
          case "jira.searchJql":  // Fallback legado para normalização do cliente
            return await this.searchJql(args);
          case "jira_getIssue":
          case "jira.getIssue":  // Fallback legado para normalização do cliente
            return await this.getIssue(args);
          case "jira_getComments":
          case "jira.getComments":  // Fallback legado para normalização do cliente
            return await this.getComments(args);
          case "jira_addComment":
          case "jira.addComment":  // Fallback legado para normalização do cliente
            return await this.addComment(args);
          case "jira_getTransitions":
          case "jira.getTransitions":  // Fallback legado para normalização do cliente
            return await this.getTransitions(args);
          case "jira_transitionIssue":
          case "jira.transitionIssue":  // Fallback legado para normalização do cliente
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

    const worklogId = data?.id || "?";
    const worklogLink = data?.self || null;
    
    let responseText = `✅ **Worklog criado em ${issueKey}**\n\n`;
    responseText += `**ID:** ${worklogId}\n`;
    responseText += `**Tempo:** ${timeSpentSeconds}s (${(timeSpentSeconds / 3600).toFixed(2)}h)\n`;
    responseText += `**Início:** ${startedStr}\n`;
    if (worklogLink) {
      responseText += `**Link:** ${worklogLink}\n`;
    }

    return {
      content: [{
        type: "text",
        text: responseText
      }]
    };
  }

  async searchJql(args) {
    const { jql, maxResults = 25, fields } = args;
    const defaultFields = ["summary", "status", "assignee", "timetracking"];
    const fieldsArray = Array.isArray(fields) && fields.length ? fields : defaultFields;

    // Jira Cloud removeu /rest/api/3/search (410 Gone). A rota suportada agora é /rest/api/3/search/jql
    // O novo endpoint /rest/api/3/search/jql usa paginação baseada em tokens (nextPageToken) ao invés de startAt
    // Fields deve ser um array no body do POST
    const res = await jiraFetch("POST", "/rest/api/3/search/jql", {
      jql,
      maxResults,
      fields: fieldsArray
    });
    
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

  // Extrai texto de um nó ADF (Atlassian Document Format)
  extractTextFromADF(adfNode) {
    if (!adfNode || !adfNode.content) return '';
    
    let text = '';
    for (const node of adfNode.content) {
      if (node.type === 'text' && node.text) {
        text += node.text + ' ';
      } else if (node.content) {
        text += this.extractTextFromADF(node) + ' ';
      }
    }
    return text.trim();
  }

  // Verifica se um campo tem conteúdo significativo
  hasSignificantContent(value) {
    if (!value) return false;
    if (typeof value === 'string') return value.trim().length > 10;
    if (typeof value === 'object' && value.content) {
      const text = this.extractTextFromADF(value);
      return text.length > 10;
    }
    return false;
  }

  // Identifica custom fields que podem ser descrição baseado no nome
  // Retorna array de {fieldKey, fieldName, score, value} ordenado por relevância
  async findDescriptionCustomFields(issueKey) {
    try {
      // Obter metadados dos campos para saber os nomes
      const editmeta = await jiraFetch("GET", `/rest/api/3/issue/${encodeURIComponent(issueKey)}/editmeta`);
      
      if (!editmeta.fields) return [];
      
      // Palavras-chave que indicam descrição (case insensitive)
      const descriptionKeywords = [
        'description', 'descrição', 'descricao',
        'bug description', 'bug descrição',
        'issue description', 'issue descrição',
        'task description', 'task descrição',
        'details', 'detalhes',
        'content', 'conteúdo', 'conteudo'
      ];
      
      // Primeiro, identificar campos candidatos pelo nome
      const candidateFieldKeys = [];
      for (const [fieldKey, fieldMeta] of Object.entries(editmeta.fields)) {
        if (!fieldKey.startsWith('customfield_')) continue;
        
        const fieldName = fieldMeta?.name?.toLowerCase() || '';
        const matchesKeyword = descriptionKeywords.some(keyword => 
          fieldName.includes(keyword.toLowerCase())
        );
        
        if (matchesKeyword) {
          candidateFieldKeys.push(fieldKey);
        }
      }
      
      if (candidateFieldKeys.length === 0) return [];
      
      // Buscar os campos candidatos explicitamente (fields=* não retorna todos os custom fields)
      const fieldsList = candidateFieldKeys.join(',');
      const allFields = await jiraFetch("GET", `/rest/api/3/issue/${encodeURIComponent(issueKey)}?fields=${fieldsList}`);
      
      const candidates = [];
      for (const fieldKey of candidateFieldKeys) {
        const fieldMeta = editmeta.fields[fieldKey];
        const fieldName = fieldMeta?.name?.toLowerCase() || '';
        const fieldValue = allFields.fields?.[fieldKey];
        
        // Verificar se tem conteúdo significativo
        if (!this.hasSignificantContent(fieldValue)) continue;
        
        // Calcular score de relevância (mais específico = maior score)
        let score = 1;
        if (fieldName.includes('bug description') || fieldName.includes('bug descrição')) score += 10;
        if (fieldName.includes('task description') || fieldName.includes('task descrição')) score += 9;
        if (fieldName.includes('issue description') || fieldName.includes('issue descrição')) score += 8;
        if (fieldName === 'description' || fieldName === 'descrição') score += 5;
        
        candidates.push({
          fieldKey,
          fieldName: fieldMeta.name,
          score,
          value: fieldValue
        });
      }
      
      // Ordenar por score (maior primeiro) e retornar
      return candidates.sort((a, b) => b.score - a.score);
    } catch (error) {
      // Se não conseguir obter editmeta, retornar vazio (não quebrar o fluxo)
      console.error('⚠️ Erro ao buscar metadados dos campos:', error.message);
      return [];
    }
  }

  async getIssue(args) {
    const { issueKey, expand } = args;
    let path = `/rest/api/3/issue/${encodeURIComponent(issueKey)}`;
    
    // Campos importantes - se description estiver vazio, buscaremos todos os campos
    const baseFields = "summary,description,status,assignee,created,updated,priority,issuetype,project";
    const params = new URLSearchParams({ fields: baseFields });
    
    if (expand && expand.length > 0) {
      params.append('expand', expand.join(','));
    }
    
    let res = await jiraFetch("GET", `${path}?${params.toString()}`);
    
    // Verificar se description está vazio
    let description = res.fields?.description;
    let descriptionText = '';
    let descriptionSource = 'standard';
    let customDescriptionField = null;
    
    const isEmpty = !description || 
      (typeof description === 'object' && (!description.content || description.content.length === 0)) ||
      (typeof description === 'string' && description.trim().length === 0);
    
    if (isEmpty) {
      // Description vazio, procurar custom fields que possam ser descrição
      // A função findDescriptionCustomFields já busca os campos explicitamente
      const descriptionCandidates = await this.findDescriptionCustomFields(issueKey);
      
      if (descriptionCandidates.length > 0) {
        // Usar o campo com maior score (mais relevante)
        const bestCandidate = descriptionCandidates[0];
        customDescriptionField = {
          key: bestCandidate.fieldKey,
          name: bestCandidate.fieldName
        };
        
        if (bestCandidate.value) {
          description = bestCandidate.value;
          if (typeof description === 'object' && description.content) {
            descriptionText = this.extractTextFromADF(description);
          } else if (typeof description === 'string') {
            descriptionText = description;
          }
          descriptionSource = `custom_field:${bestCandidate.fieldKey}`;
        }
      }
    } else {
      // Description padrão tem conteúdo
      if (description && typeof description === 'object' && description.content) {
        descriptionText = this.extractTextFromADF(description);
      } else if (typeof description === 'string') {
        descriptionText = description;
      }
    }
    
    // Formatar resposta de forma mais legível
    const formatted = {
      key: res.key,
      id: res.id,
      self: res.self,
      fields: {
        summary: res.fields?.summary,
        description: descriptionText || description || null,
        descriptionRaw: description, // Manter formato ADF original se necessário
        descriptionSource, // Indica origem: 'standard' ou 'custom_field:customfield_XXXXX'
        customDescriptionField, // Informações do custom field usado (se aplicável)
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
    const { issueKey, maxResults = 50, orderBy = "created", startAt = 0 } = args;
    const params = new URLSearchParams({
      maxResults: maxResults.toString(),
      orderBy,
      startAt: startAt.toString()
    });
    
    const res = await jiraFetch("GET", `/rest/api/3/issue/${encodeURIComponent(issueKey)}/comment?${params.toString()}`);
    
    const comments = (res.comments || []).map(c => {
      // Extrair texto do formato ADF se o body for um objeto ADF
      let bodyText = '';
      let bodyRaw = c.body;
      
      if (c.body && typeof c.body === 'object' && c.body.content) {
        bodyText = this.extractTextFromADF(c.body);
      } else if (typeof c.body === 'string') {
        bodyText = c.body;
      }
      
      return {
        id: c.id,
        author: {
          displayName: c.author?.displayName,
          emailAddress: c.author?.emailAddress,
          accountId: c.author?.accountId
        },
        body: bodyText || bodyRaw, // Retornar texto extraído, ou raw se não conseguir extrair
        bodyRaw: bodyRaw, // Manter formato ADF original para referência
        created: c.created,
        updated: c.updated,
        visibility: c.visibility
      };
    });
    
    return {
      content: [{
        type: "text",
        text: `💬 **Comentários da issue ${issueKey} (${res.total} total, mostrando ${comments.length}):**\n\n\`\`\`json\n${JSON.stringify({ total: res.total, startAt: res.startAt || 0, maxResults: res.maxResults, comments }, null, 2)}\n\`\`\``
      }]
    };
  }

  async addComment(args) {
    const { issueKey, body, visibility } = args;
    
    if (!body || typeof body !== 'string' || body.trim().length === 0) {
      throw new Error("O campo 'body' é obrigatório e deve conter texto.");
    }
    
    // Converter texto simples para formato ADF (Atlassian Document Format)
    const bodyADF = {
      type: "doc",
      version: 1,
      content: [{
        type: "paragraph",
        content: [{ type: "text", text: body.trim() }]
      }]
    };
    
    const requestBody = {
      body: bodyADF,
      ...(visibility ? { visibility } : {})
    };
    
    const data = await jiraFetch("POST", `/rest/api/3/issue/${encodeURIComponent(issueKey)}/comment`, requestBody);
    
    // Extrair texto do comentário criado para resposta
    let commentText = '';
    if (data.body && typeof data.body === 'object' && data.body.content) {
      commentText = this.extractTextFromADF(data.body);
    } else if (typeof data.body === 'string') {
      commentText = data.body;
    }
    
    return {
      content: [{
        type: "text",
        text: `✅ **Comentário adicionado com sucesso na issue ${issueKey}!**\n\n**ID do comentário:** ${data.id}\n**Autor:** ${data.author?.displayName || 'N/A'}\n**Criado em:** ${data.created || 'N/A'}\n**Conteúdo:**\n${commentText || body.trim()}`
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
        text: `🔄 **Transições disponíveis para ${issueKey}:**\n\n\`\`\`json\n${JSON.stringify({ transitions, expand: res.expand }, null, 2)}\n\`\`\`\n\n**Dica:** Use o 'id' da transição desejada com jira_transitionIssue para mover a issue. Se não houver transição direta para o status desejado, será necessário fazer transições intermediárias.`
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
        text: `✅ **Issue ${issueKey} transicionada com sucesso!**\n\nNovo status: **${updated.fields?.status?.name}**\n\n⚠️ **Importante:** Se você precisa mover para um status específico mas não há transição direta disponível, use jira_getTransitions para verificar as transições intermediárias necessárias.`
      }]
    };
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('🚀 Servidor MCP Jira v1.5.1 iniciado');
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
