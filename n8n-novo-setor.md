# Adicionar um setor novo ao menu do WhatsApp (n8n) — manual, sem lógica dinâmica

Guia de referência pra colocar um setor novo (criado antes pela tela `/departamentos` do painel) como uma opção numerada no menu do WhatsApp. Abordagem manual escolhida no lugar da dinâmica — sem mudança estrutural no workflow, só edita o texto de dois nodes existentes. Ver `CLAUDE.md` → "Gestão de setores" pro contexto de por que essa edição é necessária (o menu não lê `GET /departments`, os códigos e o texto são fixos no workflow).

**Não aplicado ainda** — isso é referência pronta pra quando você (ou eu, numa próxima sessão) for aplicar direto na UI do n8n. O n8n roda separado do que está versionado neste repo (`git push` não afeta o n8n rodando).

**Antes de mexer**: exporte o workflow atual pela UI do n8n (Download) como backup.

**Pré-requisito**: o setor já precisa existir em `/departamentos` (painel), com um `codigo` definido — por exemplo "Jurídico" com código `JUR`. É esse `codigo` que entra no `codigoPorOpcao` abaixo.

## 1. Node "Mapear Departamento" (Code)

Adicionar uma linha no objeto `codigoPorOpcao` com o próximo número livre e o `codigo` exato cadastrado no painel:

```js
const original = $('Combinar Fragmentos1').item.json;

// O node HTTP Request separa cada elemento do array retornado pela API
// em um item diferente — por isso reconstruímos o array com .all()
// em vez de usar $input.item.json (que seria só 1 departamento).
const departamentos = $('Buscar Departamentos1').all().map((item) => item.json);

const codigoPorOpcao = {
  '1': 'RH',
  '2': 'FIN',
  '3': 'CONT',
  '4': 'TI',
  '5': 'COM',
  '6': 'JUR', // setor novo — "JUR" precisa bater exatamente com o "codigo" cadastrado em /departamentos
};

const codigo = codigoPorOpcao[original.texto];
const departamento = departamentos.find((d) => d.codigo === codigo);

if (!departamento) {
  throw new Error(`Departamento com código ${codigo} não encontrado. Rode o seed do backend (npm run seed).`);
}

return [
  {
    json: {
      telefone: original.telefone,
      nome: original.nome,
      instance: original.instance,
      texto: original.texto,
      departamento_id: departamento.id,
      departamento_nome: departamento.nome,
    },
  },
];
```

> **Atenção**: no código que você colou na conversa, a última linha estava `departamento_nome: departamento` (sem `.nome`) — isso atribui o objeto inteiro, não só o nome. O node seguinte (`Confirmação`) monta a mensagem `` `Perfeito! Você foi direcionado para o setor de *${mapeado.departamento_nome}*...` `` — com o objeto inteiro em vez da string, isso vira `*[object Object]*` na mensagem que o cliente recebe. Se o seu node ao vivo estiver realmente assim, é um bug independente desta mudança; o bloco acima já está com `departamento.nome` (correto). Confirme no seu node antes de colar por cima.

## 2. Node HTTP que envia o menu (jsonBody)

Acrescentar a linha da opção nova no texto, mantendo o `\n` entre as linhas:

```text
={{ { "number": $('Combinar Fragmentos1').item.json.telefone, "text": "Olá! Seja bem-vindo(a) 👋\n\nEscolha o departamento que você deseja falar:\n\n1 - RH\n2 - Financeiro\n3 - Contabilidade\n4 - TI\n5 - Comercial\n6 - Jurídico\n\nDigite o número da opção desejada." } }}
```

## Pra cada setor novo depois desse

Repetir os dois passos: escolher o próximo número livre, usar o `codigo` exato cadastrado em `/departamentos` no `codigoPorOpcao`, e acrescentar a linha correspondente no texto do menu. Continua sendo uma edição manual por setor — é a limitação já documentada no `CLAUDE.md` (menu não é gerado a partir de `GET /departments`).

## Checklist de teste antes de considerar concluído

- [ ] Exportar o workflow atual como backup antes de começar.
- [ ] Colar as duas edições, salvar, garantir que o workflow continua `Active`.
- [ ] Testar via WhatsApp real: enviar "6" e confirmar que cai no setor novo (`departamento_id` correto, mensagem de confirmação mostrando o nome certo, não `[object Object]`).
- [ ] Testar um número já existente (ex: "1") pra garantir que não quebrou nada.
- [ ] Testar um número fora do intervalo (ex: "9") — deve reenviar o menu, não travar a execução.
- [ ] Atualizar `fluxo-completo-com-backend.json` neste repo (reexportar do n8n) depois de validado, e marcar este arquivo como aplicado no `CLAUDE.md`.
