# Changelog - MCP Jira Server

## [1.1.1] - 2025-11-06

### 🔧 Correções de Compatibilidade

#### ✅ Corrigido problema de compatibilidade de nomes de ferramentas
- **Problema:** O servidor MCP registra ferramentas com nomes usando pontos (jira.getIssue), mas clientes como Cursor normalizam convertendo para underscores (jira_getIssue), causando erro "Ferramenta desconhecida".
- **Solução:** Modificado o switch/case no handler `CallToolRequestSchema` para aceitar ambos os formatos (pontos e underscores) como fallback.
- **Ferramentas afetadas:**
  - `jira.addWorklog` / `jira_addWorklog`
  - `jira.searchJql` / `jira_searchJql`
  - `jira.getIssue` / `jira_getIssue`
  - `jira.getComments` / `jira_getComments`
  - `jira.getTransitions` / `jira_getTransitions`
  - `jira.transitionIssue` / `jira_transitionIssue`
- **Impacto:** Mantém compatibilidade retroativa e resolve erros de "Ferramenta desconhecida" em clientes que normalizam nomes.

---

## [1.1.0] - 2025-10-29

### 🔧 Correções de Prioridade ALTA

#### ✅ Corrigido `searchJql` (Linha 268-275)
- **Removido:** Variável `body` declarada mas não utilizada
- **Atualizado:** Endpoint de `/rest/api/2/search` para `/rest/api/3/search` (consistência com outros métodos)
- **Simplificado:** Lógica de tratamento de campos padrão
- **Impacto:** Melhor manutenibilidade e consistência da API

```diff
- const body = { jql, maxResults, fields: fields ?? [...] };
- const res = await jiraFetch("GET", `/rest/api/2/search?...`);
+ const defaultFields = ["summary", "status", "assignee", "timetracking"];
+ const fieldsList = (fields || defaultFields).join(",");
+ const res = await jiraFetch("GET", `/rest/api/3/search?...`);
```

#### ✅ Melhorado tratamento de erros em `jiraFetch` (Linha 70)
- **Problema:** `json.errors` como objeto era exibido como `[object Object]`
- **Solução:** Serialização adequada de objetos de erro
- **Benefício:** Mensagens de erro mais informativas

```diff
- const msg = json?.errorMessages?.join(" | ") || json?.errors || text || res.statusText;
+ let msg;
+ if (json?.errorMessages?.length) {
+   msg = json.errorMessages.join(" | ");
+ } else if (json?.errors) {
+   msg = typeof json.errors === 'object' 
+     ? JSON.stringify(json.errors) 
+     : json.errors;
+ } else {
+   msg = text || res.statusText;
+ }
```

#### ✅ Atualizado metadados do servidor
- **Nome:** `jira-worklog-mcp` → `jira-mcp-server`
- **Versão:** `1.0.0` → `1.1.0`
- **Descrição:** Atualizada para refletir todas as funcionalidades

---

### 🔧 Correções de Prioridade MÉDIA

#### ✅ Removido parâmetro não utilizado em `toJiraStartedISO` (Linha 18)
- **Removido:** Parâmetro `tz = "UTC"` que não era usado
- **Motivo:** A função sempre usava o timezone local do sistema
- **Benefício:** Código mais claro e sem confusão

```diff
- function toJiraStartedISO(input, tz = "UTC") {
+ function toJiraStartedISO(input) {
```

```diff
- const startedStr = toJiraStartedISO(
-   started || new Date().toISOString(),
-   process.env.JIRA_USER_TZ || "UTC"
- );
+ const startedStr = toJiraStartedISO(
+   started || new Date().toISOString()
+ );
```

#### ✅ Adicionado log de erros de parsing JSON (Linha 65-67)
- **Adicionado:** Console.error quando falha o parse de JSON
- **Benefício:** Debugging mais fácil em produção

```diff
  try { 
    json = text ? JSON.parse(text) : null; 
- } catch { 
+ } catch (parseError) {
+   console.error('⚠️ Erro ao fazer parse da resposta JSON:', parseError.message);
    json = { raw: text }; 
  }
```

#### ✅ Otimizada performance de `getIssue` (Linha 298)
- **Removido:** Busca automática de comentários (campo `comment`)
- **Motivo:** Issues com muitos comentários causavam timeout e resposta lenta
- **Solução:** Usar `jira.getComments` separadamente para maior controle
- **Benefício:** Resposta mais rápida + paginação adequada de comentários

```diff
- const fields = "summary,description,status,assignee,comment,created,updated,priority,issuetype,project";
+ const fields = "summary,description,status,assignee,created,updated,priority,issuetype,project";
```

---

### 📚 Documentação Atualizada

- ✅ README atualizado com nota sobre uso de `jira.getComments`
- ✅ package.json com nova versão e descrição
- ✅ Exemplos de código ajustados

---

### 📊 Resumo das Melhorias

| Categoria | Quantidade | Status |
|-----------|------------|--------|
| Bugs Críticos | 3 | ✅ Corrigidos |
| Melhorias de Performance | 1 | ✅ Implementada |
| Code Smells | 2 | ✅ Removidos |
| Documentação | 3 | ✅ Atualizada |

---

### 🎯 Próximos Passos Sugeridos (Prioridade Baixa)

Estas melhorias não foram implementadas nesta versão, mas são recomendadas:

1. **Validação de Input**: Adicionar validação de formato de `issueKey`
2. **Rate Limiting**: Controle de taxa para evitar bloqueio pela API
3. **Retry Logic**: Retry automático para erros transientes
4. **Cache**: Cachear transições quando chamado múltiplas vezes
5. **TypeScript**: Migrar para TypeScript para type safety
6. **Testes**: Adicionar testes unitários

---

### ✅ Testes

- [x] Validação de sintaxe JavaScript (`node --check`)
- [x] Verificação de todos os endpoints
- [x] Documentação sincronizada com código

---

## [1.0.0] - 2025-10-29

### ✨ Funcionalidades Iniciais

- Adicionar worklogs
- Buscar issues via JQL
- Obter dados de issues
- **NOVO:** Obter comentários de issues
- **NOVO:** Listar transições disponíveis
- **NOVO:** Transicionar issues entre status
- **NOVO:** Suporte a workflows com múltiplas etapas
