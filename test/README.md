# Testes Automatizados - MCP Jira Server

Este diretório contém testes automatizados para o servidor MCP Jira.

## Estrutura

- **`helpers.test.js`**: Testes unitários para funções auxiliares (não requerem API)
- **`search-jql.test.js`**: Testes específicos para busca JQL (requer credenciais)
- **`integration.test.js`**: Testes de integração completos (requer credenciais)

## Execução

### Pré-requisitos

Para testes de integração, configure as variáveis de ambiente:

```bash
# Copie o exemplo e configure
cp ../.test.env.example ../.env
# Edite .env com suas credenciais
```

### Comandos

```bash
# Todos os testes
npm test

# Apenas testes unitários (não requerem credenciais)
npm run test:unit

# Apenas testes de integração (requerem credenciais)
npm run test:integration

# Apenas testes de busca JQL
npm run test:jql
```

## Testes Unitários (`helpers.test.js`)

Testam funções auxiliares sem fazer chamadas à API:

- ✅ `basicAuthHeader()`: Geração de header Basic Auth
- ✅ `toJiraStartedISO()`: Conversão de datas para formato Jira
- ✅ `extractTextFromADF()`: Extração de texto de formato ADF

**Vantagem:** Podem ser executados sempre, sem credenciais.

## Testes de Integração

### Busca JQL (`search-jql.test.js`)

Testa especificamente o endpoint `/rest/api/3/search/jql`:

- ✅ Validação do endpoint correto
- ✅ Formato de payload (fields como array)
- ✅ Paginação (nextPageToken vs startAt obsoleto)
- ✅ Validação de JQL inválida
- ✅ Uso de `currentUser()` em JQL
- ✅ Verificação de que endpoint antigo retorna 410 Gone

### Integração Completa (`integration.test.js`)

Testa todas as funcionalidades principais:

- ✅ `getIssue`: Obter dados de issue
- ✅ `getComments`: Obter comentários
- ✅ `getTransitions`: Obter transições disponíveis
- ✅ `addComment`: Adicionar comentário (cria dados reais!)
- ✅ `addWorklog`: Adicionar worklog (cria dados reais!)

**⚠️ ATENÇÃO:** Testes de `addComment` e `addWorklog` criam dados reais no Jira. Use com cuidado em ambientes de produção.

## Configuração de Variáveis

```bash
# Obrigatórias para testes de integração
JIRA_BASE_URL=https://seu-dominio.atlassian.net
JIRA_EMAIL=seu-email@exemplo.com
JIRA_API_TOKEN=seu-token-aqui

# Opcional
TEST_ISSUE_KEY=PROJ-123  # Issue para testes (padrão: WECLEVERAN-318)
JIRA_USER_TZ=America/Sao_Paulo
```

## Comportamento de Skip

Testes de integração são automaticamente pulados se:
- Variáveis de ambiente não estiverem configuradas
- Credenciais estiverem inválidas

Isso permite executar `npm test` mesmo sem credenciais - apenas os testes unitários serão executados.

## Exemplo de Saída

```
✓ helpers.test.js (8 testes)
  ✓ basicAuthHeader - gera header correto
  ✓ basicAuthHeader - funciona com caracteres especiais
  ✓ toJiraStartedISO - aceita ISO com offset +03:00
  ...

⏭ search-jql.test.js (6 testes) [SKIP: sem credenciais]
⏭ integration.test.js (5 testes) [SKIP: sem credenciais]
```

## Troubleshooting

### Erro: "Variáveis de ambiente ausentes"
- Configure o arquivo `.env` na raiz do projeto
- Verifique se as variáveis estão corretas

### Erro: "Jira API 401 Unauthorized"
- Verifique se `JIRA_EMAIL` e `JIRA_API_TOKEN` estão corretos
- Confirme que o token não expirou

### Erro: "Jira API 404 Not Found"
- Verifique se `JIRA_BASE_URL` está correto
- Confirme que a issue de teste (`TEST_ISSUE_KEY`) existe

### Testes criando dados no Jira
- Testes de `addComment` e `addWorklog` criam dados reais
- Use uma issue de teste dedicada
- Considere limpar dados de teste após execução

