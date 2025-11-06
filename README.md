# MCP Jira Server

Servidor MCP (Model Context Protocol) para integração com Jira Cloud, permitindo buscar issues, adicionar worklogs e obter informações detalhadas de tarefas.

## 🚀 Funcionalidades

- **Buscar Issues**: Obter dados detalhados de issues específicas com descrição, comentários e status
- **Adicionar Worklogs**: Registrar tempo trabalhado em issues
- **Buscar via JQL**: Pesquisar issues usando JQL (Java Query Language)
- **Obter Comentários**: Buscar todos os comentários de uma issue
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

### 1. **jira.getIssue**
Obtém dados completos de uma issue específica, incluindo descrição, status, comentários e outros campos importantes.

**Parâmetros:**
- `issueKey` (obrigatório): Chave da issue (ex: "PROJ-123")
- `expand` (opcional): Array de campos expandidos (ex: ["renderedFields"] para descrição formatada)

**Exemplo:**
```javascript
// Buscar issue com todos os campos importantes
jira.getIssue({ issueKey: "WECLEVERAN-254" })

// Buscar com campos renderizados
jira.getIssue({ 
  issueKey: "WECLEVERAN-254", 
  expand: ["renderedFields"] 
})
```

**Retorna:**
- Summary, description, status, assignee, priority, issuetype
- Datas de criação e atualização
- Informações do projeto

**Nota:** Para obter comentários, use `jira.getComments` para melhor performance e controle de paginação.

### 2. **jira.addWorklog**
Adiciona um worklog (registro de tempo) em uma issue.

**Parâmetros:**
- `issueKey` (obrigatório): Chave da issue
- `timeSpentSeconds` (obrigatório): Tempo em segundos (ex: 28800 = 8h)
- `started` (opcional): Data/hora de início (ISO format)
- `comment` (opcional): Comentário do worklog
- `visibility` (opcional): Visibilidade do worklog

**Exemplo:**
```javascript
jira.addWorklog({
  issueKey: "WECLEVERAN-254",
  timeSpentSeconds: 28800, // 8 horas
  started: "2025-10-01T09:00:00-03:00",
  comment: "Desenvolvimento da funcionalidade X"
})
```

### 3. **jira.searchJql**
Busca issues usando JQL (Java Query Language).

**Parâmetros:**
- `jql` (obrigatório): Query JQL
- `maxResults` (opcional): Máximo de resultados (padrão: 25)
- `fields` (opcional): Array de campos para retornar

**Exemplo:**
```javascript
jira.searchJql({
  jql: "assignee = currentUser() AND status = 'In Progress'",
  maxResults: 10,
  fields: ["summary", "status", "worklog"]
})
```

### 4. **jira.getComments**
Obtém todos os comentários de uma issue do Jira Cloud.

**Parâmetros:**
- `issueKey` (obrigatório): Chave da issue
- `maxResults` (opcional): Número máximo de comentários (padrão: 50)
- `orderBy` (opcional): Ordenação ("created", "-created", "+created")

**Exemplo:**
```javascript
jira.getComments({
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

### 5. **jira.getTransitions**
Obtém todas as transições de status disponíveis para uma issue, considerando as regras do workflow do board.

**Parâmetros:**
- `issueKey` (obrigatório): Chave da issue
- `expand` (opcional): Campos para expandir (ex: "transitions.fields")

**Exemplo:**
```javascript
jira.getTransitions({
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

### 6. **jira.transitionIssue**
Move uma issue para outro status usando o ID da transição.

**Parâmetros:**
- `issueKey` (obrigatório): Chave da issue
- `transitionId` (obrigatório): ID da transição (obtido via jira.getTransitions)
- `fields` (opcional): Campos adicionais requeridos pela transição
- `comment` (opcional): Comentário ao transicionar

**Exemplo:**
```javascript
// 1. Primeiro, obter transições disponíveis
jira.getTransitions({ issueKey: "PROJ-123" })

// 2. Depois, transicionar usando o ID
jira.transitionIssue({
  issueKey: "PROJ-123",
  transitionId: "31", // ID obtido do passo anterior
  comment: "Movendo para próximo status"
})

// 3. Com campos adicionais (se necessário)
jira.transitionIssue({
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
1. Usar `jira.getTransitions` para ver as transições disponíveis
2. Fazer transições intermediárias uma por uma
3. Verificar o novo status após cada transição

**Exemplo de transição gradual:**
```javascript
// Cenário: Mover de "To Do" → "Done", mas board requer passar por "In Progress"

// Passo 1: To Do → In Progress
jira.transitionIssue({ issueKey: "PROJ-123", transitionId: "21" })

// Passo 2: Verificar transições disponíveis no novo status
jira.getTransitions({ issueKey: "PROJ-123" })

// Passo 3: In Progress → Done
jira.transitionIssue({ issueKey: "PROJ-123", transitionId: "31" })
```

## 📝 Exemplos de Uso

### Buscar minhas issues em progresso:
```javascript
jira.searchJql({
  jql: "assignee = currentUser() AND status = 'In Progress'",
  maxResults: 5
})
```

### Registrar 8 horas de trabalho:
```javascript
jira.addWorklog({
  issueKey: "PROJ-123",
  timeSpentSeconds: 28800, // 8 horas
  started: "2025-10-01T09:00:00-03:00",
  comment: "Desenvolvimento da feature X"
})
```

### Obter detalhes completos de uma issue:
```javascript
jira.getIssue({
  issueKey: "PROJ-123"
})
// Retorna: summary, description, status, assignee, priority, dates, etc.
// Para comentários, use jira.getComments separadamente
```

### Obter apenas comentários de uma issue:
```javascript
jira.getComments({
  issueKey: "PROJ-123",
  maxResults: 20,
  orderBy: "-created"
})
```

### Mover uma issue para outro status:
```javascript
// 1. Verificar transições disponíveis
jira.getTransitions({ issueKey: "PROJ-123" })
// Output: Lista de transições com IDs e status de destino

// 2. Executar transição
jira.transitionIssue({
  issueKey: "PROJ-123",
  transitionId: "31", // ID da transição desejada
  comment: "Movendo para Done"
})
```

### Workflow com múltiplas etapas:
```javascript
// Cenário: Board não permite "To Do" → "Done" diretamente

// Passo 1: Verificar transições de "To Do"
jira.getTransitions({ issueKey: "PROJ-123" })
// Output: Apenas "To Do" → "In Progress" disponível (ID: 21)

// Passo 2: Mover para "In Progress"
jira.transitionIssue({ issueKey: "PROJ-123", transitionId: "21" })

// Passo 3: Verificar transições de "In Progress"
jira.getTransitions({ issueKey: "PROJ-123" })
// Output: "In Progress" → "Done" disponível (ID: 31)

// Passo 4: Mover para "Done"
jira.transitionIssue({ issueKey: "PROJ-123", transitionId: "31" })
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

### Erro 410 "API has been removed":
- O endpoint de busca JQL pode estar com problemas
- Use `jira.getIssue` para buscar issues específicas

### Timezone Issues:
- Configure `JIRA_USER_TZ` corretamente
- Use formato ISO com timezone: `2025-10-01T09:00:00-03:00`

### Transições não disponíveis:
- Se uma transição esperada não aparece, verifique as regras do workflow no Jira
- Alguns boards têm regras que impedem transições diretas entre certos status
- Use `jira.getTransitions` para ver exatamente quais transições estão disponíveis
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
