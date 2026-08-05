# Adicionar um setor novo ao menu do WhatsApp (n8n) — OBSOLETO

**Superado em 2026-08-05**: o menu do WhatsApp passou a ser gerado dinamicamente a partir de `GET /departments` (ver `CLAUDE.md` → "Menu dinâmico do WhatsApp"). Cadastrar um setor novo em `/departamentos` já é suficiente para ele aparecer numerado no menu — não é mais necessário editar nenhum node do n8n manualmente.

Este arquivo documentava o processo manual anterior (editar `codigoPorOpcao` e o texto do menu direto no workflow) e não se aplica mais. Mantido só como histórico; não seguir os passos abaixo.

---

<details>
<summary>Processo antigo (não aplicável desde 2026-08-05)</summary>

Guia de referência pra colocar um setor novo (criado antes pela tela `/departamentos` do painel) como uma opção numerada no menu do WhatsApp. Abordagem manual escolhida no lugar da dinâmica — sem mudança estrutural no workflow, só edita o texto de dois nodes existentes.

```js
const original = $('Combinar Fragmentos1').item.json;
const departamentos = $('Buscar Departamentos1').all().map((item) => item.json);

const codigoPorOpcao = {
  '1': 'RH',
  '2': 'FIN',
  '3': 'CONT',
  '4': 'TI',
  '5': 'COM',
  '6': 'JUR',
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

</details>
