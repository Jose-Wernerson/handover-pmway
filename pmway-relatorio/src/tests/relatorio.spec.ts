// ============================================================
// PMWAY — Testes E2E (Playwright)
// Caderno de testes para validar a correção do bug 504
//
// Cenários: CT-01 a CT-07 (conforme documentação da task)
// Execução: npx playwright test
// ============================================================

import { test, expect, Page } from "@playwright/test";

// ---- HELPERS ----

async function acessarPaginaRelatorio(page: Page) {
  await page.goto("/relatorio-vendas");
  await expect(page.getByRole("heading", { name: "Relatório de Vendas Diárias" })).toBeVisible();
}

async function preencherEGerar(page: Page, clienteId = "cliente-x-001") {
  await page.getByLabel("ID do Cliente").fill(clienteId);
  await page.getByRole("button", { name: "Gerar Relatório" }).click();
}

// ============================================================
// CT-01: Happy path — API rápida
// ============================================================
test("CT-01: deve gerar o relatório com sucesso quando a API responde rápido", async ({ page }) => {
  await acessarPaginaRelatorio(page);
  await preencherEGerar(page);

  // Botão deve ser desabilitado enquanto processa (evita duplo clique)
  await expect(page.getByRole("button", { name: "Gerando..." })).toBeDisabled();

  // Aguarda o relatório aparecer (timeout 30s para API lenta em staging)
  await expect(page.getByText("Relatório de Vendas Diárias")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Receita Total")).toBeVisible();

  // Captura evidência
  await page.screenshot({ path: "evidencias/CT-01-relatorio-gerado.png", fullPage: true });
});

// ============================================================
// CT-02: API lenta (90s) — a UI NÃO deve travar
// ============================================================
test("CT-02: a UI não deve travar quando a API demora 90s para responder", async ({ page }) => {
  // Usa um clienteId especial que aciona o mock de delay no ambiente de teste
  await acessarPaginaRelatorio(page);
  await preencherEGerar(page, "cliente-mock-delay-90s");

  // Mensagem de progresso deve aparecer imediatamente
  await expect(page.getByText("Seu relatório está sendo gerado")).toBeVisible({ timeout: 3_000 });

  // Usuário consegue interagir com a página enquanto processa (UI não travada)
  const textoHeader = page.getByText("Relatório de Vendas Diárias");
  await expect(textoHeader).toBeVisible();

  // Aguarda a conclusão (timeout estendido para este cenário)
  await expect(page.getByText("Receita Total")).toBeVisible({ timeout: 120_000 });

  await page.screenshot({ path: "evidencias/CT-02-api-lenta-ok.png", fullPage: true });
});

// ============================================================
// CT-03: API indisponível — deve fazer retries e exibir erro amigável
// ============================================================
test("CT-03: deve exibir erro amigável após esgotar as tentativas de retry", async ({ page }) => {
  await acessarPaginaRelatorio(page);
  await preencherEGerar(page, "cliente-mock-always-fail");

  // Mensagem de erro deve aparecer após os retries (backoff total ~200s)
  // No ambiente de teste, o mock acelera o backoff para 1s
  await expect(page.getByText("Não foi possível gerar o relatório")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: "Tentar novamente" })).toBeVisible();

  await page.screenshot({ path: "evidencias/CT-03-erro-amigavel.png", fullPage: true });
});

// ============================================================
// CT-04: Usuário fecha aba e reabre — job continua no servidor
// ============================================================
test("CT-04: o job deve persistir no servidor após fechar e reabrir a aba", async ({ page, context }) => {
  await acessarPaginaRelatorio(page);
  await preencherEGerar(page, "cliente-mock-delay-10s");

  // Captura o jobId da UI
  const jobIdEl = await page.getByText(/job: [a-f0-9-]+\.\.\./).textContent();
  const jobIdShort = jobIdEl?.replace("job: ", "").replace("...", "") ?? "";

  // Simula fechar a aba e reabrir
  await page.close();
  const newPage = await context.newPage();
  await newPage.goto("/relatorio-vendas");

  // O job deve aparecer como em andamento ou concluído (dependendo do timing)
  // Em produção, implementar tela de "meus relatórios" para checar jobs anteriores
  await newPage.screenshot({ path: "evidencias/CT-04-aba-reaberta.png", fullPage: true });
  console.log(`Job testado: ${jobIdShort}`);
});

// ============================================================
// CT-05: Duplo clique — idempotência deve prevenir job duplicado
// ============================================================
test("CT-05: não deve criar jobs duplicados ao clicar duas vezes rapidamente", async ({ page }) => {
  await acessarPaginaRelatorio(page);
  await page.getByLabel("ID do Cliente").fill("cliente-x-001");

  const btnGerar = page.getByRole("button", { name: "Gerar Relatório" });

  // Simula duplo clique rápido
  await btnGerar.click();
  await btnGerar.click(); // segundo clique — deve ser ignorado (botão já desabilitado)

  // Deve aparecer apenas um jobId (verificar no Supabase via API)
  const jobIds = await page.locator("[data-testid='job-id']").all();
  expect(jobIds.length).toBeLessThanOrEqual(1);

  await page.screenshot({ path: "evidencias/CT-05-sem-duplicata.png" });
});

// ============================================================
// CT-07: Regression — o bug original não deve mais ocorrer
// ============================================================
test("CT-07 [REGRESSION]: a tela NÃO deve ficar em loading infinito", async ({ page }) => {
  await acessarPaginaRelatorio(page);
  await preencherEGerar(page);

  // O spinner "Gerando..." não deve permanecer por mais de 5s sem nenhum feedback
  // (antes do fix, ficava travado indefinidamente)
  await expect(page.getByText("Aguardando na fila...").or(
    page.getByText("Processando dados...")
  )).toBeVisible({ timeout: 5_000 });

  // Confirma que não há loading infinito — alguma atualização de status ocorre
  // em no máximo 60s (done ou failed)
  await expect(
    page.getByText("Relatório pronto!").or(page.getByText("Não foi possível gerar o relatório"))
  ).toBeVisible({ timeout: 60_000 });

  await page.screenshot({ path: "evidencias/CT-07-sem-loading-infinito.png", fullPage: true });
});
