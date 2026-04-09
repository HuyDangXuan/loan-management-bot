# Debt/Repay Ledger Entry Design

## Summary

Bot can already add expense rows and all-room settlements to the shared ledger sheet. This design adds a second natural-language flow for debt-style entries such as `Huy nợ Vũ 100k` and `Huy trả cho Vũ 100k` without changing the sheet schema.

The goal is to keep the ledger readable and backward-compatible while allowing debt and repay events to be logged as first-class rows.

## Behavior

- Reuse the existing ledger sheet and current headers.
- Treat debt-style messages as a separate entry type from expense rows.
- Support two debt entry kinds:
  - `debt`: `A nợ B 100k`, `A còn nợ B 100k`, `A thiếu B 100k`, `A mắc nợ B 100k`
  - `repay`: `A trả B 100k`, `A trả cho B 100k`, `A chuyển B 100k`, `A chuyển cho B 100k`, `A hoàn tiền cho B 100k`
- Require both `A` and `B` to be explicit in the message and both to belong to the configured room.
- Do not infer subject/object from the Discord sender.

## Ledger Mapping

- Keep writing into the same row shape used today.
- Map debt/repay rows as:
  - `item`: `debt` or `repay`
  - `paidBy`: the recipient member (`B`)
  - `note`: `A -> B`
  - `splitMode`: `none`
  - `balances`: only the recipient member gets `+amount`; all others remain blank
- Example:
  - `Huy nợ Vũ 100k` => `paidBy=Vu`, `item=debt`, `note=Huy -> Vu`, `Vu=100000`
  - `Huy trả Vũ 100k` => `paidBy=Vu`, `item=repay`, `note=Huy -> Vu`, `Vu=100000`

## Detection Strategy

- Use a local parser first for debt/repay cues plus room-member mentions, because this needs stronger guarantees than a prompt-only approach.
- Keep Gemini intent inference in place for normal expense/update/delete flows and as a helper for broader natural language coverage.
- If a message clearly looks like debt/repay but is missing one member or references someone outside the room, return `noop` with a clear reason instead of guessing.

## Safety / Compatibility

- Existing expense messages, all-room split flows, and row update/delete behavior must remain unchanged.
- The new flow only applies when debt/repay cues are present.
- The feature should be test-driven with coverage for valid variants, invalid debt inputs, and regressions on old expense commands.
