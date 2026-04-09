# Debt/Repay Ledger Entries Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add debt/repay natural-language commands that write ledger rows into the existing Google Sheet without changing the sheet schema.

**Architecture:** Introduce a small local debt-transfer parser that recognizes debt/repay cues and room-member mentions, extend the intent shape to carry debt-specific metadata, and branch the sheet reply flow so debt/repay rows produce one-sided positive balances for the recipient member. Existing expense and all-room settlement paths remain intact.

**Tech Stack:** TypeScript, Next.js server runtime, Vitest

---

### Task 1: Add failing tests for debt/repay detection

**Files:**
- Create: `tests/parseDebtTransferMessage.test.ts`
- Modify: `tests/shouldAttemptExpenseAction.test.ts`
- Modify: `tests/normalizeExpenseSheetIntent.test.ts`

- [ ] **Step 1: Write failing tests for valid debt/repay variants**
- [ ] **Step 2: Run `npm test -- tests/parseDebtTransferMessage.test.ts tests/shouldAttemptExpenseAction.test.ts tests/normalizeExpenseSheetIntent.test.ts` and confirm failures**
- [ ] **Step 3: Implement the minimal parser/type changes**
- [ ] **Step 4: Re-run the targeted tests and confirm they pass**

### Task 2: Add failing tests for ledger mapping

**Files:**
- Modify: `tests/getDiscordExpenseSheetReplyContent.test.ts`
- Modify: `tests/expenseSettlement.test.ts`

- [ ] **Step 1: Write failing tests for `debt` and `repay` row creation plus invalid debt inputs**
- [ ] **Step 2: Run `npm test -- tests/getDiscordExpenseSheetReplyContent.test.ts tests/expenseSettlement.test.ts` and confirm failures**
- [ ] **Step 3: Implement the minimal reply-flow and settlement changes**
- [ ] **Step 4: Re-run the targeted tests and confirm they pass**

### Task 3: Update intent and reply flow

**Files:**
- Create: `lib/parseDebtTransferMessage.ts`
- Modify: `lib/expenseSheetIntent.ts`
- Modify: `lib/getDiscordExpenseSheetReplyContent.ts`
- Modify: `lib/expenseSettlement.ts`

- [ ] **Step 1: Extend the intent shape with debt-specific fields**
- [ ] **Step 2: Add deterministic parsing for debt/repay cues and member mentions**
- [ ] **Step 3: Map matched debt/repay messages into ledger rows with recipient-only positive balances**
- [ ] **Step 4: Keep all-room split and normal expense behavior unchanged**

### Task 4: Verify the whole feature

**Files:**
- Modify: `lib/parseDebtTransferMessage.ts`
- Modify: `lib/expenseSheetIntent.ts`
- Modify: `lib/getDiscordExpenseSheetReplyContent.ts`
- Modify: `lib/expenseSettlement.ts`
- Test: `tests/*.test.ts`

- [ ] **Step 1: Run `npm test`**
- [ ] **Step 2: Review regressions in existing expense/update/delete paths**
- [ ] **Step 3: Summarize any assumptions or limitations left for future work**
