# Notificações push com o app fechado — configuração

O app já registra a inscrição de push de cada usuário em `push_subs/{uid}`.
Um robô no **GitHub Actions** (`.github/workflows/reminders.yml`) roda de hora em
hora e envia os lembretes usando `scripts/send-reminders.js`.

Falta apenas cadastrar **4 secrets** no GitHub (uma vez). Nada disso vai para o código.

## 1. Chaves VAPID
Já foram geradas e estão em `Downloads/vapid-keys.txt` (no seu notebook).
- A **pública** já está no app (`index.html`).
- A **privada** vai virar um secret (abaixo).

## 2. Conta de serviço do Firebase (para o robô ler as inscrições com segurança)
1. Firebase Console → ⚙️ (Configurações do projeto) → aba **Contas de serviço**.
2. Clique em **Gerar nova chave privada** → confirme → baixa um arquivo `.json`.
3. Abra esse `.json`, selecione **todo** o conteúdo e copie.

## 3. Cadastrar os secrets no GitHub
No repositório `samdouglas99/body-tracker` → **Settings** → **Secrets and variables**
→ **Actions** → **New repository secret**. Crie estes 4:

| Nome | Valor |
|------|-------|
| `VAPID_PUBLIC` | a chave **pública** do `vapid-keys.txt` |
| `VAPID_PRIVATE` | a chave **privada** do `vapid-keys.txt` |
| `VAPID_SUBJECT` | `mailto:samdouglas1208@gmail.com` |
| `FIREBASE_SERVICE_ACCOUNT` | cole **todo** o conteúdo do `.json` da conta de serviço |

## 4. Testar
1. No app (no **celular**, logado), abra **⚙️ → Notificações → Ativar notificações** e aceite.
   - **iPhone:** primeiro **Adicione o app à Tela de Início** (Compartilhar → Adicionar à Tela de Início) e abra por lá. No iOS o push só funciona como app instalado (iOS 16.4+).
2. No GitHub → aba **Actions** → workflow **"Lembretes push"** → **Run workflow** (disparo manual).
3. Se estiver no horário de um lembrete (ver `SLOTS` em `send-reminders.js`), a notificação chega mesmo com o app fechado.

## Ajustar horários/mensagens
Edite o objeto `SLOTS` em `scripts/send-reminders.js` (hora local → título/mensagem)
e faça commit. O robô passa a usar os novos horários automaticamente.

> Observação: o agendamento do GitHub Actions roda no horário **UTC** e pode
> atrasar alguns minutos. O script converte para o fuso de cada usuário
> (`tzOffset`, salvo na inscrição), então os lembretes respeitam o horário local.
