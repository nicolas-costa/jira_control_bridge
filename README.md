# MCP Jira Server

Servidor MCP (Model Context Protocol) para integração com Jira Cloud, permitindo buscar issues, adicionar worklogs, baixar anexos e obter informações detalhadas de tarefas.

## 🚀 Funcionalidades

- **Buscar Issues**: Obter dados detalhados de issues específicas com descrição, comentários e status
- **Adicionar Worklogs**: Registrar tempo trabalhado em issues
- **Buscar via JQL**: Pesquisar issues usando JQL (Java Query Language)
- **Obter Comentários**: Buscar todos os comentários de uma issue
- **Adicionar Comentários**: Adicionar comentários em issues
- **Listar e Baixar Anexos**: Consultar anexos de um card e salvar arquivos localmente
- **Adicionar Anexos**: Enviar arquivos ao card com ou sem comentário
- **Gerenciar Transições**: Visualizar transições disponíveis e mover issues entre status
- **Workflow Inteligente**: Detectar e navegar por regras de transição do board

## 📋 Pré-requisitos

- Node.js 18+ 
- Conta no Jira Cloud
- Token de API do Jira

## 🔧 Instalação

1. **Clone o repositório** (se ainda não tiver):
```bash
git clone <seu-repositorio>
cd mcp_servers/mcp_jira
```

2. **Instale as dependências**:
```bash
npm install
```

3. **Configure as variáveis de ambiente**:
```bash
export JIRA_BASE_URL="https://seu-dominio.atlassian.net"
export JIRA_EMAIL="seu-email@exemplo.com"
export JIRA_API_TOKEN="seu-token-aqui"
export JIRA_USER_TZ="America/Sao_Paulo"  # Opcional, padrão: UTC
```

4. **Instale globalmente**:
```bash
npm link
```

## 🔑 Configuração das Variáveis de Ambiente

### Obrigatórias:
- `JIRA_BASE_URL`: URL base do seu Jira (ex: `https://softohq.atlassian.net`)
- `JIRA_EMAIL`: Seu email do Jira
- `JIRA_API_TOKEN`: Token de API do Jira

### Opcionais:
- `JIRA_USER_TZ`: Timezone do usuário (padrão: UTC)

### Como obter o Token de API:
1. Acesse [Atlassian Account Settings](https://id.atlassian.com/manage-profile/security/api-tokens)
2. Clique em "Create API token"
3. Dê um nome para o token
4. Copie o token gerado

## 🎯 Configuração no Cursor

Adicione ao seu `mcp.json` do Cursor:

```json
{
  "mcpServers": {
    "jira": {
      "command": "jira-mcp-server",
      "args": [],
      "env": {
        "JIRA_BASE_URL": "https://seu-dominio.atlassian.net",
        "JIRA_EMAIL": "seu-email@exemplo.com",
        "JIRA_API_TOKEN": "seu-token-aqui",
        "JIRA_USER_TZ": "America/Sao_Paulo"
      },
      "autoStart": true
    }
  }
}
```

## 🛠️ Ferramentas Disponíveis

> ⚠️ **Importante:** Os nomes das ferramentas seguem o padrão `jira_nomeDaFerramenta` (sem pontos) para cumprir o regex `^[a-zA-Z0-9_-]{1,64}$` exigido pelo MCP. Clients antigos que ainda chamam `jira.nomeDaFerramenta` continuam funcionando graças a fallbacks no servidor.

### 1. **jira_getIssue**
Obtém dados completos de uma issue específica, incluindo descrição, status, comentários e outros campos importantes.

**Parâmetros:**
- `issueKey` (obrigatório): Chave da issue (ex: "PROJ-123")
- `expand` (opcional): Array de campos expandidos (ex: ["renderedFields"] para descrição formatada)

**Exemplo:**
```javascript
// Buscar issue com todos os campos importantes
jira_getIssue({ issueKey: "WECLEVERAN-254" })

// Buscar com campos renderizados
jira_getIssue({ 
  issueKey: "WECLEVERAN-254", 
  expand: ["renderedFields"] 
})
```

**Retorna:**
- Summary, description, status, assignee, priority, issuetype
- Datas de criação e atualização
- Informações do projeto
- **Descrição inteligente**: Se o campo `description` padrão estiver vazio, o servidor automaticamente busca e identifica custom fields que possam conter a descrição baseado no nome do campo
- `descriptionRaw`: Formato ADF original da descrição (se disponível)
- `descriptionSource`: Indica a origem da descrição (`'standard'` ou `'custom_field:customfield_XXXXX'`)
- `customDescriptionField`: Informações do custom field usado como descrição (se aplicável)

**Nota:** Para obter comentários, use `jira_getComments` para melhor performance e controle de paginação.

**🔍 Detecção Automática de Descrição Customizada:**
Em alguns projetos do Jira, a descrição do card é armazenada em custom fields ao invés do campo `description` padrão. O servidor MCP detecta automaticamente quando `description` está vazio e:

1. **Busca metadados dos campos** para obter os nomes dos custom fields
2. **Identifica campos relevantes** que contenham palavras-chave como:
   - "description", "descrição", "descricao"
   - "bug description", "bug descrição"
   - "issue description", "task description"
   - "details", "detalhes", "content", "conteúdo"
3. **Prioriza campos mais específicos** (ex: "Bug Description" tem prioridade sobre "Description")
4. **Verifica conteúdo significativo** (campos vazios são ignorados)
5. **Extrai texto** do formato ADF (Atlassian Document Format) quando necessário

Esta solução é **genérica** e dev funcionar com qualquer custom field que tenha nome relacionado a descrição, não sendo necessário hardcode de IDs específicos.

### 2. **jira_addWorklog**
Adiciona um worklog (registro de tempo) em uma issue.

**Parâmetros:**
- `issueKey` (obrigatório): Chave da issue
- `timeSpentSeconds` (obrigatório): Tempo em segundos (ex: 28800 = 8h)
- `started` (opcional): Data/hora de início (ISO format)
- `comment` (opcional): Comentário do worklog
- `visibility` (opcional): Visibilidade do worklog

**Exemplo:**
```javascript
jira_addWorklog({
  issueKey: "WECLEVERAN-254",
  timeSpentSeconds: 28800, // 8 horas
  started: "2025-10-01T09:00:00-03:00",
  comment: "Desenvolvimento da funcionalidade X"
})
```

### 3. **jira_searchJql**
Busca issues usando JQL (Java Query Language).

**Parâmetros:**
- `jql` (obrigatório): Query JQL
- `maxResults` (opcional): Máximo de resultados (padrão: 25)
- `fields` (opcional): Array de campos para retornar

**Exemplo:**
```javascript
jira_searchJql({
  jql: "assignee = currentUser() AND status = 'In Progress'",
  maxResults: 10,
  fields: ["summary", "status", "worklog"]
})
```

### 4. **jira_getComments**
Obtém todos os comentários de uma issue do Jira Cloud.

**Parâmetros:**
- `issueKey` (obrigatório): Chave da issue
- `maxResults` (opcional): Número máximo de comentários (padrão: 50)
- `orderBy` (opcional): Ordenação ("created", "-created", "+created")

**Exemplo:**
```javascript
jira_getComments({
  issueKey: "PROJ-123",
  maxResults: 10,
  orderBy: "-created" // Mais recentes primeiro
})
```

**Retorna:**
- ID do comentário
- Autor (nome, email, accountId)
- Corpo do comentário
- Datas de criação e atualização
- Visibilidade

### 5. **jira_addComment**
Adiciona um comentário em uma issue do Jira Cloud. Opcionalmente envia anexos locais junto com o comentário.

**Parâmetros:**
- `issueKey` (obrigatório): Chave da issue
- `body` (opcional): Conteúdo do comentário (texto simples). Obrigatório se `attachmentPaths` não for informado
- `attachmentPaths` (opcional): Array de caminhos locais de arquivos para anexar à issue
- `visibility` (opcional): Visibilidade do comentário

**Exemplo:**
```javascript
// Comentário simples
jira_addComment({
  issueKey: "PROJ-123",
  body: "Este é um comentário de exemplo"
})

// Comentário com anexos
jira_addComment({
  issueKey: "PROJ-123",
  body: "Segue evidência do bug em anexo",
  attachmentPaths: ["/tmp/screenshot.png", "/tmp/log.txt"]
})

// Comentário com visibilidade restrita
jira_addComment({
  issueKey: "PROJ-123",
  body: "Comentário visível apenas para desenvolvedores",
  visibility: {
    type: "role",
    value: "Developers"
  }
})
```

**Retorna:**
- ID, autor, data e conteúdo do comentário criado
- Lista de anexos enviados (quando `attachmentPaths` for usado)

**Nota:** O texto do comentário é automaticamente convertido para o formato ADF (Atlassian Document Format). Os anexos são vinculados à issue (limitação da API do Jira Cloud), mas aparecem no histórico junto com o comentário.

### 6. **jira_getTransitions**
Obtém todas as transições de status disponíveis para uma issue, considerando as regras do workflow do board.

**Parâmetros:**
- `issueKey` (obrigatório): Chave da issue
- `expand` (opcional): Campos para expandir (ex: "transitions.fields")

**Exemplo:**
```javascript
jira_getTransitions({
  issueKey: "PROJ-123",
  expand: "transitions.fields"
})
```

**Retorna:**
- ID e nome de cada transição disponível
- Status de destino (id, nome, categoria)
- Indicadores: hasScreen, isGlobal, isInitial, isConditional
- Campos requeridos pela transição

**⚠️ Importante sobre Workflows:**
Esta ferramenta respeita as regras do board. Se você quiser mover uma issue de "Ready for Deployment" para "Done", mas o board não permite essa transição direta, o retorno mostrará apenas as transições disponíveis a partir do status atual. Você precisará fazer transições intermediárias.

### 7. **jira_transitionIssue**
Move uma issue para outro status usando o ID da transição.

**Parâmetros:**
- `issueKey` (obrigatório): Chave da issue
- `transitionId` (obrigatório): ID da transição (obtido via jira_getTransitions)
- `fields` (opcional): Campos adicionais requeridos pela transição
- `comment` (opcional): Comentário ao transicionar

**Exemplo:**
```javascript
// 1. Primeiro, obter transições disponíveis
jira_getTransitions({ issueKey: "PROJ-123" })

// 2. Depois, transicionar usando o ID
jira_transitionIssue({
  issueKey: "PROJ-123",
  transitionId: "31", // ID obtido do passo anterior
  comment: "Movendo para próximo status"
})

// 3. Com campos adicionais (se necessário)
jira_transitionIssue({
  issueKey: "PROJ-123",
  transitionId: "51",
  fields: {
    resolution: { name: "Done" }
  },
  comment: "Tarefa concluída"
})
```

**⚠️ Workflow com Múltiplas Etapas:**
Se o board tiver regras que impeçam transição direta (ex: "Ready for Deployment" → "Done"), você precisará:
1. Usar `jira_getTransitions` para ver as transições disponíveis
2. Fazer transições intermediárias uma por uma
3. Verificar o novo status após cada transição

**Exemplo de transição gradual:**
```javascript
// Cenário: Mover de "To Do" → "Done", mas board requer passar por "In Progress"

// Passo 1: To Do → In Progress
jira_transitionIssue({ issueKey: "PROJ-123", transitionId: "21" })

// Passo 2: Verificar transições disponíveis no novo status
jira_getTransitions({ issueKey: "PROJ-123" })

// Passo 3: In Progress → Done
jira_transitionIssue({ issueKey: "PROJ-123", transitionId: "31" })
```

### 8. **jira_getAttachments**
Lista todos os anexos de uma issue do Jira Cloud.

**Parâmetros:**
- `issueKey` (obrigatório): Chave da issue

**Exemplo:**
```javascript
jira_getAttachments({ issueKey: "PROJ-123" })
```

**Retorna:**
- ID, nome, tamanho, tipo MIME, autor e data de criação de cada anexo
- `contentUrl`: URL de download na API do Jira
- `issueBrowseUrl`: Link da issue no Jira

**Dica:** Use o campo `id` retornado com `jira_downloadAttachment` para baixar o arquivo.

### 9. **jira_downloadAttachment**
Baixa um anexo do Jira Cloud pelo ID.

**Parâmetros:**
- `attachmentId` (obrigatório): ID do anexo (obtido via `jira_getAttachments`)
- `outputPath` (opcional): Caminho local para salvar. Se terminar com `/`, o nome original do arquivo é usado
- `asBase64` (opcional): Se `true`, retorna o conteúdo em base64 (máx. 5 MB) em vez de salvar em disco

**Exemplo:**
```javascript
// 1. Listar anexos
jira_getAttachments({ issueKey: "PROJ-123" })

// 2. Salvar em arquivo específico
jira_downloadAttachment({
  attachmentId: "10001",
  outputPath: "/tmp/screenshot.png"
})

// 3. Salvar em diretório (usa nome original do anexo)
jira_downloadAttachment({
  attachmentId: "10001",
  outputPath: "/tmp/anexos/"
})

// 4. Retornar conteúdo pequeno em base64
jira_downloadAttachment({
  attachmentId: "10001",
  asBase64: true
})
```

**Retorna:**
- Com `outputPath`: caminho salvo (`savedTo`), tamanho e tipo MIME
- Com `asBase64`: conteúdo em base64 no campo `contentBase64`

### 10. **jira_addAttachment**
Envia um ou mais arquivos locais como anexos de uma issue, **sem criar comentário**.

**Parâmetros:**
- `issueKey` (obrigatório): Chave da issue
- `filePaths` (obrigatório): Array de caminhos locais dos arquivos

**Exemplo:**
```javascript
// Anexar um arquivo
jira_addAttachment({
  issueKey: "PROJ-123",
  filePaths: ["/tmp/screenshot.png"]
})

// Anexar múltiplos arquivos
jira_addAttachment({
  issueKey: "PROJ-123",
  filePaths: ["/tmp/evidencia.png", "/tmp/console.log"]
})
```

**Retorna:**
- ID, nome, tamanho e tipo MIME de cada anexo criado
- `issueBrowseUrl`: Link da issue no Jira

## 📝 Exemplos de Uso

### Buscar minhas issues em progresso:
```javascript
jira_searchJql({
  jql: "assignee = currentUser() AND status = 'In Progress'",
  maxResults: 5
})
```

### Registrar 8 horas de trabalho:
```javascript
jira_addWorklog({
  issueKey: "PROJ-123",
  timeSpentSeconds: 28800, // 8 horas
  started: "2025-10-01T09:00:00-03:00",
  comment: "Desenvolvimento da feature X"
})
```

### Obter detalhes completos de uma issue:
```javascript
jira_getIssue({
  issueKey: "PROJ-123"
})
// Retorna: summary, description, status, assignee, priority, dates, etc.
// Para comentários, use jira_getComments separadamente
```

### Obter apenas comentários de uma issue:
```javascript
jira_getComments({
  issueKey: "PROJ-123",
  maxResults: 20,
  orderBy: "-created"
})
```

### Adicionar um comentário em uma issue:
```javascript
jira_addComment({
  issueKey: "PROJ-123",
  body: "Atualização: Implementei a funcionalidade solicitada. Aguardando revisão."
})
```

### Adicionar comentário com anexo:
```javascript
jira_addComment({
  issueKey: "PROJ-123",
  body: "Segue print do erro",
  attachmentPaths: ["/tmp/erro.png"]
})
```

### Anexar arquivo sem comentário:
```javascript
jira_addAttachment({
  issueKey: "PROJ-123",
  filePaths: ["/tmp/especificacao.pdf"]
})
```

### Baixar anexos de uma issue:
```javascript
// 1. Listar anexos disponíveis
jira_getAttachments({ issueKey: "PROJ-123" })

// 2. Baixar o primeiro anexo para disco
jira_downloadAttachment({
  attachmentId: "10001",
  outputPath: "/tmp/anexos/"
})
```

### Mover uma issue para outro status:
```javascript
// 1. Verificar transições disponíveis
jira_getTransitions({ issueKey: "PROJ-123" })
// Output: Lista de transições com IDs e status de destino

// 2. Executar transição
jira_transitionIssue({
  issueKey: "PROJ-123",
  transitionId: "31", // ID da transição desejada
  comment: "Movendo para Done"
})
```

### Workflow com múltiplas etapas:
```javascript
// Cenário: Board não permite "To Do" → "Done" diretamente

// Passo 1: Verificar transições de "To Do"
jira_getTransitions({ issueKey: "PROJ-123" })
// Output: Apenas "To Do" → "In Progress" disponível (ID: 21)

// Passo 2: Mover para "In Progress"
jira_transitionIssue({ issueKey: "PROJ-123", transitionId: "21" })

// Passo 3: Verificar transições de "In Progress"
jira_getTransitions({ issueKey: "PROJ-123" })
// Output: "In Progress" → "Done" disponível (ID: 31)

// Passo 4: Mover para "Done"
jira_transitionIssue({ issueKey: "PROJ-123", transitionId: "31" })
```

## 🔍 JQL (Java Query Language)

O JQL permite fazer buscas avançadas no Jira:

```javascript
// Minhas issues
"assignee = currentUser()"

// Issues por projeto
"project = PROJ"

// Issues por status
"status = 'In Progress'"

// Issues com worklogs
"worklogAuthor = currentUser()"

// Issues atualizadas esta semana
"updated >= startOfWeek()"

// Combinações
"assignee = currentUser() AND status = 'In Progress' AND updated >= startOfWeek()"
```

## 🚨 Troubleshooting

### Erro de Autenticação:
- Verifique se o `JIRA_EMAIL` e `JIRA_API_TOKEN` estão corretos
- Confirme se o token tem as permissões necessárias

### Erro 410 "Gone" em buscas JQL:
- O endpoint `/rest/api/3/search` foi removido pela Atlassian em maio de 2025
- O servidor MCP já está migrado para `/rest/api/3/search/jql` (versão 1.5.1+)
- Se ainda receber erro 410, atualize para a versão mais recente

### Erro 400 "Bad Request" em buscas JQL:
- Verifique se a query JQL está correta
- Certifique-se de que o projeto existe e você tem permissão para acessá-lo
- Valide a sintaxe JQL na interface do Jira antes de usar
- O endpoint correto é `/rest/api/3/search/jql` (POST) - novo endpoint após migração da Atlassian

### Timezone Issues:
- Configure `JIRA_USER_TZ` corretamente
- Use formato ISO com timezone: `2025-10-01T09:00:00-03:00`

### Transições não disponíveis:
- Se uma transição esperada não aparece, verifique as regras do workflow no Jira
- Alguns boards têm regras que impedem transições diretas entre certos status
- Use `jira_getTransitions` para ver exatamente quais transições estão disponíveis
- Pode ser necessário fazer transições intermediárias

### Erro ao transicionar:
- Verifique se o `transitionId` está correto
- Algumas transições requerem campos adicionais (ex: resolution)
- Use `expand: "transitions.fields"` em `getTransitions` para ver campos requeridos
- Certifique-se de que o usuário tem permissão para fazer a transição

### Descrição ou comentários vazios:
- A API v3 do Jira retorna descrição em formato ADF (Atlassian Document Format)
- Use `expand: ["renderedFields"]` para obter versão renderizada em HTML
- Comentários também usam formato ADF na estrutura `body`

## 🧪 Testes

O projeto inclui testes automatizados usando Node.js Test Runner (nativo, sem dependências extras).

### Executar Testes

```bash
# Executar todos os testes
npm test

# Apenas testes unitários (funções auxiliares)
npm run test:unit

# Apenas testes de integração (requer credenciais)
npm run test:integration

# Apenas testes de busca JQL
npm run test:jql
```

### Configuração para Testes

Os testes de integração requerem variáveis de ambiente configuradas. Copie `.test.env.example` para `.env` e preencha:

```bash
cp .test.env.example .env
# Edite .env com suas credenciais
```

**Variáveis necessárias:**
- `JIRA_BASE_URL`: URL base do Jira
- `JIRA_EMAIL`: Email da conta
- `JIRA_API_TOKEN`: Token de API
- `TEST_ISSUE_KEY` (opcional): Issue para testes de integração

### Estrutura de Testes

- **`test/helpers.test.js`**: Testes unitários para funções auxiliares
  - `basicAuthHeader()`: Geração de header de autenticação
  - `toJiraStartedISO()`: Conversão de datas para formato Jira
  - `extractTextFromADF()`: Extração de texto de formato ADF

- **`test/search-jql.test.js`**: Testes específicos para busca JQL
  - Validação do endpoint `/rest/api/3/search/jql`
  - Formato de payload (fields como array)
  - Paginação (nextPageToken vs startAt)
  - Validação de JQL inválida

- **`test/integration.test.js`**: Testes de integração completos
  - `getIssue`: Obter dados de issue
  - `getComments`: Obter comentários
  - `getTransitions`: Obter transições disponíveis
  - `addComment`: Adicionar comentário
  - `addWorklog`: Adicionar worklog
  - `getAttachments`: Listar anexos de uma issue
  - `downloadAttachment`: Baixar anexo para disco
  - `addAttachment`: Enviar anexo(s) para uma issue

### Notas sobre Testes

- **Testes unitários** não requerem credenciais e podem ser executados sempre
- **Testes de integração** requerem credenciais válidas e fazem chamadas reais à API
- Testes são automaticamente pulados (`skip`) se credenciais não estiverem configuradas
- Testes de integração podem criar dados reais (comentários, worklogs) - use com cuidado

## 📚 Recursos Adicionais

- [Documentação Jira REST API](https://developer.atlassian.com/cloud/jira/platform/rest/v3/)
- [JQL Reference](https://www.atlassian.com/software/jira/guides/expand-jira/jql)
- [Atlassian API Tokens](https://id.atlassian.com/manage-profile/security/api-tokens)

## 🤝 Contribuição

1. Fork o projeto
2. Crie uma branch para sua feature (`git checkout -b feature/nova-funcionalidade`)
3. Commit suas mudanças (`git commit -am 'Adiciona nova funcionalidade'`)
4. Push para a branch (`git push origin feature/nova-funcionalidade`)
5. Abra um Pull Request

## 📄 Licença

Este projeto está sob a licença ISC.
