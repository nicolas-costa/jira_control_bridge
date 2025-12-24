# Changelog - MCP Jira Server

## [1.5.1] - 2025-12-23

### 🐛 Correções Críticas

#### ✅ Corrigido endpoint e formato de paginação em `jira_searchJql`
- **Problema:** O código usava o endpoint `/rest/api/3/search` que foi removido pela Atlassian (410 Gone), causando erro em todas as buscas JQL.
- **Causa:** A Atlassian descontinuou `/rest/api/3/search` em maio de 2025 e migrou para `/rest/api/3/search/jql` com mudanças no formato de paginação.
- **Solução:** 
  - Atualizado para usar o endpoint `/rest/api/3/search/jql` (endpoint oficial de migração)
  - Removido `startAt: 0` do payload (o novo endpoint usa paginação baseada em tokens `nextPageToken`)
  - Mantido `fields` como array (formato correto para o novo endpoint)
- **Impacto:** Todas as buscas JQL agora funcionam corretamente com o novo endpoint da Atlassian.

```diff
- const res = await jiraFetch("POST", "/rest/api/3/search", {
+ const res = await jiraFetch("POST", "/rest/api/3/search/jql", {
    jql,
    maxResults,
-   startAt: 0,  // Removido: novo endpoint usa nextPageToken
    fields: fieldsArray
  });
```

- **Referência:** [Atlassian Migration Guide](https://developer.atlassian.com/changelog/#CHANGE-2046)

### ✨ Novas Funcionalidades

#### ✅ Testes Automatizados
- **Adicionado:** Suite completa de testes automatizados usando Node.js Test Runner (nativo, sem dependências extras)
- **Estrutura de testes:**
  - `test/helpers.test.js`: 12 testes unitários para funções auxiliares (basicAuthHeader, toJiraStartedISO, extractTextFromADF)
  - `test/search-jql.test.js`: 6 testes de integração específicos para busca JQL
  - `test/integration.test.js`: 5 testes de integração para funcionalidades principais
- **Scripts NPM:**
  - `npm test`: Executa todos os testes
  - `npm run test:unit`: Apenas testes unitários (não requerem credenciais)
  - `npm run test:integration`: Testes de integração (requerem credenciais)
  - `npm run test:jql`: Apenas testes de busca JQL
- **Características:**
  - Testes de integração pulam automaticamente se credenciais não estiverem configuradas
  - Suporte a `.env.test` para configuração de credenciais de teste
  - Documentação completa em `test/README.md`
- **Impacto:** Facilita validação contínua e garante que mudanças não quebrem funcionalidades existentes

## [1.5.0] - 2025-12-22

### ✨ Novas Funcionalidades

#### ✅ Retorno de link do worklog
- **Adicionado:** Campo `self` (link) na resposta de `jira_addWorklog`
- **Funcionalidade:** A API do Jira retorna o campo `self` com a URL completa do worklog criado
- **Melhorias na resposta:**
  - Formatação melhorada com estrutura mais clara
  - Conversão automática de tempo para horas (ex: 28800s = 8.00h)
  - Link direto para o worklog no Jira
- **Impacto:** Facilita acesso direto ao worklog criado sem precisar construir a URL manualmente

## [1.4.2] - 2025-12-12

### 🐛 Correções

- ✅ **Migração para novo endpoint:** `jira_searchJql` usa `POST /rest/api/3/search/jql` (endpoint oficial após remoção de `/rest/api/3/search` em maio de 2025).
- ✅ Evita limites de URL para JQLs grandes (POST com body ao invés de querystring).
- ⚠️ **NOTA:** Versão 1.5.1 corrigiu formato de paginação (removido `startAt`, novo endpoint usa `nextPageToken`).

## [1.3.0] - 2025-01-XX

### ✨ Novas Funcionalidades

#### ✅ Adicionar Comentários em Issues
- **Nova ferramenta:** `jira.addComment` para adicionar comentários diretamente em issues
- **Funcionalidades:**
  - Adiciona comentários em texto simples (conversão automática para ADF)
  - Suporte a visibilidade restrita (roles e grupos)
  - Retorna informações do comentário criado (ID, autor, data, conteúdo)
- **Parâmetros:**
  - `issueKey` (obrigatório): Chave da issue
  - `body` (obrigatório): Conteúdo do comentário
  - `visibility` (opcional): Visibilidade do comentário
- **Impacto:** Agora é possível adicionar comentários sem precisar transicionar a issue, completando o ciclo CRUD de comentários

### 📚 Documentação

- ✅ README atualizado com documentação completa da nova ferramenta `jira.addComment`
- ✅ Exemplos de uso adicionados na seção de exemplos
- ✅ Versão atualizada para 1.3.0 em `server.js` e `package.json`

### 🛡️ Compatibilidade MCP

- ✅ Renomeadas todas as ferramentas de `jira.*` para `jira_*`, obedecendo ao regex `^[a-zA-Z0-9_-]{1,64}$` exigido por clientes como o antigravity
- ✅ Mantidos fallbacks no handler (`jira.*`) para garantir compatibilidade retroativa com automações já existentes

### 🔧 Melhorias Técnicas

- ✅ Implementação consistente com padrões existentes (formato ADF, tratamento de erros)
- ✅ Validação de entrada para garantir que `body` não esteja vazio
- ✅ Extração de texto ADF na resposta para facilitar leitura

---

## [1.2.0] - 2025-11-19

### ✨ Novas Funcionalidades

#### ✅ Detecção Genérica de Custom Fields de Descrição
- **Problema:** Alguns projetos do Jira usam custom fields para armazenar descrição ao invés do campo `description` padrão. A implementação anterior era hardcoded para um campo específico.
- **Solução:** Implementada detecção automática e genérica de custom fields que podem conter descrição:
  - Busca metadados dos campos via `editmeta` para obter nomes dos campos
  - Identifica campos com nomes relacionados a descrição (description, descrição, bug description, task description, etc.)
  - Prioriza campos mais específicos usando sistema de score
  - Verifica conteúdo significativo antes de usar
  - Extrai texto do formato ADF automaticamente
- **Campos retornados:**
  - `description`: Texto extraído (do custom field se description padrão estiver vazio)
  - `descriptionSource`: Indica origem (`'standard'` ou `'custom_field:customfield_XXXXX'`)
  - `customDescriptionField`: Informações do custom field usado
  - `descriptionRaw`: Formato ADF original
- **Impacto:** Solução genérica que funciona com qualquer custom field de descrição, sem necessidade de hardcode

#### ✅ Melhorias na API de Comentários
- **Problema:** Comentários retornavam objeto ADF completo, não legível
- **Solução:** 
  - Extração automática de texto do formato ADF usando `extractTextFromADF()`
  - Retorna tanto `body` (texto extraído) quanto `bodyRaw` (ADF original)
  - Adicionado suporte a paginação via parâmetro `startAt`
- **Impacto:** Comentários agora são legíveis diretamente, facilitando uso

#### ✅ Suporte a Testes Locais com dotenv
- **Adicionado:** 
  - `dotenv` como devDependency
  - Carregamento automático de `.env` em desenvolvimento
  - Arquivo `.env.example` como template
  - Script `test_local.js` para testes locais
  - Comando `npm run test:local` para executar testes
- **Impacto:** Facilita desenvolvimento e testes locais sem expor credenciais no código

### 🔧 Melhorias Técnicas

#### ✅ Refatoração de `getIssue`
- Busca custom fields de descrição apenas quando `description` padrão está vazio
- Usa `editmeta` para identificar campos relevantes
- Implementa sistema de score para priorizar campos mais específicos
- Função `findDescriptionCustomFields()` para lógica reutilizável

#### ✅ Melhorias em `getComments`
- Extração de texto ADF implementada
- Suporte a paginação (`startAt`)
- Retorno inclui informações de paginação (`startAt`, `maxResults`, `total`)

### 📚 Documentação

- ✅ README atualizado com explicação da detecção genérica de custom fields
- ✅ Documentação de novos campos retornados (`descriptionSource`, `customDescriptionField`)
- ✅ Exemplos atualizados para refletir novas funcionalidades
- ✅ Adicionado `.env.example` para referência

### 🧪 Testes

- ✅ Script de teste local (`test_local.js`) criado
- ✅ Testes validam detecção de custom fields em múltiplas issues
- ✅ Testes verificam extração de texto ADF em comentários
- ✅ Validação de issues: WECLEVERAN-318, 319, 320

### 📊 Resumo das Mudanças

| Categoria | Quantidade | Status |
|-----------|------------|--------|
| Novas Funcionalidades | 3 | ✅ Implementadas |
| Melhorias Técnicas | 2 | ✅ Concluídas |
| Documentação | 4 | ✅ Atualizada |
| Testes | 1 | ✅ Criado |

---

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
